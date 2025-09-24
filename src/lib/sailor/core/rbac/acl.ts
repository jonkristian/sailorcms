/**
 * Access Control List (ACL) Factory
 * Reads role permissions from CMS settings for flexible permission management
 */

import type { RoleSettings, PermissionScope } from '$sailor/core/settings/types';
import { getSettings } from '$sailor/core/settings';
import { eq, or, and, inArray, sql, type SQL } from 'drizzle-orm';
import { log } from '../utils/logger';
import {
  DEFAULT_PROTECTED_ROUTES,
  mergeRouteProtections,
  type RouteProtection
} from './route-protection';
import type { Permission, ResourceType } from './types';
import { redirect, error } from '@sveltejs/kit';

export interface User {
  id: string;
  role?: string;
  [key: string]: any;
}

export interface Resource {
  id?: string;
  status?: string;
  author?: string;
  [key: string]: any;
}

export class ACL {
  private user: User | null | undefined;
  private roleSettings: RoleSettings;

  constructor(user: User | null | undefined) {
    this.user = user;
    this.roleSettings = this.getDefaultRoleSettings();
  }

  /**
   * Get the actual role settings from the database with caching
   */
  private static roleSettingsCache: { settings: RoleSettings; timestamp: number } | null = null;
  private static readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  private async getActualRoleSettings(): Promise<RoleSettings> {
    const now = Date.now();

    // Check cache first
    if (ACL.roleSettingsCache && now - ACL.roleSettingsCache.timestamp < ACL.CACHE_TTL) {
      return ACL.roleSettingsCache.settings;
    }

    try {
      const settings = await getSettings();
      const roleSettings = settings.roles || this.getDefaultRoleSettings();

      // Validate role settings structure
      if (!this.validateRoleSettings(roleSettings)) {
        log.error('Invalid role settings structure, using defaults');
        return this.getDefaultRoleSettings();
      }

      // Cache the settings
      ACL.roleSettingsCache = {
        settings: roleSettings,
        timestamp: now
      };

      return roleSettings;
    } catch (error) {
      log.warn('Failed to load role settings, using defaults', { error });
      return this.getDefaultRoleSettings();
    }
  }

  /**
   * Validate role settings structure
   */
  private validateRoleSettings(settings: any): boolean {
    if (!settings || typeof settings !== 'object') return false;
    if (!settings.definitions || typeof settings.definitions !== 'object') return false;
    if (!settings.defaultRole || typeof settings.defaultRole !== 'string') return false;
    if (!Array.isArray(settings.adminRoles)) return false;

    // Validate that default role exists in definitions
    if (!settings.definitions[settings.defaultRole]) return false;

    // Validate role definitions structure
    for (const [roleName, roleDefinition] of Object.entries(settings.definitions)) {
      if (!roleDefinition || typeof roleDefinition !== 'object') return false;
      if (
        !(roleDefinition as any).permissions ||
        typeof (roleDefinition as any).permissions !== 'object'
      )
        return false;
    }

    return true;
  }

  /**
   * Get default role settings if none are configured
   */
  private getDefaultRoleSettings(): RoleSettings {
    return {
      definitions: {
        user: {
          name: 'User',
          description: 'Basic authenticated user',
          permissions: {
            collection: {
              view: ['public', 'own'],
              create: true,
              update: ['own'],
              delete: ['own']
            },
            global: {
              view: true,
              create: true,
              update: true,
              delete: true
            },
            block: {
              view: true,
              create: true,
              update: true,
              delete: true
            },
            file: {
              view: true,
              create: true,
              update: true,
              delete: false
            },
            user: {
              view: false,
              create: false,
              update: ['own'],
              delete: false
            },
            settings: {
              view: false,
              create: false,
              update: false,
              delete: false
            }
          }
        },
        editor: {
          name: 'Editor',
          description: 'Can edit published content',
          permissions: {
            collection: {
              view: ['all'],
              create: true,
              update: ['published', 'draft', 'archived', 'own'],
              delete: ['published', 'draft', 'archived', 'own']
            },
            global: {
              view: true,
              create: true,
              update: true,
              delete: true
            },
            block: {
              view: true,
              create: true,
              update: true,
              delete: true
            },
            file: {
              view: true,
              create: true,
              update: true,
              delete: true
            },
            user: {
              view: false,
              create: false,
              update: ['own'],
              delete: false
            },
            settings: {
              view: false,
              create: false,
              update: false,
              delete: false
            }
          }
        },
        admin: {
          name: 'Administrator',
          description: 'Full access to everything',
          permissions: {
            collection: {
              view: ['all'],
              create: true,
              update: ['all'],
              delete: ['all']
            },
            global: {
              view: true,
              create: true,
              update: true,
              delete: true
            },
            block: {
              view: true,
              create: true,
              update: true,
              delete: true
            },
            file: {
              view: true,
              create: true,
              update: true,
              delete: true
            },
            user: {
              view: true,
              create: true,
              update: ['all'],
              delete: true
            },
            settings: {
              view: true,
              create: true,
              update: true,
              delete: true
            }
          }
        }
      },
      defaultRole: 'user',
      adminRoles: ['admin', 'editor']
    };
  }

