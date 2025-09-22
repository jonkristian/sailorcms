import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import type { User } from '$sailor/generated/types';

export const load: LayoutServerLoad = async (event) => {
  // Skip authentication check for auth routes
  if (event.url.pathname.startsWith('/sailor/auth/')) {
    return {};
  }

  // Use user data from hooks - hooks handle invalid session redirects
  if (!event.locals.user) {
    throw redirect(303, '/sailor/auth/login');
  }

  // Just pass through user data - individual routes handle their own authorization
  return {
    user: event.locals.user as User
  };
};
