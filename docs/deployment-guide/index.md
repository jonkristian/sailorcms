---
layout: default
title: Deployment
nav_order: 6
has_children: true
---

# Deployment Guide

Sailor CMS is built with SvelteKit, which means it can be deployed anywhere Node.js applications can run. This section covers various deployment options and configurations.

## Deployment Platforms

### Modern Platforms

- **Coolify** - Self-hosted alternative to Heroku (recommended, works with the default `adapter-node`)
- **Vercel** - Zero-config deployments with automatic HTTPS (requires `@sveltejs/adapter-vercel`)
- **Netlify** - Git-based deployments with form handling (requires `@sveltejs/adapter-netlify`)

### Traditional Hosting

- **VPS/Dedicated Servers** - Full control over your hosting environment
- **Docker** - Containerized deployments for consistent environments

### Database Options

- **SQLite** - File-based database, perfect for small to medium sites
- **PostgreSQL** - Robust database for high-traffic applications
- **Turso** - Edge SQLite database for global performance

## Quick Deployment

The fastest way to get started is with Coolify or any Node.js hosting platform:

1. Push your Sailor CMS project to GitHub
2. Connect your repository to your hosting platform
3. Set your environment variables
4. Deploy!

> **Note**: Sailor CMS ships with `@sveltejs/adapter-node` by default. If you want to deploy to Vercel or Netlify, you'll need to swap the adapter in your `svelte.config.js`. See the [SvelteKit adapter docs](https://svelte.dev/docs/kit/adapters) for details.

[Learn more about specific deployment methods]({{ site.baseurl }}{% link deployment-guide/deployment.md %})

## Environment Configuration

Make sure to configure these essential environment variables for production:

```bash
# Database
DATABASE_URL="your-database-url"

# Authentication
BETTER_AUTH_SECRET="your-secret-key"

# File Storage (optional)
S3_BUCKET="your-s3-bucket"
S3_ACCESS_KEY_ID="your-access-key"
S3_SECRET_ACCESS_KEY="your-secret-key"
```

[Complete Environment Variables Reference]({{ site.baseurl }}{% link environment-variables.md %})
