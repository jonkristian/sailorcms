import type { PageServerLoad } from './$types';
import * as env from '$app/env/private';
import { SystemSettingsService } from 'sailorcms/core/services/settings.server';

export const load: PageServerLoad = async () => {
  const hasGitHubOAuth = !!(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET);

  // Use service directly in load function since remote functions can't be called during SSR
  const registrationEnabled = await SystemSettingsService.isRegistrationEnabled();

  return {
    hasGitHubOAuth,
    registrationEnabled
  };
};
