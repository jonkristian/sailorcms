import type { PageServerLoad } from './$types';
import { env } from '$env/dynamic/private';
import { redirect, error } from '@sveltejs/kit';
import { SystemSettingsService } from '$sailor/core/services/system-settings.server';

export const load: PageServerLoad = async () => {
  // Check if registrations are enabled
  const registrationEnabled = await SystemSettingsService.isRegistrationEnabled();

  if (!registrationEnabled) {
    throw error(403, 'User registrations are currently disabled');
  }

  // Check if GitHub OAuth is configured
  const hasGitHubOAuth = !!(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET);

  return {
    hasGitHubOAuth,
    registrationEnabled
  };
};
