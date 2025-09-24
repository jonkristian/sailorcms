# Deployment Guide

This guide covers deploying Sailor CMS to production using Coolify.

## Coolify Deployment

Coolify is a self-hosted platform-as-a-service that makes deployment simple and reliable.

### Prerequisites

- Coolify server set up and running
- GitHub repository with your Sailor CMS project
- S3/R2 storage configured (optional, for backups and file uploads)

### Deployment Configuration

Deploy to Coolify with these settings:

**Recommended Deployment (with Backup Restore):**

- **Install Command**: `npm install`
- **Build Command**: `npm run build`
- **Start Command**: `node build`
- **After deployment**: Run `bun sailor db:restore --force` in terminal to restore from S3

**Fresh Deployment (new projects only):**

- **Install Command**: `npm install`
- **Build Command**: `npm run build`
- **Start Command**: `node build`
- **After deployment**: Run `bun sailor db:update` in terminal to initialize database

### SQLite with Persistent Storage

For SQLite databases, configure persistent storage to ensure your data survives deployments:

#### 1. Add Persistent Storage

- Go to your application → Storage
- Add new storage volume
- **Destination Path**: `/app/data` (important: `/app/` means inside container)
- This creates a persistent volume for your database files

#### 2. Environment Variables

Configure these in Coolify's Environment tab:

```bash
# Database
DATABASE_URL=file:./data/sailor.sqlite

# Authentication (required)
BETTER_AUTH_SECRET=your-32-character-secret-key

# Optional: GitHub OAuth
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# Optional: S3/R2 Storage (auto-enabled if S3_BUCKET is set)
S3_BUCKET=your-bucket-name
S3_REGION=auto
S3_ACCESS_KEY_ID=your-access-key
S3_SECRET_ACCESS_KEY=your-secret-key
S3_ENDPOINT=https://your-r2-endpoint.com
S3_PUBLIC_URL=https://your-public-url.com

# Optional: File Upload Configuration
UPLOAD_FOLDER_STRUCTURE=flat
UPLOAD_MAX_FILE_SIZE=10.0MB
UPLOAD_ALLOWED_TYPES=image/*,application/pdf

# Optional: System Configuration
DEBUG_MODE=false
LOG_LEVEL=warn
```

#### 3. Automated Backups (Optional)

Set up automated database backups using Coolify's cron jobs:

- Add a cron job service in Coolify
- **Schedule**: `0 2 * * *` (daily at 2 AM)
- **Command**: `bun sailor db:backup`
- Configure S3/R2 environment variables for cloud backup storage

### Deployment Process

1. **Connect Repository**: Link your GitHub repository to Coolify
2. **Configure Build Settings**: Use the commands above
3. **Set Environment Variables**: Add all required environment variables
4. **Add Persistent Storage**: Configure `/app/data` volume mount
5. **Deploy**: Trigger the initial deployment
6. **Initialize Database**:
   - For fresh projects: Run `bun sailor db:update` in terminal
   - For existing projects: Run `bun sailor db:restore --force` in terminal

### Post-Deployment Setup

After successful deployment:

1. **Access Admin Panel**: Visit `https://your-domain.com/sailor`
2. **Create Admin User**: Register your first admin account
3. **Set User Role**: Run `bun sailor users:role your-email@domain.com admin` in terminal
4. **Test Backup/Restore**: Verify your backup system works
5. **Configure Content**: Start creating your content structure

### Troubleshooting

**Build Failures:**

- Ensure environment variables are set correctly
- Check that persistent storage destination is `/app/data`
- Verify SvelteKit configuration includes required experimental features

**Database Connection Issues:**

- Confirm `DATABASE_URL=file:./data/sailor.sqlite`
- Check persistent storage is mounted to `/app/data`
- Ensure database initialization completed successfully

**File Upload Issues:**

- Verify S3/R2 credentials if using cloud storage
- Check upload directory permissions for local storage
- Confirm `UPLOAD_*` environment variables are set correctly

**Authentication Problems:**

- Verify `BETTER_AUTH_SECRET` is exactly 32 characters
- Check OAuth provider credentials if using GitHub/Google
- Clear browser cookies and try again

### Benefits of This Setup

- **Data Persistence**: SQLite database and uploads survive deployments
- **Automated Backups**: Daily backups to S3/R2 storage
- **Zero Downtime**: Quick deployments with persistent storage
- **Cost Effective**: SQLite requires no external database service
- **Scalable Storage**: S3/R2 integration for file uploads and backups

### Next Steps

- **[Environment Variables](environment-variables.md)** - Complete configuration reference
- **[Templates Guide](templates.md)** - Set up your content structure
- **[Utilities](utilities.md)** - Display content in your frontend
