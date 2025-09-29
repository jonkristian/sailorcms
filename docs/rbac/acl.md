---
layout: default
title: Configuration & Usage
parent: RBAC & Security
nav_order: 1
---

# Better Auth RBAC Configuration

Sailor CMS uses [Better Auth's admin plugin](https://www.better-auth.com/docs/plugins/admin) for authentication and access control, providing a secure and battle-tested foundation for user management.

## How It Works

The system integrates Better Auth's access control with Sailor's content management:

1. **Better Auth** handles authentication, sessions, and core permission checking
2. **Sailor** maps content operations to Better Auth's permission system
3. **Settings** define role permissions using Better Auth's format
4. **Runtime** checks happen automatically on every request

## Default Configuration

The system includes three pre-configured roles with sensible permissions:

### User Role
```typescript
user: {
  name: 'User',
  description: 'Basic authenticated user with read-only content access',
  permissions: {
    content: ['read'],      // Can read published content
    files: ['read']         // Can view files
  }
}
```

### Editor Role
```typescript
editor: {
  name: 'Editor',
  description: 'Content editor with full content and file management',
  permissions: {
    content: ['create', 'read', 'update', 'delete'],  // Full content access
    files: ['create', 'read', 'update', 'delete'],     // Full file management
    settings: ['read']                                  // View-only settings
  }
}
```

### Admin Role
```typescript
admin: {
  name: 'Administrator',
  description: 'Full system administrator with all permissions',
  permissions: {
    content: ['create', 'read', 'update', 'delete'],   // Full content access
    files: ['create', 'read', 'update', 'delete'],     // Full file management
    users: ['create', 'read', 'update', 'delete'],     // User management
    settings: ['read', 'update']                        // Settings management
  }
}
```

## Permission Checking

### Automatic Route Protection

Routes are automatically protected based on user permissions:

```typescript
// In page server files - automatic permission checking
export const load = async ({ locals }) => {
  // locals.security.hasPermission() is available everywhere
  if (!(await locals.security.hasPermission('read', 'content'))) {
    throw error(403, 'Access denied');
  }
  // ... load content
};
```

### Manual Permission Checks

For fine-grained control, check permissions explicitly:

```typescript
// Check if user can create content
const canCreate = await locals.security.hasPermission('create', 'content');

// Check if user can manage other users
const canManageUsers = await locals.security.hasPermission('read', 'users');

// Check if user can modify settings
const canEditSettings = await locals.security.hasPermission('update', 'settings');
```

## Customizing Roles

### Modifying Existing Roles

Edit `src/lib/sailor/templates/settings.ts` to customize role permissions:

```typescript
export const settings: Partial<CMSSettings> = {
  roles: {
    definitions: {
      // Override editor to restrict file deletion
      editor: {
        name: 'Editor',
        description: 'Content editor with limited file permissions',
        permissions: {
          content: ['create', 'read', 'update', 'delete'],
          files: ['create', 'read', 'update'],  // No delete permission
          settings: ['read']
        }
      }
    },
    defaultRole: 'user',
    adminRoles: ['admin', 'editor']
  }
};
```

### Adding Custom Roles

Add new roles alongside the existing ones:

```typescript
export const settings: Partial<CMSSettings> = {
  roles: {
    definitions: {
      // Keep existing roles (user, editor, admin)

      // Add custom role
      moderator: {
        name: 'Moderator',
        description: 'Content moderator with review permissions',
        permissions: {
          content: ['read', 'update'],  // Can review and edit, but not create/delete
          files: ['read'],              // View-only file access
          settings: ['read']            // View-only settings
        }
      }
    },
    defaultRole: 'user',
    adminRoles: ['admin', 'editor', 'moderator']  // Add to admin roles if needed
  }
};
```

### Update Database Schema

After adding new roles, update the database schema:

```bash
npx sailor db:update
```

This ensures your new roles are available in the user interface and TypeScript types.

## Resource Types

The system maps Sailor's content types to Better Auth resources:

| Sailor Content | Better Auth Resource | Description |
|---------------|---------------------|-------------|
| Collections, Globals, Blocks | `content` | All content management |
| Media, Uploads | `files` | File and media management |
| User accounts | `users` | User administration |
| CMS settings | `settings` | System configuration |

## Best Practices

### Security First
- **Start restrictive** - Grant minimum permissions first, expand as needed
- **Test thoroughly** - Always verify permission changes work as expected
- **Regular audits** - Periodically review who has what access

### Role Design
- **Clear names** - Use descriptive role names that explain their purpose
- **Logical grouping** - Group related permissions together
- **Documentation** - Document custom roles and their intended use

### Development Workflow
```typescript
// 1. Define roles in settings.ts
// 2. Run database update
// 3. Test in development environment
// 4. Deploy with confidence
```

## Troubleshooting

### Permission Denied Errors

If users get unexpected permission denials:

1. **Check role assignment** - Verify the user has the correct role
2. **Review permissions** - Ensure the role has the needed permissions
3. **Clear cache** - Restart the development server
4. **Check logs** - Look for Better Auth permission check failures

### Common Issues

**Q: User can't access admin pages**
A: Ensure their role is in the `adminRoles` array in settings

**Q: New role not showing in UI**
A: Run `npx sailor db:update` to regenerate schema

**Q: Permission changes not taking effect**
A: Restart the development server to reload settings

## Integration with Better Auth

The system leverages Better Auth's proven patterns:

- **Access control statements** define available permissions
- **Roles** combine permissions into logical groups
- **Runtime checks** use Better Auth's permission API
- **Session management** handled by Better Auth core

This provides enterprise-grade security with minimal configuration overhead.
