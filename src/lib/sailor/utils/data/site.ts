// Site configuration utilities

import type { SiteConfig } from '../types';

/**
 * Get site configuration from core CMS settings
 *
 * @example
 * ```typescript
 * import { getSiteSettings } from '$lib/sailor/utils/site';
 *
 * const config = await getSiteSettings();
 * ```
 */
export async function getSiteSettings(): Promise<SiteConfig> {
  try {
    // Get core site settings from SystemSettingsService
    const { SystemSettingsService } = await import('$sailor/core/services/settings.server');

    const [siteName, siteUrl, siteDescription, registrationEnabled] = await Promise.all([
      SystemSettingsService.getSetting('site.name'),
      SystemSettingsService.getSetting('site.url'),
      SystemSettingsService.getSetting('site.description'),
      SystemSettingsService.isRegistrationEnabled()
    ]);

    return {
      siteName: siteName || undefined,
      siteUrl: siteUrl || undefined,
      siteDescription: siteDescription || undefined,
      registrationEnabled: registrationEnabled ?? true // Default to true if undefined
    };
  } catch (error) {
    console.warn('Failed to load site configuration:', error);
    // Return a proper default object instead of empty object
    return {
      siteName: undefined,
      siteUrl: undefined,
      siteDescription: undefined,
      registrationEnabled: true
    };
  }
}
