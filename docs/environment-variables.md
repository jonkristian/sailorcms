---
layout: default
title: Environment Variables
nav_order: 3
---

# Environment Variables

Complete reference for all environment variables in Sailor CMS. For basic setup, see the [Getting Started Guide](getting-started.md).

## Essential Variables

### Authentication (Required)

```env
# Generate with: openssl rand -base64 32
BETTER_AUTH_SECRET=your-32-character-secret-key
```

### Database (Required)

```env
# SQLite (Local)
DATABASE_URL=file:./sailor.sqlite
```

```env
# Turso (Remote SQLite) - auth token can be in URL or separate env var
DATABASE_URL=libsql://your-database.turso.io?authToken=your-token
# OR
DATABASE_URL=libsql://your-database.turso.io
DATABASE_AUTH_TOKEN=your-auth-token
```

```env
# PostgreSQL
DATABASE_URL=postgresql://user:password@localhost:5432/sailor
```

## File Storage

### Local Storage (Default)

```env
UPLOAD_DIR=static/uploads
# Storage provider auto-detected: local if no S3_BUCKET
```

### S3/Cloud Storage (Auto-detected)

```env
S3_BUCKET=your-bucket-name  # Setting this enables S3 storage automatically
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=your-access-key
S3_SECRET_ACCESS_KEY=your-secret-key
S3_ENDPOINT=https://s3.amazonaws.com
S3_PUBLIC_URL=https://your-bucket.s3.amazonaws.com
```

## File Upload Settings

```env
# File size limit
UPLOAD_MAX_FILE_SIZE=10.0MB

# Allowed file types (comma-separated MIME types)
UPLOAD_ALLOWED_TYPES=image/*,application/pdf,text/plain

# Folder structure: flat, date, type
UPLOAD_FOLDER_STRUCTURE=flat
```

## Image Cache Settings

```env
# Maximum cache size (optional)
CACHE_MAX_SIZE=1GB
```

**Note:** Image caching automatically follows your storage provider:

- **Local storage:** Cached images stored in `{UPLOAD_DIR}/cache/`
- **S3/R2 storage:** Cached images stored in S3 bucket `cache/` folder
- All cached images are optimized as WebP by default for better performance
