import { getSettings } from '$lib/sailor/core/settings';

export const load = async () => {
  // Authentication and admin authorization handled by hooks

  const settings = await getSettings();
  const roleSettings = settings.roles || {
    definitions: {},
    defaultRole: 'user',
    adminRoles: ['admin', 'editor']
  };

  return {
    roleSettings
  };
};
