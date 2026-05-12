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

### Public Base URL (Required in production)

```env
# Your site's public origin. Used as Better Auth's baseURL and trustedOrigins.
# Defaults to http://localhost:5173 when unset (fine for local dev).
PUBLIC_BASE_URL=https://yourdomain.com
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

## Email

Sailor CMS supports two outbound-mail drivers: **SMTP** (default) and **Gmail API** (OAuth-based, no SMTP credentials). The driver is chosen at `/sailor/settings/mail`; once chosen, that setting overrides `MAIL_DRIVER`. Set `EMAIL_VERIFICATION=true` to require new accounts to verify their address before signing in.

```env
MAIL_DRIVER=smtp                    # smtp | gmail (used until /sailor/settings/mail saves an override)
EMAIL_VERIFICATION=false
```

### SMTP driver

Outbound mail via SMTP is disabled until `SMTP_HOST` and `SMTP_FROM` are both set.

```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587                       # 465 = implicit TLS, 587 = STARTTLS
SMTP_SECURE=                        # 'true' to force TLS; defaults true on port 465
SMTP_USER=
SMTP_PASS=
SMTP_FROM="Sailor CMS <noreply@example.com>"
```

### Gmail driver

Sends mail as a Google account that an admin has connected to a Sailor user — no SMTP credentials. Setup:

1. Create a Google OAuth 2.0 client in [Google Cloud Console](https://console.cloud.google.com) (type: Web application). Add redirect URI `{PUBLIC_BASE_URL}/sailor/api/auth/callback/google`.
2. **Enable the Gmail API** for the same project in the API Library — otherwise sends fail with `403 Gmail API has not been used`.
3. Move the OAuth consent screen to **In Production** in Google Cloud Console — Testing-mode refresh tokens expire after 7 days.
4. Set the env vars below, restart, then go to `/sailor/account` and click **Connect Google** to grant the `gmail.send` scope.
5. In `/sailor/settings/mail`, switch driver to **gmail** and pick the active sender account.

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

> Google issues a refresh token **only on first consent**. If you reconnect and tokens don't refresh, revoke the app at <https://myaccount.google.com/permissions> and reconnect.

## Cloudflare Turnstile (Auto-detected)

Captcha protection on admin sign-in / sign-up / password-reset activates when **both** keys are set. With only one half configured, captcha stays inactive (login keeps working) — by design, so a partial setup can't brick auth.

```env
PUBLIC_TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
```

The same `<Turnstile bind:token />` component and `verifyTurnstileToken(token, remoteIp?)` helper are exported from `sailorcms/utils/turnstile/...` for use on your own public-facing forms.

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
