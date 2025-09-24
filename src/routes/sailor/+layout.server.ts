import type { LayoutServerLoad } from './$types';
import type { User } from '$sailor/generated/types';

export const load: LayoutServerLoad = async (event) => {
  // Authentication and authorization are handled by hooks
  // Layout just passes through user data if available
  return {
    user: event.locals.user as User | undefined
  };
};
