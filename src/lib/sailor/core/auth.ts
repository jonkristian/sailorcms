// Shared auth exports - types and utilities only
// Server-only auth setup is in auth.server.ts

import { createAuthClient } from 'better-auth/svelte';
import { browser } from '$app/environment';

export const authClient = createAuthClient({
  baseURL: browser
    ? `${window.location.origin}/sailor/api/auth`
    : 'http://localhost:5173/sailor/api/auth'
});

// Export auth types
export type { User, Session } from 'better-auth';
