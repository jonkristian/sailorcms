import { fail, error, redirect } from '@sveltejs/kit';
import { db, users, accounts } from 'sailorcms/core/db/index.server';
import { eq, and } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import {
  parsePreferences,
  mergePreferences,
  resolvePreferences,
  type UserPreferences
} from 'sailorcms/core/utils/user-preferences';
import {
  getAccountPurposes,
  getAvailableMailOAuthRequirements,
  isMailConfigured
} from 'sailorcms/utils/mail/server';
import { getAccountProviderEmail } from 'sailorcms/core/utils/oauth-account.server';
import { getConfiguredSocialProviders, KNOWN_SOCIAL_PROVIDERS } from 'sailorcms/core/auth.server';

export const load = async ({ locals }: { locals: App.Locals }) => {
  // Authentication handled by hooks

  const user = await db.query.users.findFirst({
    where: eq(users.id, locals.user!.id)
  });

  if (!user) {
    throw redirect(303, '/sailor/auth/login');
  }

  const myAccounts = await db.query.accounts.findMany({
    where: eq(accounts.user_id, locals.user!.id)
  });

  const hasCredentialAccount = myAccounts.some((a: any) => a.provider_id === 'credential');

  // OAuth account rows for this user, with computed purposes (signIn vs mail).
  // The OAuth section in the UI iterates this directly — no provider-specific
  // branching in the page.
  const oauthAccounts = myAccounts
    .filter((a: any) => a.provider_id !== 'credential')
    .map((a: any) => ({
      ...a,
      purposes: getAccountPurposes(a),
      providerEmail: getAccountProviderEmail(a.id_token)
    }));

  // Per-provider scope index for this user, used below to compute what's
  // still grantable. Per-user, not system-wide: another admin's linked account
  // doesn't hide the CTA here, since each admin can link their own.
  const allLinkedScopesByProvider = new Map<string, Set<string>>();
  for (const acc of myAccounts) {
    const a = acc as any;
    if (a.provider_id === 'credential') continue;
    const set = allLinkedScopesByProvider.get(a.provider_id) ?? new Set<string>();
    (a.scope || '')
      .split(/[\s,]+/)
      .filter(Boolean)
      .forEach((s: string) => set.add(s));
    allLinkedScopesByProvider.set(a.provider_id, set);
  }

  // One "Connect…" menu item per env-configured social provider that still
  // has something to grant for this user. Mail scope is requested when the
  // provider has a mail driver and the user is missing that scope — the same
  // link flow then covers sign-in too, so we list the purposes that this
  // particular link action would newly unlock (sign-in, mail, or both).
  const configuredSocialProviders = getConfiguredSocialProviders();
  // Providers Sailor knows about but lacks env credentials for — drives the
  // "set X env vars to enable Y" hint when the connect menu would otherwise
  // be empty.
  const unconfiguredProviders = KNOWN_SOCIAL_PROVIDERS.filter(
    (p) => !configuredSocialProviders.includes(p)
  );

  const mailReqByProvider = new Map(
    getAvailableMailOAuthRequirements().map((r) => [r.providerId, r.scope])
  );
  const connectableProviders = configuredSocialProviders
    .map((providerId) => {
      const linkedScopes = allLinkedScopesByProvider.get(providerId);
      const mailScope = mailReqByProvider.get(providerId) ?? null;
      const isLinked = !!linkedScopes && linkedScopes.size > 0;
      const hasMailScope = !!mailScope && (linkedScopes?.has(mailScope) ?? false);

      const grantsSignIn = !isLinked;
      const grantsMail = !!mailScope && !hasMailScope;
      if (!grantsSignIn && !grantsMail) return null;

      return {
        providerId,
        scope: mailScope ?? '',
        purposes: { signIn: grantsSignIn, mail: grantsMail }
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role || 'user',
      image: user.image,
      email_verified: user.email_verified,
      preferences: resolvePreferences((user as any).preferences),
      created_at: user.created_at,
      updated_at: user.updated_at
    },
    oauthAccounts,
    hasCredentialAccount,
    connectableProviders,
    unconfiguredProviders,
    mailConfigured: await isMailConfigured()
  };
};

export const actions = {
  update: async ({ request, locals }: { request: Request; locals: App.Locals }) => {
    if (!locals.user) {
      throw error(401, 'Unauthorized');
    }

    const formData = await request.formData();
    const name = formData.get('name') as string;
    const currentPassword = formData.get('currentPassword') as string;
    const newPassword = formData.get('newPassword') as string;
    const confirmPassword = formData.get('confirmPassword') as string;
    const language = formData.get('language') as string | null;
    const dateFormat = formData.get('date_format') as string | null;

    // Basic validation
    if (!name || name.trim().length === 0) {
      return fail(400, { error: 'Name is required' });
    }

    // Password validation
    if (newPassword || confirmPassword || currentPassword) {
      if (!currentPassword || !newPassword || !confirmPassword) {
        return fail(400, {
          error: 'Password change requires current password, new password, and confirmation'
        });
      }
      if (newPassword !== confirmPassword) {
        return fail(400, { error: 'New password and confirmation must match' });
      }
    }

    try {
      const updateData: { name: string; preferences?: string } = {
        name: name.trim()
      };

      // Merge preference patch into the existing JSON blob — additive so future
      // preferences (theme, density, etc.) survive partial saves.
      const existing = await db.query.users.findFirst({
        where: eq(users.id, locals.user.id),
        columns: { preferences: true } as any
      });
      const currentPrefs = parsePreferences((existing as any)?.preferences);
      const patch: Partial<UserPreferences> = {};
      if (typeof language === 'string' && language.length > 0) {
        patch.language = language;
      }
      if (typeof dateFormat === 'string' && dateFormat.length > 0) {
        patch.date_format = dateFormat;
      }
      if (Object.keys(patch).length > 0) {
        updateData.preferences = JSON.stringify(mergePreferences(currentPrefs, patch));
      }

      // Handle password change if provided
      if (currentPassword && newPassword) {
        // Get current user's credential account
        const credentialAccount = await db.query.accounts.findFirst({
          where: and(eq(accounts.user_id, locals.user.id), eq(accounts.provider_id, 'credential'))
        });

        if (!credentialAccount || !credentialAccount.password) {
          return fail(400, { error: 'Password authentication not available for this account' });
        }

        // Verify current password
        const isCurrentPasswordValid = await bcrypt.compare(
          currentPassword,
          credentialAccount.password
        );
        if (!isCurrentPasswordValid) {
          return fail(400, { error: 'Your current password is incorrect' });
        }

        // Hash new password and update the credential account
        const hashedNewPassword = await bcrypt.hash(newPassword, 12);
        await db
          .update(accounts)
          .set({ password: hashedNewPassword })
          .where(eq(accounts.id, credentialAccount.id));
      }

      await db.update(users).set(updateData).where(eq(users.id, locals.user.id));

      return { success: true, message: 'Account updated successfully' };
    } catch (err) {
      return fail(500, { error: 'Failed to update user' });
    }
  }
};
