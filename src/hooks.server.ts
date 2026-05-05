import { type Handle } from '@sveltejs/kit';
import { handleSailorHooks } from 'sailorcms/core/hooks/sailor-hooks';

export const handle: Handle = async ({ event, resolve }) => {
  return handleSailorHooks(event, resolve);
};
