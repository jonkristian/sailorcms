import type { LayoutServerLoad } from './$types';
import { getSiteSettings } from 'sailorcms/utils/data/site';

export const load: LayoutServerLoad = async (event) => {
  const siteSettings = await getSiteSettings();

  return {
    hasDemoContent: true,
    user: event.locals.user,
    siteSettings
  };
};
