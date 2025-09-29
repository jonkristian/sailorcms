/**
 * Sailor CMS Settings
 *
 * Override core CMS defaults here. Most settings have sensible defaults and can be
 * configured via environment variables. Only override what you need to customize.
 */

import type { CMSSettings } from '$sailor/core/settings/types';

export const settings: Partial<CMSSettings> = {
  // ✅ Storage settings (most important - override as needed)
  storage: {
    // Paths to exclude from storage scanning (file import/sync operations)
    excludePaths: ['cache/', 'backup/', '.tmp/', '.git/'],

    // Image processing configuration
    images: {
      maxFileSize: '10.0MB',
      maxWidth: 2560, // Maximum width for transformations
      maxHeight: 2560, // Maximum height for transformations

      // Responsive image breakpoints (used by getImage() function)
      breakpoints: [375, 768, 1200, 1600] // Mobile, tablet, desktop, large
    },

    // Upload constraints
    upload: {
      maxFileSize: '10.0MB',
      allowedTypes: ['*/*'], // Allow all file types by default
      folderStructure: 'flat' // 'flat' | 'date' | 'type'
    }
  },

  // ✅ Cache settings (simple and clean)
  cache: {
    enabled: true,
    maxSize: '1GB'
  },

  // ✅ System settings (minimal - most via env vars)
  system: {},

  // ✅ Better-Auth integrated role definitions
  roles: {
    // Role definitions that map directly to better-auth access control
    definitions: {
      user: {
        name: 'User',
        description: 'Basic authenticated user with read-only content access',
        permissions: {
          content: ['read'],      // Can read published content and own content
          files: ['read']         // Can view files
          // No access to users or settings
        } as const
      },
      editor: {
        name: 'Editor',
        description: 'Content editor with full content and file management',
        permissions: {
          content: ['create', 'read', 'update', 'delete'],  // Full content access
          files: ['create', 'read', 'update', 'delete'],     // Full file management
          settings: ['read']
        } as const
      },
      admin: {
        name: 'Administrator',
        description: 'Full system administrator with all permissions',
        permissions: {
          content: ['create', 'read', 'update', 'delete'],  // Full content access
          files: ['create', 'read', 'update', 'delete'],    // Full file management
          users: ['create', 'read', 'update', 'delete'],    // User management
          settings: ['read', 'update']                       // Settings management
        } as const
      }
    },

    // Default role for new users
    defaultRole: 'user',

    // Roles that have elevated permissions (used by better-auth)
    adminRoles: ['admin', 'editor']
  }
};