  /**
   * Check if user has a specific role
   */
  hasRole(role: string): boolean {
    return this.user?.role === role;
  }

  /**
   * Check if user is admin (based on adminRoles setting)
   */
  async isAdmin(): Promise<boolean> {
    if (!this.user) return false;
    const roleSettings = await this.getActualRoleSettings();
    return roleSettings.adminRoles.includes(this.user.role || '');
  }

  /**
   * Check if user owns a resource
   */
  owns(resource: Resource): boolean {
    return this.user?.id === resource.author;
  }

  /**
   * Check if user has ANY permission for a resource type (useful for navigation)
   */
  async hasAnyPermission(resourceType: ResourceType, permission: Permission): Promise<boolean> {
    if (!this.user) return false;

    const roleSettings = await this.getActualRoleSettings();
    const userRole = this.user.role || roleSettings.defaultRole;
    const roleDefinition = roleSettings.definitions[userRole];

    if (!roleDefinition) return false;

    const resourcePermissions =
      roleDefinition.permissions[resourceType as keyof typeof roleDefinition.permissions];
    if (!resourcePermissions) return false;

    const permissionScope = resourcePermissions[permission];
    // Return true if permission exists (boolean true or array with scopes)
    return permissionScope === true || Array.isArray(permissionScope);
  }

  /**
   * Main permission check method
   */
  async can(
    permission: Permission,
    resourceType: ResourceType,
    resource?: Resource
  ): Promise<boolean> {
    // Not authenticated users can't do anything
    if (!this.user) return false;

    // Get actual role settings
    const roleSettings = await this.getActualRoleSettings();

    // Get user's role definition
    const userRole = this.user.role || roleSettings.defaultRole;
    const roleDefinition = roleSettings.definitions[userRole];

    if (!roleDefinition) {
      log.warn(`Role definition not found for role: ${userRole}`, { userRole });
      return false;
    }

    // Get permissions for the resource type
    const resourcePermissions =
      roleDefinition.permissions[resourceType as keyof typeof roleDefinition.permissions];
    if (!resourcePermissions) {
      log.warn(`Resource type not found in permissions: ${resourceType}`, {
        resourceType,
        userRole
      });
      return false;
    }

    // Check the specific permission
    const permissionScope = resourcePermissions[permission];
    if (permissionScope === undefined) {
      return false;
    }

    // Handle boolean permissions (simple true/false)
    if (typeof permissionScope === 'boolean') {
      return permissionScope;
    }

    // Handle array permissions (specific scopes)
    if (Array.isArray(permissionScope)) {
      return this.checkPermissionScope(permissionScope as PermissionScope[], resource);
    }

    return false;
  }

