# Role-Based Permissions System

Sailor CMS includes a flexible role-based permissions system that allows you to configure what each user role can access and modify.

## Overview

The permissions system is defined in two places:

1. **Settings Configuration** (`src/lib/sailor/templates/settings.ts`) - Define role permissions
2. **ACL System** (`src/lib/sailor/core/auth/acl.ts`) - Runtime permission checking and enforcement

## Available Roles

By default, the system includes three roles:

- **User** - Basic authenticated user with limited permissions
- **Editor** - Can edit and delete published content
- **Admin** - Full access to all features and settings

## Resource Types

The system supports permissions for these resource types:

- **Collections** - Content items (posts, pages, etc.)
- **Globals** - Global settings and configuration
- **Blocks** - Reusable content blocks
- **Files** - Media files and uploads
- **Users** - User accounts and profiles

## Permissions

Each resource type supports these permissions:

- **View** - Can see and read content
- **Create** - Can create new content
- **Update** - Can edit existing content
- **Delete** - Can remove content

## Permission Scopes

Permissions can be scoped to specific content types:

- **All** - All content of that type
- **Public** - Published, draft, and archived content
- **Published** - Only published content
- **Draft** - Only draft content
- **Archived** - Only archived content
- **Own** - Only content the user owns

## Configuration

### 1. Define Role Permissions

Edit `src/lib/sailor/templates/settings.ts`:

```typescript
export const settings: Partial<CMSSettings> = {
  roles: {
    definitions: {
      user: {
        name: 'User',
        description: 'Basic authenticated user with limited permissions',
        permissions: {
          collection: {
            view: ['public', 'own'],
            create: true,
            update: ['own'],
            delete: ['own']
          }
          // ... other resource types
        }
      }
      // ... other roles
    },
    defaultRole: 'user',
    adminRoles: ['admin', 'editor']
  }
};
```

### 2. Use ACL

The ACL system automatically reads from your settings configuration:

```typescript
import { createACL, requirePermission } from '$sailor/core/auth/acl';

// In your server actions or load functions
const acl = createACL(locals.user);

// Method 1: Check permission and handle manually
if (await acl.can('delete', 'collection', item)) {
  // Allow deletion
} else {
  // Show permission error
}

// Method 2: Check permission and auto-redirect on failure (recommended)
await requirePermission(acl, 'update', 'collection', item, { request, url, user: locals.user });
```

## Error Handling

When users lack permissions, the system automatically:

1. **Redirects back to where they came from** (using browser referer)
2. **Shows a toast notification** explaining why access was denied
3. **Falls back to dashboard** if referer is unavailable or unsafe

This happens automatically for:

- **Route-level access** (handled by hooks)
- **Item-level access** (handled by `requirePermission()` helper)

## Viewing Current Roles

You can view the current roles and their permissions at `/sailor/settings/roles` (admin only).

This page displays:

- All defined roles and their names
- Current permission configuration for each role
- Which roles have admin privileges

Note: Role permissions are configured in code via `settings.ts` - they cannot be edited through the UI.

## Adding New Roles

1. Add the role definition to `settings.ts`:

```typescript
definitions: {
  // ... existing roles
  moderator: {
    name: 'Moderator',
    description: 'Can moderate content but not manage users',
    permissions: {
      collection: {
        view: ['all'],
        create: true,
        update: ['published', 'draft'],
        delete: ['published', 'draft']
      },
      // ... other permissions
    }
  }
}
```

2. Update the `adminRoles` array if the new role should have elevated permissions:

```typescript
adminRoles: ['admin', 'editor', 'moderator'];
```

## Best Practices

1. **Start Simple** - Begin with the default roles and adjust as needed
2. **Test Thoroughly** - Always test permission changes in a development environment
3. **Document Changes** - Keep track of permission modifications for your team
4. **Principle of Least Privilege** - Give users only the permissions they need
5. **Regular Reviews** - Periodically review and audit role permissions

## Examples

### Custom Role: Content Manager

```typescript
contentManager: {
  name: 'Content Manager',
  description: 'Manages all content but cannot access user settings',
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
      view: false,
      create: false,
      update: false,
      delete: false
    }
  }
}
```

### Restrictive Role: Guest Author

```typescript
guestAuthor: {
  name: 'Guest Author',
  description: 'Can only create and edit their own draft content',
  permissions: {
    collection: {
      view: ['published', 'own'],
      create: true,
      update: ['own'],
      delete: ['own']
    },
    global: {
      view: false,
      create: false,
      update: false,
      delete: false
    },
    // ... other restrictive permissions
  }
}
```
