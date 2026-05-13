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
  isMailDriverConfigured,
  sendMail
} from 'sailorcms/utils/mail/server';
import { testEmailTemplate } from 'sailorcms/utils/mail/templates/system';
import {
  countFailedMailEvents,
  listMailEvents,
  replayMailEvent
} from 'sailorcms/core/services/mail-events.server';

export const load = async ({ locals, url }: { locals: App.Locals; url: URL }) => {
  if (!locals.user) throw error(401, 'Unauthorized');
  // Mail event payloads carry PII (password-reset URLs, verification links,
  // form submissions), and the driver/sender config is system-wide — gate
  // viewing on the same `settings` permission the other settings pages use,
  // i.e. admin role by default.
  if (!(await locals.security.hasPermission('read', 'settings'))) {
    throw error(403, 'Access denied');
  }

  const activeDriver =
    (await SystemSettingsService.getSetting('mail.driver').catch(() => null)) ?? 'smtp';
  // Hide drivers whose env prerequisites aren't met (e.g. Gmail without
  // GOOGLE_CLIENT_ID/SECRET). The currently active driver is always kept in
  // the list so the admin sees what's set even after env vars get removed —
  // they can switch away from it but won't be surprised by an empty select.
  const driverNames = getMailDriverNames().filter(
    (n) => isMailDriverConfigured(n) || n === activeDriver
  );
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

  // What the deployment provides for mail, sourced from env at startup by
  // SystemSettingsService.initializeFromEnv(). Surfaced read-only on the
  // page so the admin doesn't have to open .env to know what's wired.
  // Only `source: 'env'` rows are picked — DB writes from the UI itself
  // (mail.driver, mail.sender_account_id) get `source: 'user'` and are
  // skipped here.
  const mailCategorySettings = await SystemSettingsService.getSettingsByCategory('mail');
  const envSettings: Record<string, string | boolean> = {};
  for (const row of mailCategorySettings) {
    if (row.source !== 'env') continue;
    try {
      envSettings[row.key] = JSON.parse(row.value);
    } catch {
      envSettings[row.key] = row.value;
    }
  }

  // Paginated event list. `failedCount` is unscoped (every failed row across
  // the table) so the badge reflects the outbox total even when the failed
  // rows are off the current page. URL params (`page`, `pageSize`) match the
  // shared Pagination component's contract — no extra wiring needed.
  const eventsPage = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const eventsPageSize = Math.max(
    1,
    Math.min(100, parseInt(url.searchParams.get('pageSize') || '25'))
  );
  const events = await listMailEvents({ page: eventsPage, pageSize: eventsPageSize });
  const failedCount = await countFailedMailEvents();

  return {
    driverNames,
    activeDriver,
    senderAccountId,
    candidatesByDriver,
    mailConfigured: await isMailConfigured(),
    envSettings,
    events,
    failedCount
  };
};

export const actions = {
  save: async ({ request, locals }: { request: Request; locals: App.Locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');
    if (!(await locals.security.hasPermission('update', 'settings'))) {
      throw error(403, 'Access denied');
    }

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
    if (!(await locals.security.hasPermission('update', 'settings'))) {
      throw error(403, 'Access denied');
    }
    const result = await sendMail(
      { to: locals.user.email, ...testEmailTemplate() },
      { actorUserId: locals.user.id }
    );
    if (result.ok) return { success: true };
    return fail(500, { error: result.error });
  },

  retry: async ({ request, locals }: { request: Request; locals: App.Locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');
    // Retry replays the stored body to its original recipient — same impact
    // surface as the test action, gate identically.
    if (!(await locals.security.hasPermission('update', 'settings'))) {
      throw error(403, 'Access denied');
    }

    const formData = await request.formData();
    const id = String(formData.get('id') ?? '');
    if (!id) return fail(400, { error: 'Missing event id' });

    const result = await replayMailEvent(id);
    if (!result.ok) return fail(500, { error: result.error });
    return { success: true };
  }
};