  /**
   * Build database query conditions for filtering resources based on user permissions
   * This enables efficient server-side access control at the database level
   */
  async buildQueryConditions(
    resourceType: ResourceType,
    table: any,
    permission: Permission = 'view'
  ): Promise<SQL | null> {
    // Not authenticated users can't access anything
    if (!this.user) {
      return sql`1 = 0`; // Always false condition
    }

    // Get actual role settings
    const roleSettings = await this.getActualRoleSettings();

    // Get user's role definition
    const userRole = this.user.role || roleSettings.defaultRole;
    const roleDefinition = roleSettings.definitions[userRole];

    if (!roleDefinition) {
      log.warn(`Role definition not found for role: ${userRole}`, { userRole });
      return sql`1 = 0`; // Always false condition
    }

    // Get permissions for the resource type
    const resourcePermissions =
      roleDefinition.permissions[resourceType as keyof typeof roleDefinition.permissions];
    if (!resourcePermissions) {
      log.warn(`Resource type not found in permissions: ${resourceType}`, {
        resourceType,
        userRole
      });
      return sql`1 = 0`; // Always false condition
    }

    // Check the specific permission
    const permissionScope = resourcePermissions[permission];
    if (permissionScope === undefined) {
      return sql`1 = 0`; // Always false condition
    }

    // Handle boolean permissions (simple true/false)
    if (typeof permissionScope === 'boolean') {
      return permissionScope ? null : sql`1 = 0`; // null means no restriction, false means no access
    }

    // Handle array permissions (specific scopes)
    if (Array.isArray(permissionScope)) {
      return this.buildScopeConditions(permissionScope as PermissionScope[], table);
    }

    return sql`1 = 0`; // Default to no access
  }

  /**
   * Build SQL conditions for permission scopes
   */
  private buildScopeConditions(scopes: PermissionScope[], table: any): SQL | null {
    // If 'all' scope is present, allow everything (no restrictions)
    if (scopes.includes('all')) {
      return null;
    }

    const conditions: SQL[] = [];

    for (const scope of scopes) {
      if (scope === 'own' && this.user) {
        conditions.push(eq(table.author, this.user.id));
      }

      if (scope === 'public') {
        // Public content includes published, draft, and archived (but not private)
        conditions.push(inArray(table.status, ['published', 'draft', 'archived']));
      }

      if (scope === 'published') {
        conditions.push(eq(table.status, 'published'));
      }

      if (scope === 'draft') {
        conditions.push(eq(table.status, 'draft'));
      }

      if (scope === 'archived') {
        conditions.push(eq(table.status, 'archived'));
      }
    }

    if (conditions.length === 0) {
      return sql`1 = 0`; // No valid scopes found - deny access
    }

    if (conditions.length === 1) {
      return conditions[0];
    }

    return or(...conditions)!;
  }

  /**
   * Check if permission scope allows access
   */
  private checkPermissionScope(scopes: PermissionScope[], resource?: Resource): boolean {
    if (!resource) {
      // If no resource provided, check if 'all' is in scopes
      return scopes.includes('all');
    }

    for (const scope of scopes) {
      if (scope === 'all') {
        return true;
      }

      if (scope === 'own' && this.owns(resource)) {
        return true;
      }

      if (
        scope === 'public' &&
        ['published', 'draft', 'archived'].includes(resource.status || '')
      ) {
        return true;
      }

      if (scope === 'published' && resource.status === 'published') {
        return true;
      }

      if (scope === 'draft' && resource.status === 'draft') {
        return true;
      }

      if (scope === 'archived' && resource.status === 'archived') {
        return true;
      }
    }

    return false;
  }

  /**
   * Get user's role definition
   */
  getRoleDefinition() {
    const userRole = this.user?.role || this.roleSettings.defaultRole;
    return this.roleSettings.definitions[userRole];
  }

  /**
   * Get all available roles
   */
  getAvailableRoles() {
    return Object.keys(this.roleSettings.definitions);
  }

  /**
   * Check if a role is an admin role
   */
  isAdminRole(role: string): boolean {
    return this.roleSettings.adminRoles.includes(role);
  }

  /**
   * Check multiple permissions at once for efficiency
   */
  async canMultiple(
    checks: Array<{ permission: Permission; resourceType: ResourceType; resource?: Resource }>
  ): Promise<boolean[]> {
    // Load role settings once for all checks
    await this.getActualRoleSettings();

    const results = await Promise.all(
      checks.map(({ permission, resourceType, resource }) =>
        this.can(permission, resourceType, resource)
      )
    );

    return results;
  }

