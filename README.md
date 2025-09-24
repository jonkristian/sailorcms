# 🌊 Sailor CMS

A **smooth Sailin'** template-driven CMS that installs into your existing SvelteKit project. Define your content structure and Sailor generates your database schema and admin interface.

> ⚠️ EXPERIMENTAL: Sailor CMS is primarily built for my own needs, and it can be considered early beta. It uses the experimental remote functions. Use at your own risk!

## ✨ Key Features

- 🚀 **Install into Existing Projects** - Add Sailor to any SvelteKit project with one command
- 🎯 **Template-Driven** - Define collections, blocks, and globals as templates to build your own CMS
- 🔄 **Auto-Generated Schema** - Database tables and migrations created from your templates
- 🎨 **Modern Admin UI** - Beautiful, responsive interface built with shadcn/ui components
- 📁 **File Management** - Image transformation, S3/cloud storage, and URL repair tools
- 🔧 **Full TypeScript** - Type safety with generated types

## 🚀 Quick Start

**Install Sailor CMS into an existing SvelteKit project:**

```bash
npm install github:jonkristian/sailorcms
npx sailor core:init
```

See the [Getting Started Guide](https://jonkristian.github.io/sailorcms/getting-started) for complete setup instructions.

## 🏗️ How It Works

Sailor CMS uses a **template-driven approach**:

1. **Define Templates** - Create collections, blocks, and globals in `./src/lib/sailor/templates`
2. **Auto-Generate Schema** - Database schema is generated from your templates
3. **Dynamic Admin** - UI automatically adapts to your content structure
4. **Type Safety** - TypeScript integration with generated types

## 🚀 Tech Stack

- **Framework**: Built with and for [SvelteKit](https://svelte.dev/)
- **Database**: [Drizzle ORM](https://orm.drizzle.team/)
- **Authentication**: [Better Auth](https://better-auth.com/)
- **UI**: [shadcn-svelte](https://shadcn-svelte.com/)
- **Editor**: [TipTap](https://tiptap.dev/)

## 🛠️ What's Included

### CLI Installation System

- ✅ **GitHub Install** - `npm install github:jonkristian/sailorcms` from source
- ✅ **Core Updates** - `npx sailor core:update` keeps CMS files up-to-date
- ✅ **Database Management** - Schema generation and migration commands
- ✅ **File Repair Tools** - Fix S3/cloud storage URLs with built-in utilities

### Content Management

- ✅ **Dynamic Collections** - Create any content type (posts, pages, products)
- ✅ **Flexible Blocks** - Reusable content components with drag & drop
- ✅ **Rich Text Editor** - TipTap-powered WYSIWYG with syntax highlighting
- ✅ **File Management** - Upload, organize, and transform images with S3 support
- ✅ **Relations & Tags** - Connect content with tagging and relations

### Developer Experience

- ✅ **TypeScript First** - Full type safety with auto-generated types
- ✅ **Template System** - Define content structure in TypeScript
- ✅ **Utility Functions** - Load collections, globals, and files with complete objects
- ✅ **Image Processing** - Transform, resize, and optimize images with caching

## 📚 Documentation

📖 **[Complete Documentation](https://jonkristian.github.io/sailorcms/)** - Full guides and API reference

Key sections:

- 🚀 **[Getting Started](https://jonkristian.github.io/sailorcms/getting-started)** - Setup and first steps
- 🚢 **[Deployment](https://jonkristian.github.io/sailorcms/deployment-guide)** - Production deployment with Coolify
- 📝 **[Templates](https://jonkristian.github.io/sailorcms/core-concepts/templates)** - Creating collections, blocks, and globals
- 🔧 **[Field Types](https://jonkristian.github.io/sailorcms/core-concepts/field-types)** - Complete field reference
- 🛠️ **[Utilities](https://jonkristian.github.io/sailorcms/reference/utilities)** - Frontend helpers and API reference
- 🔐 **[ACL](https://jonkristian.github.io/sailorcms/rbac/acl)** - User roles and permissions

## 🛠️ Commands

### CLI Commands (Run from your project directory)

```bash
# Installation & Updates
npm install github:jonkristian/sailorcms  # Install from GitHub
npx sailor core:init                      # Initialize CMS in your project
npx sailor core:update                    # Update core CMS files

# Database Management
npx sailor db:update     # Update database schema from template changes
npx sailor db:generate   # Generate schema and migrations
npx sailor db:backup     # Backup database to S3/local
npx sailor db:restore    # Restore database from backup

# File Management
npx sailor files:repair  # Fix S3/cloud storage URLs

# User Management
npx sailor users:list    # List all users
npx sailor users:role    # Change user role
npx sailor users:verify  # Verify user account
```

## 🚢 Deployment

Sailor CMS works with any SvelteKit-compatible platform. See the **[Deployment Guide](https://jonkristian.github.io/sailorcms/deployment-guide)** for detailed instructions on:

- **Coolify** - Step-by-step containerized deployment
- **SQLite with persistent storage** - Database configuration
- **Automated backups** - S3/R2 backup setup

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](docs/contributing.md) for details on:

- Setting up the development environment
- Code style and conventions
- Submitting pull requests
- Reporting issues

## ⚠️ Disclaimer

Sailor CMS may contain bugs that could result in data loss. We are not responsible for any data loss or corruption. Always backup your data and use at your own risk.
