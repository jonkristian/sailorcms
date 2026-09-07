import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { admin, captcha } from 'better-auth/plugins';
import { createAccessControl } from 'better-auth/plugins/access';
import { defaultStatements } from 'better-auth/plugins/admin/access';
import { getRequestEvent } from '$app/server';
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { db } from './db/index.server';
import { users, sessions, accounts, verifications } from './db/index.server';
import { getSettings } from './settings';
import { building } from '$app/environment';
import { SystemSettingsService } from './services/settings.server';
import { sendMail } from 'sailorcms/utils/mail/server';
import {
  passwordResetTemplate,
  emailVerificationTemplate
} from 'sailorcms/utils/mail/templates/auth';
import { m } from '$sailor/i18n';
import { eq } from 'drizzle-orm';

// Create access control configuration based on settings
function createAccessControlConfig() {
  // Always use defaults - dynamic settings will be loaded at runtime via hooks
  const statement = {
    ...defaultStatements,
    content: ['create', 'read', 'update', 'delete'],
    users: ['create', 'read', 'update', 'delete'],
    settings: ['read', 'update'],
    files: ['create', 'read', 'update', 'delete']
  } as const;

  const ac = createAccessControl(statement);

  return {
    ac,
    roles: {
      user: ac.newRole({ content: ['read'], files: ['read'] }),
      editor: ac.newRole({
        content: ['create', 'read', 'update', 'delete'],
        files: ['create', 'read', 'update', 'delete']
      }),
      admin: ac.newRole({
        content: ['create', 'read', 'update', 'delete'],
        users: ['create', 'read', 'update', 'delete'],
        settings: ['read', 'update'],
        files: ['create', 'read', 'update', 'delete']
      })
    }
  };
}

// Get auth settings from defaults
function getAuthSettings() {
  return {
    defaultRole: 'user',
    adminRoles: ['admin', 'editor']
  };
}

const baseURL = publicEnv.PUBLIC_BASE_URL || 'http://localhost:5173';

/**
 * Built on first use, not at import.
 *
 * `drizzleAdapter` reads `db._.schema` while it is being constructed (since
 * `@better-auth/drizzle-adapter` 1.7.2), and `db` is a lazy proxy that throws
 * until `initializeDatabase()` has run. Constructing at module scope therefore
 * threw during `import`, before anything had a chance to warm the connection —
 * and since `sailor-hooks.ts` imports this module, that took the whole app down
 * at boot.
 *
 * Deferring is the fix rather than making the db proxy tolerate `_`: the
 * adapter builds its relation map once, at construction, so handing it an
 * `undefined` schema would leave that map permanently empty and break relation
 * joins quietly instead of loudly.
 */
