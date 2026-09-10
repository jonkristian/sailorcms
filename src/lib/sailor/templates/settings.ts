/**
 * Sailor CMS Settings
 *
 * Override core CMS defaults here. Most settings have sensible defaults and can be
 * configured via environment variables. Only override what you need to customize.
 */

import type { CMSSettings } from 'sailorcms/core/settings/types';

export const settings: Partial<CMSSettings> = {
  // ✅ Storage settings (most important - override as needed)
  storage: {
    // Paths to exclude from storage scanning (file import/sync operations)
    excludePaths: ['cache/', 'backup/', 'backups/', '.tmp/', '.git/'],

    // Image processing configuration
    images: {
      // Who resizes images. Default is Sailor itself, with sharp, cached to
      // disk or S3. Point this at a service to resize at the edge instead:
      //
      //   transform: { provider: 'cloudflare' }
      //     Needs Image Resizing enabled on the zone. Sends format=auto, so
      //     browsers that take AVIF get it.
      //
      //   transform: { provider: 'custom', url: 'https://img.example.com/{width}x{height}/{url}' }
      //     Placeholders: {url} (encoded), {rawUrl}, {width}, {height},
      //     {quality}, {format}, {fit}. Unset ones become empty strings.
      //
      // Services that sign their URLs are not supported: these URLs are built
      // in the browser, so the key would be public.
      // transform: { provider: 'local' },

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

  // ✅ Content i18n — only relevant for entities marked `localized: true` in
  // their template. Distinct from paraglide's admin-UI locales: content locales
  // are what your editors translate posts/pages/globals into; admin locales
  // are what the CMS chrome is rendered in. They can overlap or be totally
  // different.
  content: {
    i18n: {
      locales: ['en', 'nb-NO'],
      default: 'en',
      fallback: 'default' // 'default' returns the default-locale row when the requested locale has none; 'strict' returns null
    }
  },

  // ✅ Block groups — wrap blocks in layout containers in the editor.
  // Opt-in: declaring this `blocks.groups` block turns the feature on. Remove it
  // (or set `enabled: false`) to turn it off — no block_groups table, no grouping
  // UI. `fields` defines what each group can configure — they become columns on
  // the `block_groups` table and render in the group settings popover.
  // Edit these freely; supported types: string, number, boolean, select
  // (with `options`), color. Keys are snake_case column names. Run `db:update`
  // after changing `fields`. See docs/core-concepts/templates.md#block-grouping.
  blocks: {
    groups: {
      enabled: true,
      fields: {
        layout: {
          type: 'select',
          label: 'Layout',
          default: 'stack',
          options: [
            { label: 'Stack', value: 'stack' },
            { label: 'Grid', value: 'grid' },
            { label: 'Flex', value: 'flex' }
          ]
        },
        columns: {
          type: 'select',
          label: 'Columns',
          options: [
            { label: '1', value: '1' },
            { label: '2', value: '2' },
            { label: '3', value: '3' },
            { label: '4', value: '4' },
            { label: 'Auto-fit', value: 'auto-fit' }
          ]
        },
        column_ratios: { type: 'string', label: 'Column ratios', placeholder: '1fr 2fr' },
        gap: {
          type: 'select',
          label: 'Gap',
          options: [
            { label: '0', value: '0' },
            { label: '1', value: '1' },
            { label: '2', value: '2' },
            { label: '4', value: '4' },
            { label: '6', value: '6' },
            { label: '8', value: '8' }
          ]
        },
        padding: {
          type: 'select',
          label: 'Padding',
          options: [
            { label: 'None', value: 'none' },
            { label: 'Small', value: 'small' },
            { label: 'Medium', value: 'medium' },
            { label: 'Large', value: 'large' }
          ]
        },
        background_color: { type: 'color', label: 'Background' },
        rounded: { type: 'boolean', label: 'Rounded corners' }
      }
    }
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
          content: ['read'], // Can read published content and own content
          files: ['read'] // Can view files
          // No access to users or settings
        } as const
      },
      editor: {
        name: 'Editor',
        description: 'Content editor with full content and file management',
        permissions: {
          content: ['create', 'read', 'update', 'delete'], // Full content access
          files: ['create', 'read', 'update', 'delete'], // Full file management
          settings: ['read']
        } as const
      },
      admin: {
        name: 'Administrator',
        description: 'Full system administrator with all permissions',
        permissions: {
          content: ['create', 'read', 'update', 'delete'], // Full content access
          files: ['create', 'read', 'update', 'delete'], // Full file management
          users: ['create', 'read', 'update', 'delete'], // User management
          settings: ['read', 'update'] // Settings management
        } as const
      }
    },

    // Default role for new users
    defaultRole: 'user',

    // Roles that have elevated permissions (used by better-auth)
    adminRoles: ['admin', 'editor']
  }
};
