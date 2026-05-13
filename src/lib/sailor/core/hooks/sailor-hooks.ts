/**
 * Main Sailor hooks handler - single entry point for all hook logic
 */

import { redirect, error, type RequestEvent, type ResolveOptions } from '@sveltejs/kit';
import { AsyncLocalStorage } from 'node:async_hooks';
import { auth } from 'sailorcms/core/auth.server';
import { handleSailorLogging, log } from 'sailorcms/core/utils/logger';
import { initializeDatabase } from 'sailorcms/core/db/index.server';
import {
  baseLocale,
  cookieName as paraglideCookieName,
  cookieMaxAge as paraglideCookieMaxAge,
  locales,
  overwriteGetLocale,
  type Locale
} from '$sailor/i18n/paraglide/runtime';
import { resolvePreferences } from 'sailorcms/core/utils/user-preferences';

// Per-request locale via the official Paraglide pattern: we own a single
// AsyncLocalStorage, override `getLocale()` once at module load to read from
// it, and wrap each request's `resolve(event)` in `localeStore.run(locale)`
// after we know the user's preference. This sidesteps the bundled
// `paraglideMiddleware` (whose cookie/global strategies resolve too early —
// before we know the user) while still giving us request-safe scoping.
const localeStore = new AsyncLocalStorage<Locale>();
overwriteGetLocale(() => localeStore.getStore() ?? baseLocale);

// Pick the best Paraglide locale from a comma-separated `Accept-Language`
// header. Tries each tag (and its language-only prefix, e.g. `nb` from `nb-NO`)
// in q-weighted order against the available locales; returns the first hit
// or null if nothing matches. Tolerant of malformed q-values.
function pickLocaleFromAcceptLanguage(
  header: string | null | undefined,
  available: readonly string[]
): string | null {
  if (!header) return null;
  const tags = header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part
        .trim()
        .split(';')
        .map((s) => s.trim());
      const qParam = params.find((p) => p.startsWith('q='));
      const q = qParam ? Number.parseFloat(qParam.slice(2)) : 1;
      return { tag, q: Number.isFinite(q) ? q : 0 };
    })
    .filter(({ tag, q }) => tag && q > 0)
    .sort((a, b) => b.q - a.q);

  const lowerAvailable = available.map((l) => l.toLowerCase());
  for (const { tag } of tags) {
    const lower = tag.toLowerCase();
    // Exact match (e.g. `nb-NO`)
    const exact = lowerAvailable.indexOf(lower);
    if (exact !== -1) return available[exact];
    // Language-prefix match (e.g. `en` matches `en-US` or just `en`)
    const prefix = lower.split('-')[0];
    const prefixHit = lowerAvailable.findIndex((l) => l === prefix || l.startsWith(`${prefix}-`));
    if (prefixHit !== -1) return available[prefixHit];
  }
  return null;
}

function resolveRequestLocale(
  user: User | null | undefined,
  acceptLanguage: string | null
): Locale {
  const prefs = resolvePreferences(user?.preferences);
  const explicit = prefs.language;

  // Explicit user preference wins, if it matches an available locale.
  if (explicit && explicit !== 'auto' && (locales as readonly string[]).includes(explicit)) {
    return explicit as Locale;
  }

  // 'auto' or unset → use Accept-Language header.
  const fromHeader = pickLocaleFromAcceptLanguage(acceptLanguage, locales);
  if (fromHeader) return fromHeader as Locale;

  return baseLocale;
}

// Initialize database on server startup (avoid top-level await). The local
// `dbInitialized` flag we used to keep here drifted from index.server.ts on
// HMR — Vite would reload index.server.ts (nulling dbInstance/dbPromise) while
// this module stayed cached at `dbInitialized = true`, so the next request
// early-returned and then hit "Database not initialized" on the proxy.
// `initializeDatabase()` is already idempotent via its own `dbPromise` memo,
// so awaiting it unconditionally per request is correct AND HMR-safe.
async function ensureDatabaseInitialized() {
  await initializeDatabase();
}

type User = {
  id: string;
  email: string;
  name: string;
  role: string;
  image?: string | null;
  preferences?: string | null;
};

/**
 * Check route access using better-auth permissions directly
 */