function createAuth() {
  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    basePath: '/sailor/api/auth',
    baseURL,
    trustedOrigins: [baseURL],
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema: {
        user: users,
        session: sessions,
        account: accounts,
        verification: verifications
      }
    }),
    user: {
      fields: {
        emailVerified: 'email_verified',
        banReason: 'ban_reason',
        banExpires: 'ban_expires',
        createdAt: 'created_at',
        updatedAt: 'updated_at'
      } as any, // Type assertion for admin plugin fields
      // Custom user columns Better Auth wouldn't otherwise know about. Without
      // this, `auth.api.getSession()` strips these from the returned user
      // object and our session-derived locals.user.preferences stays undefined.
      additionalFields: {
        preferences: {
          type: 'string',
          required: false,
          input: false // Updated via our own account form, not Better Auth's signup/update API.
        }
      }
    },
    account: {
      fields: {
        userId: 'user_id',
        accountId: 'account_id',
        providerId: 'provider_id',
        accessToken: 'access_token',
        refreshToken: 'refresh_token',
        idToken: 'id_token',
        accessTokenExpiresAt: 'access_token_expires_at',
        refreshTokenExpiresAt: 'refresh_token_expires_at',
        scope: 'scope',
        createdAt: 'created_at',
        updatedAt: 'updated_at'
      },
      // Permits linking a social account whose email differs from the
      // signed-in user's email. Required for the "Connect Gmail for sending"
      // flow — the Gmail mailbox you want to send from is often a different
      // address than your CMS login email.
      //
      // `trustedProviders` is separate from `allowDifferentEmails`: Better Auth's
      // link callback (api/routes/callback.mjs:104) rejects the link unless the
      // provider is trusted OR the returned `userInfo.emailVerified` is true.
      // GitHub's userinfo doesn't reliably surface a verified-email flag, so
      // without trusting it the link fails with `unable_to_link_account` even
      // when emails-may-differ is on. Google is included for parity.
      accountLinking: {
        enabled: true,
        allowDifferentEmails: true,
        trustedProviders: ['github', 'google']
      }
    },
    session: {
      fields: {
        userId: 'user_id',
        expiresAt: 'expires_at',
        ipAddress: 'ip_address',
        userAgent: 'user_agent',
        impersonatedBy: 'impersonated_by',
        createdAt: 'created_at',
        updatedAt: 'updated_at'
      } as any // Type assertion for admin plugin fields
    },
    verification: {
      fields: {
        expiresAt: 'expires_at',
        createdAt: 'created_at',
        updatedAt: 'updated_at'
      }
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: env.EMAIL_VERIFICATION === 'true',
      sendResetPassword: async ({ user, url }: { user: { email: string }; url: string }) => {
        await sendMail({
          to: user.email,
          ...passwordResetTemplate({
            url,
            subject: m.auth_email_reset_subject(),
            heading: m.auth_email_reset_heading(),
            intro: m.auth_email_reset_intro(),
            cta: m.auth_email_reset_cta(),
            fallbackLine: m.auth_email_fallback_line()
          })
        });
      }
    },
    emailVerification: {
      sendOnSignUp: env.EMAIL_VERIFICATION === 'true',
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }: { user: { email: string }; url: string }) => {
        await sendMail({
          to: user.email,
          ...emailVerificationTemplate({
            url,
            subject: m.auth_email_verify_subject(),
            heading: m.auth_email_verify_heading(),
            intro: m.auth_email_verify_intro(),
            cta: m.auth_email_verify_cta(),
            fallbackLine: m.auth_email_fallback_line()
          })
        });
      }
    },
    socialProviders: {
      ...(env.GITHUB_CLIENT_ID &&
        env.GITHUB_CLIENT_SECRET && {
          github: {
            clientId: env.GITHUB_CLIENT_ID,
            clientSecret: env.GITHUB_CLIENT_SECRET
          }
        }),
      // accessType + prompt are required for Google to mint a refresh_token —
      // without them, access_tokens expire after ~1h with no refresh path, so
      // anything using the stored token (e.g. the Gmail mail driver) would die.
      ...(env.GOOGLE_CLIENT_ID &&
        env.GOOGLE_CLIENT_SECRET && {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
            accessType: 'offline',
            prompt: 'select_account consent'
          }
        })
    },
    plugins: [
      admin({
        ...getAuthSettings(),
        ...createAccessControlConfig(),
        // The plugin contributes its own columns, and `user.fields` /
        // `session.fields` above do not reach them — a plugin's remapping goes
        // through its own `schema`. Without this the plugin addresses
        // `banReason`, `banExpires` and `impersonatedBy` while the tables
        // declare snake_case, so ban and impersonation read and write columns
        // that do not exist. better-auth 1.7.2 added a schema validator that
        // makes it fatal at boot; before that it failed quietly, only when
        // those features were used.
        schema: {
          user: {
            fields: {
              banReason: 'ban_reason',
              banExpires: 'ban_expires'
            }
          },
          session: {
            fields: {
              impersonatedBy: 'impersonated_by'
            }
          }
        }
      }),
      // Only register when both halves are configured. If `TURNSTILE_SECRET_KEY`
      // were set without `PUBLIC_TURNSTILE_SITE_KEY`, the server would require a
      // token but the client widget wouldn't render to produce one — bricking login.
      ...(env.TURNSTILE_SECRET_KEY && publicEnv.PUBLIC_TURNSTILE_SITE_KEY
        ? [
            captcha({
              provider: 'cloudflare-turnstile',
              secretKey: env.TURNSTILE_SECRET_KEY
            })
          ]
        : []),
      // Must be last: better-auth requires the cookie integration plugin at the
      // end of the array so cookies set by earlier plugins' `hooks.after` are
      // forwarded to SvelteKit's cookie store.
      sveltekitCookies(getRequestEvent)
    ],
    hooks: {
      user: {
        beforeCreate: async (user: any) => {
          // Check if registration is enabled
          const registrationEnabled = await SystemSettingsService.isRegistrationEnabled();

          if (!registrationEnabled) {
            // Allow creation only if this is an existing user signing in via OAuth
            // or if there are no users in the system (initial admin setup)
            const existingUsers = await db.select().from(users).limit(1);

            if (existingUsers.length > 0) {
              // Check if user already exists (OAuth signin vs new registration)
              const existingUser = await db
                .select()
                .from(users)
                .where(eq(users.email, user.email))
                .limit(1);

              if (existingUser.length === 0) {
                // This is a new user registration when registration is disabled
                throw new Error('User registration is disabled');
              }
            }
          }

          return user;
        }
      }
    } as any // Type assertion for hooks
  });
}

let authInstance: ReturnType<typeof createAuth> | null = null;

/**
 * Same shape and import as before — the laziness is invisible to callers, which
 * is why this is a proxy rather than a `getAuth()` that every call site would
 * have to adopt. Mirrors how `db` itself is exported.
 */
export const auth = new Proxy({} as ReturnType<typeof createAuth>, {
  get(_target, prop, receiver) {
    authInstance ??= createAuth();
    return Reflect.get(authInstance as object, prop, receiver);
  },
  has(_target, prop) {
    authInstance ??= createAuth();
    return Reflect.has(authInstance as object, prop);
  }
});

/**
 * All social providers Sailor knows how to wire up. Used together with
 * `getConfiguredSocialProviders()` to drive the /sailor/account discoverability
 * hint ("set GITHUB_CLIENT_ID/SECRET to enable GitHub…") — the diff between
 * known and configured is exactly the set of providers still gated on env.
 */
export const KNOWN_SOCIAL_PROVIDERS = ['github', 'google'] as const;

/**
 * Social provider IDs that are env-configured for OAuth. Mirrors the
 * `socialProviders` block above — both check the same env pairs, so adding a
 * provider there means adding it here AND to `KNOWN_SOCIAL_PROVIDERS`.
 * Surfaced via /sailor/account so the "Connect…" menu only offers providers
 * whose link flow can actually complete.
 */
export function getConfiguredSocialProviders(): string[] {
  const providers: string[] = [];
  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) providers.push('github');
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) providers.push('google');
  return providers;
}
