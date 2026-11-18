import type { EnvVarConfig } from '@sveltejs/kit/env';

// SvelteKit only exposes variables declared in `src/env.ts`; an undeclared one
// is simply missing from `$app/env/*`. Everything here is optional because
// sailor runs without OAuth, SMTP or Turnstile configured.
const optional = (value: string | undefined) => value;

/**
 * Environment variables sailor reads. Spread into your app's `src/env.ts`
 * (`core:init` / `core:update` do this for you):
 *
 * ```ts
 * import { defineEnvVars } from '@sveltejs/kit/env';
 * import { sailorEnvVars } from 'sailorcms/utils/env';
 *
 * export const variables = defineEnvVars({
 *   ...sailorEnvVars
 *   // your own variables
 * });
 * ```
 *
 * Declare a key yourself after the spread to tighten its schema.
 */
export const sailorEnvVars = {
  BETTER_AUTH_SECRET: {
    schema: optional,
    description: 'Secret used by Better Auth to sign sessions and tokens.'
  },
  EMAIL_VERIFICATION: {
    schema: optional,
    description: "Set to 'true' to require email verification before sign-in."
  },
  GITHUB_CLIENT_ID: { schema: optional, description: 'GitHub OAuth client id.' },
  GITHUB_CLIENT_SECRET: { schema: optional, description: 'GitHub OAuth client secret.' },
  GOOGLE_CLIENT_ID: {
    schema: optional,
    description: 'Google OAuth client id (sign-in and the Gmail mail driver).'
  },
  GOOGLE_CLIENT_SECRET: {
    schema: optional,
    description: 'Google OAuth client secret (sign-in and the Gmail mail driver).'
  },
  SMTP_HOST: { schema: optional, description: 'SMTP server host for the SMTP mail driver.' },
  SMTP_PORT: { schema: optional, description: 'SMTP server port.' },
  SMTP_SECURE: { schema: optional, description: "Set to 'true' for implicit TLS." },
  SMTP_USER: { schema: optional, description: 'SMTP username.' },
  SMTP_PASS: { schema: optional, description: 'SMTP password.' },
  SMTP_FROM: { schema: optional, description: 'Default From address for outgoing mail.' },
  TURNSTILE_SECRET_KEY: {
    schema: optional,
    description: 'Cloudflare Turnstile secret key (server-side verification).'
  },
  PUBLIC_BASE_URL: {
    public: true,
    schema: optional,
    description: 'Public origin of the app, used for auth callbacks and trusted origins.'
  },
  PUBLIC_TURNSTILE_SITE_KEY: {
    public: true,
    schema: optional,
    description: 'Cloudflare Turnstile site key (client widget).'
  }
} satisfies Record<string, EnvVarConfig<string>>;
