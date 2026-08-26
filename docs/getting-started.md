---
layout: default
title: Getting Started
nav_order: 2
---

# Getting Started

Get Sailor running in your SvelteKit project in minutes.

## Installation

If you don't have a SvelteKit project yet, scaffold one first (pick the `adapter-node` option when prompted):

```bash
npx sv create your-app
cd your-app
```

Then install Sailor:

```bash
npm install github:jonkristian/sailorcms
npx sailor core:init # Initializes the cms by copying required files into your project.
npx sailor db:update # Regenerate files from your templates & updates your database.
```

`core:init` patches your `svelte.config.js` automatically (adds `kit.experimental.remoteFunctions`, ensures `compilerOptions.runes: true` and `compilerOptions.experimental.async: true`, and wires up `vitePreprocess({ script: true })`). If anything was skipped because your config didn't match the expected shape, run `npx sailor doctor --fix` to apply the missing pieces.

> **⚠️ Important**: If you have already installed Lucia, Drizzle, or Tailwind , you might have to do some manual setup. Sailor provides its own authentication, database layer, and styling. If you do install these packages, additional manual configuration will be required to avoid conflicts.

The installer will:

- Add required dependencies
- Copy CMS core files
- Set up admin routes at `/sailor`
- Generate database schema
- Give you starter templates for collections, blocks and globals.

## Environment Setup

`core:init` creates a `.env` for you (when one didn't already exist) with a freshly generated `BETTER_AUTH_SECRET` and `DATABASE_URL=file:./sailor.sqlite`. The full annotated reference lives in `.env.sailor` — copy any extras you need (Turso/Postgres URL, S3 storage, SMTP, OAuth) into `.env`.

If you already had a `.env`, the installer leaves it alone. In that case make sure it has at minimum:

```bash
BETTER_AUTH_SECRET=your-32-character-secret-key # generate with: openssl rand -base64 32
DATABASE_URL=file:./sailor.sqlite
```

See [Environment Variables](environment-variables.md) for complete configuration details.

## Start Development

```bash
npm run dev
```

Visit http://localhost:5173/sailor to access the admin interface.

## User Role

When you've registered your account you would most likely want to give that account `admin` privileges. You can do this by running `npx sailor users:role your-email@domain.com admin`

## Ready to Use Templates

Sailor comes with pre-built templates including Posts, Pages, FAQ, Menus, and various block types. These are ready to use immediately - no coding required!

Learn more about templates and how to customize them in the **[Templates Guide](core-concepts/templates.md)**.

## Using Content in Your Frontend

Once you have content in your CMS, you'll want to display it on your website. Sailor provides simple utility functions to load your content.

See **[Utilities Guide](reference/utilities.md)** for complete examples and API reference.

## Essential Commands

```bash
# Update database schema after template changes
npx sailor db:update

# Backup and restore database
npx sailor db:backup # Backup to S3/R2
npx sailor db:backup --output ./backups/ # Local backup
npx sailor db:restore backup-file.sqlite.gz --force # Restore from file

# Repair drifted DB (missing columns from generated/schema.ts)
npx sailor db:repair --dry-run # Preview ALTERs without applying
npx sailor db:repair # Apply missing columns
npx sailor db:repair --all # Also run the data repairs below, in dependency order

# Repair timestamp columns containing millisecond values (0.4.0 ms-leak)
npx sailor db:repair-timestamps --dry-run

# Backfill accounts.issuer after upgrading to better-auth 1.7 (run after db:update)
npx sailor db:repair-accounts --dry-run
npx sailor db:repair-accounts

# Manage users and roles
npx sailor users:list # List users
npx sailor users:role user@example.com admin # Change user role
npx sailor users:verify user@example.com # Verify a user

# Diagnose common setup issues (run if upgrade or build behaves oddly)
npx sailor doctor # Read-only healthcheck
npx sailor doctor --fix # Auto-fix what's fixable
```

> **Note**: Use `npx sailor` for all CLI commands.

## Deployment

Ready to deploy your Sailor CMS to production? See the complete **[Deployment Guide](deployment-guide/deployment.md)** for step-by-step instructions for Coolify deployment, including:

- SQLite with persistent storage
- Environment variable configuration
- Automated backup setup
- Troubleshooting tips

## Next Steps

- **[Deployment Guide](deployment-guide/deployment.md)** - Deploy to production with Coolify
- **[Templates Guide](core-concepts/templates.md)** - Learn about collections, blocks, and globals
- **[Field Types](core-concepts/field-types.md)** - Complete field reference
- **[Utilities](reference/utilities.md)** - Frontend helper functions

## Troubleshooting

**First stop:** `npx sailor doctor` runs a read-only healthcheck across config, deps, schema, and routes. `npx sailor doctor --fix` auto-applies anything fixable. Run it before digging into the specific cases below.

**CMS admin not loading?**

- Ensure `BETTER_AUTH_SECRET` is set in `.env`
- Run `npx sailor db:update` to ensure latest database schema

**Database errors?**

- Verify `DATABASE_URL` format is correct
- For Turso, ensure `DATABASE_AUTH_TOKEN` is set
- Check network connectivity to database

**`db:update` reports "Schema drift detected"?**

This happens when migration tracking thinks migrations are applied but the DB schema doesn't match. Most commonly seen after upgrading from pre-0.4.0 push-mode syncing. Run `npx sailor db:repair --dry-run` to see which columns are missing, then `npx sailor db:repair` to apply them. Future `db:update` runs will then succeed normally.

**Fields you defined in templates aren't showing in the database?**

- First check: `npx sailor db:repair --dry-run` will list any missing columns
- If drift is detected, run `npx sailor db:repair` to apply the missing columns to the live DB
- Verify the field key in your template doesn't conflict with a core field (e.g. `id`, `slug`, `created_at`)

**Authentication issues?**

- Ensure `BETTER_AUTH_SECRET` is exactly 32 characters
- Regenerate secret with `openssl rand -base64 32`
- Clear browser cookies and try again

**Template changes not showing?**

- Run `npx sailor db:update` after making changes
- Restart your development server
- Check template syntax for typos
- Ensure all required fields are defined
- Verify field types are valid