  /**
   * Get a summary of user's permissions for a resource type
   */
  async getPermissionSummary(resourceType: ResourceType): Promise<{
    view: PermissionScope;
    create: PermissionScope;
    update: PermissionScope;
    delete: PermissionScope;
  }> {
    if (!this.user) {
      return { view: false, create: false, update: false, delete: false };
    }

    const roleSettings = await this.getActualRoleSettings();
    const userRole = this.user.role || roleSettings.defaultRole;
    const roleDefinition = roleSettings.definitions[userRole];

    if (!roleDefinition) {
      return { view: false, create: false, update: false, delete: false };
    }

    const resourcePermissions =
      roleDefinition.permissions[resourceType as keyof typeof roleDefinition.permissions];
    if (!resourcePermissions) {
      return { view: false, create: false, update: false, delete: false };
    }

    return {
      view: resourcePermissions.view || false,
      create: resourcePermissions.create || false,
      update: resourcePermissions.update || false,
      delete: resourcePermissions.delete || false
    };
  }

  /**
   * Clear the role settings cache (useful when role settings are updated)
   */
  static clearCache(): void {
    ACL.roleSettingsCache = null;
  }

  // Route Protection Methods

  /**
   * Check if a route requires protection and validate access
   * Throws redirect/error if access is denied
   */
  async checkRouteAccess(pathname: string, referer?: string | null): Promise<void> {
    const protectedRoutes = await this.getProtectedRoutes();
    const matchedRoute = protectedRoutes.find((route) => route.pattern.test(pathname));

    if (!matchedRoute) {
      return; // No protection needed
    }

    // Check authentication requirement
    if (matchedRoute.requireAuth && !this.user) {
      throw redirect(303, '/sailor/auth/login');
    }

    // For non-authenticated routes or routes that don't need further checks
    if (!this.user) {
      return;
    }

    // Check admin requirement
    if (matchedRoute.adminOnly && !(await this.isAdmin())) {
      const errorMessage = 'Administrator access required';
      throw createACLRedirect(pathname, errorMessage, referer);
    }

    // Check specific permission
    // For route-level access (without specific resources), use hasAnyPermission
    const hasPermission = await this.hasAnyPermission(
      matchedRoute.resourceType,
      matchedRoute.permission
    );

    if (!hasPermission) {
      const errorMessage = getPermissionErrorMessage(
        this.user,
        matchedRoute.permission,
        matchedRoute.resourceType
      );
      throw createACLRedirect(pathname, errorMessage, referer);
    }
  }

  /**
   * Get protected routes configuration (with caching)
   */
  private static protectedRoutesCache: { routes: RouteProtection[]; timestamp: number } | null =
    null;

  private async getProtectedRoutes(): Promise<RouteProtection[]> {
    const now = Date.now();

    // Check cache first (same TTL as role settings)
    if (ACL.protectedRoutesCache && now - ACL.protectedRoutesCache.timestamp < ACL.CACHE_TTL) {
      return ACL.protectedRoutesCache.routes;
    }

    try {
      const settings = await getSettings();
      const routes = settings.routeProtection
        ? mergeRouteProtections(
          settings.routeProtection.customRoutes,
          settings.routeProtection.overrideDefaults
        )
        : DEFAULT_PROTECTED_ROUTES;

      // Cache the routes
      ACL.protectedRoutesCache = {
        routes,
        timestamp: now
      };

      return routes;
    } catch (error) {
      log.warn('Failed to load route protection settings, using defaults', { error });
      return DEFAULT_PROTECTED_ROUTES;
    }
  }

  /**
   * Clear route protection cache
   */
  static clearRouteProtectionCache(): void {
    ACL.protectedRoutesCache = null;
  }

  /**
   * Clear all caches
   */
  static clearAllCaches(): void {
    ACL.clearCache();
    ACL.clearRouteProtectionCache();
  }

  /**
   * Force refresh of route protection configuration (useful for development)
   */
  static async refreshRouteProtection(): Promise<void> {
    ACL.clearRouteProtectionCache();
    // Force a reload by getting the settings
    const acl = new ACL({ id: 'temp', role: 'admin' });
    await acl.getProtectedRoutes();
  }
}

/**
 * Create a redirect response with error message, using referer when appropriate
 */
export function createACLRedirect(
  currentPath: string,
  errorMessage: string,
  referer?: string | null
): Response {
  let redirectUrl = `/sailor?error=${encodeURIComponent(errorMessage)}`;

  // Try to use referer if available and safe
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      if (
        refererUrl.pathname !== currentPath &&
        !refererUrl.pathname.startsWith('/sailor/auth/') &&
        refererUrl.pathname.startsWith('/sailor')
      ) {
        refererUrl.searchParams.set('error', errorMessage);
        redirectUrl = refererUrl.pathname + refererUrl.search;
      }
    } catch {
      // Use default if referer is invalid
    }
  }

  return redirect(302, redirectUrl);
}

