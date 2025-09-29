/**
 * Main Sailor hooks handler - single entry point for all hook logic
 */

import { redirect, error, type RequestEvent, type ResolveOptions } from '@sveltejs/kit';
import { auth } from '$sailor/core/auth.server';
import { handleSailorLogging, log } from '$sailor/core/utils/logger';

type User = {
  id: string;
  email: string;
  name: string;
  role: string;
  image?: string | null;
};

/**
 * Check route access using better-auth permissions directly
 */
async function checkRouteAccess(pathname: string, user: User | null | undefined): Promise<void> {
  // Public routes that don't require authentication
  const publicRoutes = [
    '/sailor/auth/login',
    '/sailor/auth/signup',
    '/sailor/api/auth'
  ];

  // Check if this is a public route
  if (publicRoutes.some(route => pathname.startsWith(route))) {
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
  return handleSailorLogging(event, async () => {
    // Handle auth API routes
    if (event.url.pathname.startsWith('/sailor/api/auth')) {
      return await auth.handler(event.request);
    }

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
        image: ((session.user as Record<string, unknown>).image as string) || null
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
        if (err && typeof err === 'object' && (err as any).status && ((err as any).status === 302 || (err as any).status === 301)) {
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

    return await resolve(event);
  });
}
