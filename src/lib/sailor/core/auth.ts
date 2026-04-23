// Shared auth exports - types and utilities only
// Server-only auth setup is in auth.server.ts

import { createAuthClient } from 'better-auth/svelte';
import { browser } from '$app/environment';
import { env } from '$env/dynamic/public';

const baseURL = browser
  ? window.location.origin
  : env.PUBLIC_BASE_URL || 'http://localhost:5173';

export const authClient = createAuthClient({
  baseURL: `${baseURL}/sailor/api/auth`
});

// Export auth types
export type { User, Session } from 'better-auth';
