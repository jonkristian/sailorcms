---
layout: default
title: RBAC & Security
nav_order: 5
has_children: true
---

# Role-Based Access Control

Sailor CMS includes a robust Role-Based Access Control (RBAC) system built on [Better Auth's admin plugin](https://www.better-auth.com/docs/plugins/admin) that provides secure user management and fine-grained permissions.

## Overview

The RBAC system leverages Better Auth's proven access control patterns and provides:

- **Simple Role Management**: Built-in admin, editor, and user roles with logical defaults
- **Resource-Based Permissions**: Control access to content, files, users, and settings
- **Better Auth Integration**: Seamless authentication and session management
- **Extensible Design**: Easy to add custom roles and permissions

## Key Features

### Built-in Roles

- **Admin** - Full system access including user management and settings
- **Editor** - Content and file management without user administration
- **User** - Read-only access to published content and files

### Protected Resources

- **Content** - Collections, globals, and all content types
- **Files** - Media uploads and file management
- **Users** - User accounts and profile management
- **Settings** - System configuration and preferences

### Permission Actions

All resources support standard CRUD operations:
- **create** - Add new content/users/files
- **read** - View and access content
- **update** - Edit existing content
- **delete** - Remove content permanently

---

## Quick Start

The system works immediately with secure defaults. Customize roles in your settings file only if you need different permissions.

[Learn more about Configuration]({{ site.baseurl }}{% link rbac/acl.md %})
