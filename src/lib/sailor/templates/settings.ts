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

    cache: {
      provider: 'local' as const,
      local: {
        enabled: true,
        directory: 'static/cache',
        maxSize: '1GB'
      },
      s3: {
        bucket: '',
        prefix: 'processed-images/',
        region: ''
      }
    },
    // Image processing configuration
    images: {
      formats: ['webp', 'jpg', 'png'], // Preferred output formats
      maxFileSize: '10.0MB',
      maxWidth: 2560, // Maximum width for transformations
      maxHeight: 2560, // Maximum height for transformations
      defaultQuality: 90, // Default quality for transformations

      // Responsive image breakpoints (used by getImage() function)
      breakpoints: [375, 768, 1200, 1600], // Mobile, tablet, desktop, large

      allowedTypes: [
        'image/*',
        'application/pdf',
        '.doc',
        '.docx',
        '.txt',
        '.csv',
        '.xlsx',
        '.pptx'
      ]
    },

    // Upload constraints
    upload: {
      maxFileSize: '10.0MB',
      allowedTypes: ['*/*'], // Allow all file types by default
      folderStructure: 'flat' // 'flat' | 'date' | 'type'
    }
  },

  // ✅ SEO settings (override core defaults)
  seo: {
    enabled: true,
    titleTemplate: '{title} | {siteName}', // How to format page titles
    titleSeparator: '|',
    defaultDescription: '', // Default meta description
    language: 'en'
  },

  // ✅ System settings (minimal overrides)
  system: {
    debugMode: false // debugMode is set via DEBUG_MODE environment variable
  },

  // ✅ Role-based permissions configuration
  roles: {
    // Define available roles and their permissions
    definitions: {
      user: {
        name: 'User',
        description: 'Basic authenticated user with limited permissions',
        permissions: {
          collection: {
            view: ['published', 'own'],
            create: true,
            update: ['own'],
            delete: ['own']
          },
          global: {
            view: true,
            create: false,
            update: false,
            delete: false
          },
          block: {
            view: true,
            create: true,
            update: ['own'],
            delete: ['own']
          },
          file: {
            view: true,
            create: true,
            update: ['own'],
            delete: ['own']
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
        description: 'Can edit and delete published content',
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
            delete: true // Editors can delete files
          },
          user: {
            view: true,
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
        description: 'Full access to all features and settings',
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

    // Default role for new users
    defaultRole: 'user',

    // Roles that have elevated permissions (used by better-auth)
    adminRoles: ['admin', 'editor']
  }
};
