# Getting Started

Get Sailor running in your SvelteKit project in minutes.

## Installation

```bash
cd your-sveltekit-project
npm install github:jonkristian/sailorcms
npx sailor core:init
npx sailor db:update # Creates initial migration files & database based on providede templates.
```

## Remote functions (https://svelte.dev/docs/kit/remote-functions)

Sailor CMS uses the experimental remote functions and as such, you'll need to enable that in your `svelte.config.js`:

```bash
  experimental: {
    remoteFunctions: true,
  },
```

> **⚠️ Important**: If you have already installed Lucia, Drizzle, or Tailwind , you might have to do some manual setup. Sailor provides its own authentication, database layer, and styling. If you do install these packages, additional manual configuration will be required to avoid conflicts.

The installer will:

- Add required dependencies
- Copy CMS core files
- Set up admin routes at `/sailor`
- Generate database schema
- Give you starter templates for collections, blocks and globals.

## Environment Setup

See [Environment Variables](environment-variables.md) for complete configuration details.

**Quick start**: Create a `.env` file with at minimum:

```bash
BETTER_AUTH_SECRET=your-32-character-secret-key # https://auth-secret-gen.vercel.app/
DATABASE_URL=file:./sailor.sqlite
```

## Start Development

```bash
npm run dev
```

Visit http://localhost:5173/sailor to access the admin interface.

## User Role

When you've registered your account you would most likely want to give that account `admin` privileges. You can do this by running `npx sailor users:role your-email@domain.com admin`

## Ready to Use Templates

Sailor comes with pre-built templates including Posts, Pages, FAQ, Menus, and various block types. These are ready to use immediately - no coding required!

Learn more about templates and how to customize them in the **[Templates Guide](templates.md)**.

## Using Content in Your Frontend

Once you have content in your CMS, you'll want to display it on your website. Sailor provides simple utility functions to load your content.

See **[Utilities Guide](utilities.md)** for complete examples and API reference.

## Essential Commands

```bash
# Update database schema after template changes
npx sailor db:update

# Backup and restore database
npx sailor db:backup # Backup to S3/R2
npx sailor db:backup --output ./backups/ # Local backup
npx sailor db:restore backup-file.sqlite.gz --force # Restore from file

# Fix file URLs for cloud storage
npx sailor files:repair

# Manage users and roles
npx sailor users:list # List users
npx sailor users:role user@example.com admin # Change user role
npx sailor users:verify user@example.com # Verify a user
```

> **Note**: Use `npx sailor` for all CLI commands.

## Deployment

### Coolify

Deploy to Coolify with these simple settings:

**Install Command**: `npm install && npx sailor db:update`  
**Build Command**: `npm run build`  
**Start Command**: `node build`

Make sure your environment variables are configured in Coolify's environment tab.

## Next Steps

- **[Templates Guide](templates.md)** - Learn about collections, blocks, and globals
- **[Field Types](field-types.md)** - Complete field reference
- **[Utilities](utilities.md)** - Frontend helper functions

## Troubleshooting

**CMS admin not loading?**

- Ensure `BETTER_AUTH_SECRET` is set in `.env`
- Run `npx sailor db:update` to ensure latest database schema

**Database errors?**

- Verify `DATABASE_URL` format is correct
- For Turso, ensure `DATABASE_AUTH_TOKEN` is set
- Check network connectivity to database

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
