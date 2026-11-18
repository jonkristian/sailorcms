import type { Handle } from '@sveltejs/kit/hooks';
import { handleSailorHooks } from 'sailorcms/core/hooks/sailor-hooks';

export const handle: Handle = async ({ event, resolve }) => {
  return handleSailorHooks(event, resolve);
};