async function checkRouteAccess(pathname: string, user: User | null | undefined): Promise<void> {
  // Public routes that don't require authentication
  const publicRoutes = [
    '/sailor/auth/login',
    '/sailor/auth/signup',
    '/sailor/api/auth',
    '/sailor/api/images'
  ];

  // Check if this is a public route
  if (publicRoutes.some((route) => pathname.startsWith(route))) {
    return;
  }

  // All /sailor routes require authentication (authorization handled by individual routes)
  if (pathname.startsWith('/sailor') && !pathname.startsWith('/sailor/auth')) {
    if (!user?.id) {
      throw redirect(302, '/sailor/auth/login');
    }
  }
}

type MaybePromise<T> = T | Promise<T>;

/**
 * Complete Sailor hooks handler - handles auth, logging, ACL, everything
 * Single entry point for hooks.server.ts
 */
export async function handleSailorHooks(
  event: RequestEvent,
  resolve: (event: RequestEvent, opts?: ResolveOptions) => MaybePromise<Response>
): Promise<Response> {
  // Initialize database on first request
  await ensureDatabaseInitialized();

  return handleSailorLogging(event, async () => {
    // Handle auth API routes
    if (event.url.pathname.startsWith('/sailor/api/auth')) {
      return await auth.handler(event.request);
    }

    return handleSailorRequest(event, resolve);
  });
}

async function handleSailorRequest(
  event: RequestEvent,
  resolve: (event: RequestEvent, opts?: ResolveOptions) => MaybePromise<Response>
): Promise<Response> {
  // Get session for other routes
  const session = await auth.api.getSession({
    headers: event.request.headers
  });

  // Set up user and security object

  if (session?.user) {
    event.locals.user = {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name || '',
      role: ((session.user as Record<string, unknown>).role as string) || 'user',
      image: ((session.user as Record<string, unknown>).image as string) || null,
      preferences:
        ((session.user as Record<string, unknown>).preferences as string | null | undefined) ?? null
    };
  }

  // Set up security object using better-auth's permission system
  event.locals.security = {
    hasPermission: async (action: string, resource: string): Promise<boolean> => {
      if (!event.locals.user?.id) return false;

      try {
        // Use better-auth's userHasPermission method
        const result = await auth.api.userHasPermission({
          body: {
            userId: event.locals.user.id,
            permissions: {
              [resource]: [action]
            }
          }
        });

        return result?.success === true;
      } catch (error) {
        console.warn('Better-auth permission check failed:', {
          userId: event.locals.user.id,
          resource,
          action,
          error: (error as Error).message
        });
        return false;
      }
    }
  } as any;

  // Apply ACL protection for admin routes
  if (event.url.pathname.startsWith('/sailor')) {
    // Redirect authenticated users away from auth pages
    if (event.url.pathname.startsWith('/sailor/auth/') && session?.user) {
      throw redirect(302, '/sailor');
    }

    // Better-auth route protection
    try {
      await checkRouteAccess(event.url.pathname, event.locals.user);
    } catch (err) {
      // Re-throw SvelteKit redirects and HTTP errors
      if (err instanceof Response) {
        throw err;
      }

      // Check for SvelteKit redirect response objects
      if (
        err &&
        typeof err === 'object' &&
        (err as any).status &&
        ((err as any).status === 302 || (err as any).status === 301)
      ) {
        throw err;
      }

      // Log and re-throw the original error for debugging
      log.error('Route protection error', {
        error: err,
        errorMessage: (err as Error)?.message,
        errorStack: (err as Error)?.stack,
        errorType: typeof err,
        errorConstructor: err?.constructor?.name,
        pathname: event.url.pathname,
        user: event.locals.user
      });
      throw error(500, 'Internal server error during access control check');
    }
  }

  // Resolve the user's preferred locale, then run `resolve(event)` inside
  // the AsyncLocalStorage scope. `getLocale()` reads from this store via
  // our `overwriteGetLocale` install at module load, so all `m.foo()` calls
  // during render see the right locale. Request-safe across concurrency.
  const locale = resolveRequestLocale(
    event.locals.user,
    event.request.headers.get('accept-language')
  );

  // Mirror the resolved locale into Paraglide's cookie so the client-side
  // runtime (which uses the default cookie → global → baseLocale strategy
  // chain after hydration) picks up the same value. Without this, the
  // browser hydrates with the en fallback and visibly flips Norwegian back
  // to English a tick after first paint.
  if (event.cookies.get(paraglideCookieName) !== locale) {
    event.cookies.set(paraglideCookieName, locale, {
      path: '/',
      maxAge: paraglideCookieMaxAge,
      httpOnly: false,
      sameSite: 'lax'
    });
  }

  const response = await localeStore.run(locale, () => resolve(event));

  if (event.url.pathname.startsWith('/sailor')) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  }

  return response;
}