/**
 * Higher-level helper for route handlers to check permissions and redirect on failure
 * Usage: await requirePermission(acl, 'update', 'collection', item, { request, url })
 */
export async function requirePermission(
  acl: ACL,
  permission: Permission,
  resourceType: ResourceType,
  resource: Resource | undefined,
  context: { request: Request; url: URL; user: User }
): Promise<void> {
  const canAccess = await acl.can(permission, resourceType, resource);
  if (!canAccess) {
    const errorMessage = getPermissionErrorMessage(
      context.user,
      permission,
      resourceType,
      resource
    );
    throw createACLRedirect(
      context.url.pathname,
      errorMessage,
      context.request.headers.get('referer')
    );
  }
}

/**
 * Get a user-friendly error message for permission failures
 */
export function getPermissionErrorMessage(
  user: User,
  permission: Permission,
  resourceType: ResourceType,
  resource?: Resource
): string {
  switch (permission) {
    case 'view':
      if (resourceType === 'file') {
        return 'You do not have permission to view this file.';
      } else if (
        resourceType === 'collection' ||
        resourceType === 'global' ||
        resourceType === 'block'
      ) {
        if (resource?.status === 'private' && resource.author !== user.id) {
          return 'You can only view your own private content.';
        }
      }
      return 'You do not have permission to view this content.';

    case 'create':
      return `You need ${resourceType === 'user' ? 'admin' : 'authenticated user'} permissions to create ${resourceType}s.`;

    case 'update':
      if (resourceType === 'file') {
        return 'You need editor or admin permissions to edit files.';
      } else if (
        resourceType === 'collection' ||
        resourceType === 'global' ||
        resourceType === 'block'
      ) {
        if (resource?.status === 'private' && resource.author !== user.id) {
          return 'You can only edit your own private content.';
        } else if (['published', 'draft', 'archived'].includes(resource?.status || '')) {
          return 'You need editor or admin permissions to edit published content.';
        }
      }
      return 'You do not have permission to edit this item.';

    case 'delete':
      if (resourceType === 'file') {
        return 'You need editor or admin permissions to delete files.';
      } else if (
        resourceType === 'collection' ||
        resourceType === 'global' ||
        resourceType === 'block'
      ) {
        if (resource?.status === 'private' && resource.author !== user.id) {
          return 'You can only delete your own private content.';
        } else if (['published', 'draft', 'archived'].includes(resource?.status || '')) {
          return 'You need editor or admin permissions to delete published content.';
        }
      }
      return 'You do not have permission to delete this item.';

    default:
      return 'You do not have permission to perform this action.';
  }
}

/**
 * Factory function to create an ACL instance
 */
export function createACL(user: User | null | undefined): ACL {
  return new ACL(user);
}

/**
 * Create an ACL instance with enhanced logging for debugging
 */
export function createDebugACL(user: User | null | undefined, context: string = ''): ACL {
  const acl = new ACL(user);

  // Override the can method to add logging
  const originalCan = acl.can.bind(acl);
  acl.can = async function (
    permission: Permission,
    resourceType: ResourceType,
    resource?: Resource
  ): Promise<boolean> {
    const result = await originalCan(permission, resourceType, resource);
    return result;
  };

  return acl;
}

/**
 * Helper function to check if a user is authenticated
 */
export function isAuthenticated(user: User | null | undefined): user is User {
  return !!(user && user.id);
}

/**
 * Helper function to check if a user has any admin role
 */
export async function isUserAdmin(user: User | null | undefined): Promise<boolean> {
  if (!isAuthenticated(user)) return false;
  const acl = createACL(user);
  return await acl.isAdmin();
}

/**
 * Convenient function for hooks to check route access
 * Throws redirect/error if access is denied
 */
export async function checkRouteAccess(
  pathname: string,
  user: User | null | undefined,
  referer?: string | null
): Promise<void> {
  const acl = createACL(user);
  return await acl.checkRouteAccess(pathname, referer);
}

