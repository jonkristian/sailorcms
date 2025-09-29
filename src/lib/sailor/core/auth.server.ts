import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { admin } from 'better-auth/plugins';
import { createAccessControl } from 'better-auth/plugins/access';
import { defaultStatements, adminAc } from 'better-auth/plugins/admin/access';
import { getRequestEvent } from '$app/server';
import { env } from '$env/dynamic/private';
import { db } from './db/index.server';
import { users, sessions, accounts, verifications } from './db/index.server';
import { getSettings } from './settings';
import { building } from '$app/environment';
import { SystemSettingsService } from './services/settings.server';
import { eq } from 'drizzle-orm';

// Create access control configuration based on settings
async function createAccessControlConfig() {
  if (building) {
    // Use basic defaults during build, merging with defaults
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
        editor: ac.newRole({ content: ['create', 'read', 'update', 'delete'], files: ['create', 'read', 'update', 'delete'] }),
        admin: ac.newRole({ content: ['create', 'read', 'update', 'delete'], users: ['create', 'read', 'update', 'delete'], settings: ['read', 'update'], files: ['create', 'read', 'update', 'delete'] })
      }
    };
  }

  try {
    const settings = await getSettings();
    const roleSettings = settings.roles || {};

    // Merge default statements with our custom resources
    const statement = {
      ...defaultStatements,
      content: ['create', 'read', 'update', 'delete'],
      users: ['create', 'read', 'update', 'delete'],
      settings: ['read', 'update'],
      files: ['create', 'read', 'update', 'delete']
    } as const;

    const ac = createAccessControl(statement);

    // Create roles from settings definitions with proper better-auth patterns
    const roles: Record<string, any> = {};

    if ((roleSettings as any).definitions) {
      // Create roles from settings definitions using ONLY the clean better-auth structure
      for (const [roleName, roleConfig] of Object.entries((roleSettings as any).definitions)) {
        if (roleConfig && typeof roleConfig === 'object' && 'permissions' in roleConfig) {
          // Extract ONLY the clean better-auth permissions, ignore legacy structure
          const cleanPermissions = (roleConfig as any).permissions;

          // Filter to only include better-auth style array permissions
          const betterAuthPermissions: Record<string, string[]> = {};

          // Initialize all resources with empty arrays
          const allResources = ['content', 'users', 'settings', 'files'];
          for (const resource of allResources) {
            betterAuthPermissions[resource] = [];
          }

          // Then populate with actual permissions
          for (const [resource, actions] of Object.entries(cleanPermissions)) {
            if (Array.isArray(actions)) {
              betterAuthPermissions[resource] = actions;
            }
          }

          // For admin role, merge with default admin permissions
          if (roleName === 'admin') {
            const adminPermissions = {
              ...adminAc.statements,
              ...betterAuthPermissions
            };
            roles[roleName] = ac.newRole(adminPermissions as any);
          } else {
            // For other roles, use clean permissions only
            roles[roleName] = ac.newRole(betterAuthPermissions as any);
          }
        }
      }
    }

    // Fallback roles if no definitions found (should not happen in normal operation)
    if (Object.keys(roles).length === 0) {
      console.warn('No role definitions found in settings, using fallback roles');
      roles.user = ac.newRole({
        content: ['read'],
        files: ['read']
      });
      roles.editor = ac.newRole({
        content: ['create', 'read', 'update', 'delete'],
        files: ['create', 'read', 'update', 'delete']
      });
      roles.admin = ac.newRole({
        content: ['create', 'read', 'update', 'delete'],
        users: ['create', 'read', 'update', 'delete'],
        settings: ['read', 'update'],
        files: ['create', 'read', 'update', 'delete']
      });
    }

    return { ac, roles };
  } catch (error) {
    console.warn('Failed to load role settings, using defaults:', error);
    // Fallback to defaults, merging with better-auth defaults
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
        editor: ac.newRole({ content: ['create', 'read', 'update', 'delete'], files: ['create', 'read', 'update', 'delete'] }),
        admin: ac.newRole({ content: ['create', 'read', 'update', 'delete'], users: ['create', 'read', 'update', 'delete'], settings: ['read', 'update'], files: ['create', 'read', 'update', 'delete'] })
      }
    };
  }
}

// Get auth settings safely (handles build-time when DB is unavailable)
async function getAuthSettings() {
  if (building) {
    // Use defaults during build when database is unavailable
    return {
      defaultRole: 'user',
      adminRoles: ['admin', 'editor']
    };
  }

  try {
    const settings = await getSettings();
    return {
      defaultRole: settings.roles?.defaultRole || 'user',
      adminRoles: settings.roles?.adminRoles || ['admin', 'editor']
    };
  } catch (error) {
    console.warn('Failed to load auth settings, using defaults:', error);
    return {
      defaultRole: 'user',
      adminRoles: ['admin', 'editor']
    };
  }
}

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  basePath: '/sailor/api/auth',
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
    } as any // Type assertion for admin plugin fields
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
    enabled: true
  },
  socialProviders: {
    ...(env.GITHUB_CLIENT_ID &&
      env.GITHUB_CLIENT_SECRET && {
      github: {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET
      }
    })
  },
  plugins: [
    sveltekitCookies(getRequestEvent),
    admin({
      ...await getAuthSettings(),
      ...(await createAccessControlConfig())
    })
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
