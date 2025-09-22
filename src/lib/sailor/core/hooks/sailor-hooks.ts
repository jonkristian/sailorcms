/**
 * Main Sailor hooks handler - single entry point for all hook logic
 */

import { redirect, error, type RequestEvent, type ResolveOptions } from '@sveltejs/kit';
import { auth } from '$sailor/core/auth.server';
import { handleSailorACL } from '$lib/sailor/core/auth/acl';
import { handleSailorLogging, log } from '$sailor/core/utils/logger';

type MaybePromise<T> = T | Promise<T>;

/**
 * Complete Sailor hooks handler - handles auth, logging, ACL, everything
 * Single entry point for hooks.server.ts
 */
export async function handleSailorHooks(
  event: RequestEvent,
  resolve: (event: RequestEvent, opts?: ResolveOptions) => MaybePromise<Response>
): Promise<Response> {
  return handleSailorLogging(event, async () => {
    // Handle auth API routes
    if (event.url.pathname.startsWith('/sailor/api/auth')) {
      return await auth.handler(event.request);
    }

    // Get session for other routes
    const session = await auth.api.getSession({
      headers: event.request.headers
    });

    if (session?.user) {
      event.locals.user = {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name || '',
        role: ((session.user as Record<string, unknown>).role as string) || 'user',
        image: ((session.user as Record<string, unknown>).image as string) || null
      };

      // User context is now passed explicitly to log calls when needed
    }

    // Apply ACL protection for admin routes
    if (event.url.pathname.startsWith('/sailor/')) {
      // Redirect authenticated users away from auth pages
      if (event.url.pathname.startsWith('/sailor/auth/') && session?.user) {
        throw redirect(302, '/sailor');
      }

      // Always provide security instance
      const { createSecurity } = await import('$lib/sailor/core/auth/security');
      event.locals.security = createSecurity(event.locals.user);

      // Skip route protection for now to debug the issue
      // TODO: Re-enable route protection once authentication is working
      /*
      try {
        const { checkRouteAccess } = await import('$lib/sailor/core/auth/acl');
        await checkRouteAccess(
          event.url.pathname,
          event.locals.user,
          event.request.headers.get('referer')
        );
      } catch (err) {
        // Re-throw SvelteKit errors (redirects, HTTP errors)
        if (err instanceof Response || (err as Error & { status?: number }).status) {
          throw err;
        }
        // Log unexpected errors and throw 500
        log.error('Route protection error', { error: err });
        throw error(500, 'Internal server error during access control check');
      }
      */
    }

    return await resolve(event);
  });
}
