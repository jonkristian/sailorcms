/**
 * Route Protection Configuration
 * Defines which routes require authentication and permissions
 */

import type { Permission, ResourceType } from './types';

export interface RouteProtection {
  pattern: RegExp;
  permission: Permission;
  resourceType: ResourceType;
  requireAuth?: boolean;
  adminOnly?: boolean;
  description?: string;
}

/**
 * Default route protection rules
 * These can be overridden in template settings
 */
export const DEFAULT_PROTECTED_ROUTES: RouteProtection[] = [
  // Admin Dashboard - require authentication only
  {
    pattern: /^\/sailor\/?$/,
    permission: 'view',
    resourceType: 'global', // Use 'global' since basic users can view globals
    requireAuth: true,
    description: 'Main admin dashboard access'
  },

  // Admin/Settings routes - require admin access
  {
    pattern: /^\/sailor\/settings(?:\/.*)?$/,
    permission: 'view',
    resourceType: 'settings',
    requireAuth: true,
    adminOnly: true,
    description: 'Settings pages - admin only'
  },
  {
    pattern: /^\/sailor\/api\/settings(?:\/.*)?$/,
    permission: 'update',
    resourceType: 'settings',
    requireAuth: true,
    adminOnly: true,
    description: 'Settings API - admin only'
  },

  // Collections routes
  {
    pattern: /^\/sailor\/collections\/[^\/]+$/,
    permission: 'view',
    resourceType: 'collection',
    requireAuth: true,
    description: 'Collection listing pages'
  },
  {
    pattern: /^\/sailor\/collections\/[^\/]+\/[^\/]+$/,
    permission: 'view',
    resourceType: 'collection',
    requireAuth: true,
    description: 'Individual collection item pages'
  },
  {
    pattern: /^\/sailor\/api\/collections(?:\/.*)?$/,
    permission: 'view',
    resourceType: 'collection',
    requireAuth: true,
    description: 'Collections API endpoints'
  },

  // Globals routes
  {
    pattern: /^\/sailor\/globals\/[^\/]+(?:\/.*)?$/,
    permission: 'view',
    resourceType: 'global',
    requireAuth: true,
    description: 'Global content pages'
  },
  {
    pattern: /^\/sailor\/api\/globals(?:\/.*)?$/,
    permission: 'view',
    resourceType: 'global',
    requireAuth: true,
    description: 'Globals API endpoints'
  },

  // Media/Files routes
  {
    pattern: /^\/sailor\/media(?:\/.*)?$/,
    permission: 'view',
    resourceType: 'file',
    requireAuth: true,
    description: 'Media library access'
  },
  {
    pattern: /^\/sailor\/api\/files(?:\/.*)?$/,
    permission: 'view',
    resourceType: 'file',
    requireAuth: true,
    description: 'File API endpoints'
  },

  // User management routes
  {
    pattern: /^\/sailor\/users(?:\/.*)?$/,
    permission: 'view',
    resourceType: 'user',
    requireAuth: true,
    adminOnly: true,
    description: 'User management - admin only'
  },
  {
    pattern: /^\/sailor\/api\/users(?:\/.*)?$/,
    permission: 'view',
    resourceType: 'user',
    requireAuth: true,
    adminOnly: true,
    description: 'User API - admin only'
  },

  // Account routes - all authenticated users can access their own account
  // Specific permission checks happen in route handlers since they need user context
  {
    pattern: /^\/sailor\/account(?:\/.*)?$/,
    permission: 'view',
    resourceType: 'global', // All user roles have view access to globals
    requireAuth: true,
    description: 'User account management'
  },
  {
    pattern: /^\/sailor\/api\/account(?:\/.*)?$/,
    permission: 'view',
    resourceType: 'global',
    requireAuth: true,
    description: 'Account API endpoints'
  }
];

/**
 * Merge user-defined route protections with defaults
 */
export function mergeRouteProtections(
  customRoutes: RouteProtection[] = [],
  overrideDefaults = false
): RouteProtection[] {
  if (overrideDefaults) {
    return customRoutes;
  }

  return [...DEFAULT_PROTECTED_ROUTES, ...customRoutes];
}
