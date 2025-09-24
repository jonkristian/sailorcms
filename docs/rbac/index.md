---
layout: default
title: RBAC & Security
nav_order: 5
has_children: true
---

# Role-Based Access Control

Sailor CMS includes a comprehensive Role-Based Access Control (RBAC) system that allows you to define exactly who can access and modify different types of content.

## Overview

The RBAC system is built on top of Better Auth's admin plugin and provides:

- **Flexible Role Definitions**: Create custom roles with specific permissions
- **Resource-Level Control**: Control access to collections, globals, blocks, files, and users
- **Granular Permissions**: Define view, create, update, and delete permissions separately
- **Scope-Based Access**: Control access based on content status (published, draft, etc.) and ownership

## Key Concepts

### Roles

User roles like `admin`, `editor`, and `user` that define what actions a user can perform.

### Permissions

Specific actions like `view`, `create`, `update`, and `delete` that can be allowed or restricted.

### Resources

Different types of content that can be protected: `collection`, `global`, `block`, `file`, `user`, and `settings`.

### Scopes

Fine-grained access control based on:

- **Ownership**: `own` - only content you created
- **Status**: `published`, `draft`, `archived` - based on content status
- **Visibility**: `public`, `all` - based on content visibility

---

## Quick Start

The RBAC system works out of the box with sensible defaults, but you can customize it extensively through your settings configuration.

[Learn more about ACL Implementation]({{ site.baseurl }}{% link rbac/acl.md %})
