import { error, fail } from '@sveltejs/kit';
import { eq, and, like } from 'drizzle-orm';
import { db, accounts, users } from 'sailorcms/core/db/index.server';
import { SystemSettingsService } from 'sailorcms/core/services/settings.server';
import { getAccountProviderEmail } from 'sailorcms/core/utils/oauth-account.server';
import {
  clearMailDriverCache,
  getMailDriverNames,
  getMailOAuthRequirementFor,
  isMailConfigured,
  sendMail
} from 'sailorcms/utils/mail/server';
import { testEmailTemplate } from 'sailorcms/utils/mail/templates/system';

export const load = async ({ locals }: { locals: App.Locals }) => {
  if (!locals.user) throw error(401, 'Unauthorized');

  const driverNames = getMailDriverNames();
  const activeDriver =
    (await SystemSettingsService.getSetting('mail.driver').catch(() => null)) ?? 'smtp';
  const senderAccountId =
    (await SystemSettingsService.getSetting('mail.sender_account_id').catch(() => null)) ?? '';

  // For each driver that needs an OAuth-linked account, list candidate accounts
  // system-wide (with the linked user's name/email so the admin can tell whose
  // Gmail will send). Future drivers (Outlook etc.) appear here automatically
  // once they declare their oauthRequirement.
  const candidatesByDriver: Record<string, Array<{ id: string; userLabel: string }>> = {};
  for (const name of driverNames) {
    const req = getMailOAuthRequirementFor(name);
    if (!req) continue;
    const rows = await db
      .select({
        id: accounts.id,
        userName: users.name,
        userEmail: users.email,
        idToken: accounts.id_token
      })
      .from(accounts)
      .innerJoin(users, eq(accounts.user_id, users.id))
      .where(and(eq(accounts.provider_id, req.providerId), like(accounts.scope, `%${req.scope}%`)));
    candidatesByDriver[name] = rows.map((r: any) => {
      const linkedUser = r.userName ? `${r.userName} (${r.userEmail})` : r.userEmail;
      const providerEmail = getAccountProviderEmail(r.idToken);
      return {
        id: r.id,
        userLabel: providerEmail ? `${linkedUser} — ${providerEmail}` : linkedUser
      };
    });
  }

  return {
    driverNames,
    activeDriver,
    senderAccountId,
    candidatesByDriver,
    mailConfigured: await isMailConfigured()
  };
};

export const actions = {
  save: async ({ request, locals }: { request: Request; locals: App.Locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    const formData = await request.formData();
    const driver = String(formData.get('driver') ?? '').toLowerCase();
    const senderAccountId = String(formData.get('sender_account_id') ?? '');

    if (!getMailDriverNames().includes(driver)) {
      return fail(400, { error: `Unknown driver: ${driver}` });
    }

    await SystemSettingsService.setSetting('mail.driver', driver, 'mail', 'Active mail driver');

    if (getMailOAuthRequirementFor(driver)) {
      await SystemSettingsService.setSetting(
        'mail.sender_account_id',
        senderAccountId,
        'mail',
        'Active sender account id (for OAuth-based drivers)'
      );
    } else {
      // Non-OAuth driver — clear any stale sender pointer so it doesn't bleed
      // into a future driver change.
      await SystemSettingsService.deleteSetting('mail.sender_account_id').catch(() => {});
    }

    clearMailDriverCache();

    return { success: true };
  },

  test: async ({ locals }: { locals: App.Locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');
    const result = await sendMail({ to: locals.user.email, ...testEmailTemplate() });
    if (result.ok) return { success: true };
    return fail(500, { error: result.error });
  }
};
