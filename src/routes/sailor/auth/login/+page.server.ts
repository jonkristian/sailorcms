import type { PageServerLoad } from './$types';
import { env } from '$env/dynamic/private';
import { SystemSettingsService } from '$sailor/core/services/system-settings.server';

export const load: PageServerLoad = async () => {
  const hasGitHubOAuth = !!(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET);

  // Use service directly in load function since remote functions can't be called during SSR
  const registrationEnabled = await SystemSettingsService.isRegistrationEnabled();

  return {
    hasGitHubOAuth,
    registrationEnabled
  };
};
