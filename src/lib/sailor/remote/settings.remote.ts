// SvelteKit remote functions for settings management
import { command, getRequestEvent } from '$app/server';
import { SystemSettingsService } from '$sailor/core/services/settings.server';

/**
 * Update site settings
 */
export const updateSiteSettings = command(
  'unchecked',
  async ({
    siteName,
    siteUrl,
    siteDescription,
    allowRegistration
  }: {
    siteName: string;
    siteUrl?: string;
    siteDescription?: string;
    allowRegistration: boolean;
  }) => {
    const { locals } = getRequestEvent();

    // Check permission to update settings
    if (!(await locals.security.hasPermission('update', 'settings'))) {
      return { success: false, error: 'Access denied: You do not have permission to update settings' };
    }

    if (!siteName || !siteName.trim()) {
      return { success: false, error: 'Site name is required' };
    }

    try {
      // Save settings using SystemSettingsService
      await Promise.all([
        SystemSettingsService.setSetting('site.name', siteName.trim(), 'site', 'Site name'),
        siteUrl && siteUrl.trim()
          ? SystemSettingsService.setSetting('site.url', siteUrl.trim(), 'site', 'Site base URL')
          : SystemSettingsService.deleteSetting('site.url'),
        siteDescription && siteDescription.trim()
          ? SystemSettingsService.setSetting(
            'site.description',
            siteDescription.trim(),
            'site',
            'Site description'
          )
          : SystemSettingsService.deleteSetting('site.description'),
        SystemSettingsService.setRegistrationEnabled(allowRegistration)
      ]);

      return {
        success: true,
        message: 'Site settings updated successfully'
      };
    } catch (error) {
      console.error('Failed to update site settings:', error);
      return { success: false, error: 'Failed to update site settings' };
    }
  }
);

/**
 * Update a single setting
 */
export const updateSetting = command(
  'unchecked',
  async ({
    key,
    value,
    category,
    description
  }: {
    key: string;
    value: string | number | boolean | null;
    category: string;
    description?: string;
  }) => {
    const { locals } = getRequestEvent();

    // Check permission to update settings
    if (!(await locals.security.hasPermission('update', 'settings'))) {
      return { success: false, error: 'Access denied: You do not have permission to update settings' };
    }

    if (!key || !category) {
      return { success: false, error: 'Setting key and category are required' };
    }

    try {
      if (value === null || value === undefined || value === '') {
        // Delete setting if value is null/empty
        await SystemSettingsService.deleteSetting(key);
      } else {
        // Set the setting
        await SystemSettingsService.setSetting(key, value, category, description);
      }

      return {
        success: true,
        message: 'Setting updated successfully'
      };
    } catch (error) {
      console.error('Failed to update setting:', error);
      return { success: false, error: 'Failed to update setting' };
    }
  }
);

/**
 * Delete a setting
 */
export const deleteSetting = command('unchecked', async ({ key }: { key: string }) => {
  const { locals } = getRequestEvent();

  // Authentication handled by hooks - admin check required for settings
  if (locals.user!.role !== 'admin') {
    return { success: false, error: 'Admin access required' };
  }

  if (!key) {
    return { success: false, error: 'Setting key is required' };
  }

  try {
    await SystemSettingsService.deleteSetting(key);

    return {
      success: true,
      message: 'Setting deleted successfully'
    };
  } catch (error) {
    console.error('Failed to delete setting:', error);
    return { success: false, error: 'Failed to delete setting' };
  }
});

/**
 * Get a setting by key
 */
export const getSetting = command('unchecked', async ({ key }: { key: string }) => {
  if (!key) {
    return { success: false, error: 'Setting key is required' };
  }

  try {
    const value = await SystemSettingsService.getSetting(key);
    return { success: true, value };
  } catch (error) {
    console.error('Failed to get setting:', error);
    return { success: false, error: 'Failed to get setting' };
  }
});

/**
 * Check if registration is enabled
 */
export const isRegistrationEnabled = command('unchecked', async () => {
  try {
    const enabled = await SystemSettingsService.isRegistrationEnabled();
    return { success: true, enabled };
  } catch (error) {
    console.error('Failed to check registration status:', error);
    return { success: false, error: 'Failed to check registration status' };
  }
});

/**
 * Get multiple settings at once
 */
export const getSettings = command('unchecked', async ({ keys }: { keys: string[] }) => {
  if (!Array.isArray(keys) || keys.length === 0) {
    return { success: false, error: 'Setting keys are required' };
  }

  try {
    const settings = await Promise.all(
      keys.map(async (key) => {
        const value = await SystemSettingsService.getSetting(key);
        return { key, value };
      })
    );
    return { success: true, settings };
  } catch (error) {
    console.error('Failed to get settings:', error);
    return { success: false, error: 'Failed to get settings' };
  }
});

/**
 * Get raw settings from database for payload preview
 */
export const getRawSettings = command('unchecked', async () => {
  const { locals } = getRequestEvent();

  // Check permission to read settings
  if (!(await locals.security.hasPermission('read', 'settings'))) {
    return { success: false, error: 'Access denied: You do not have permission to read settings' };
  }

  try {
    const rawSettings = await SystemSettingsService.getAllSettings();

    return { success: true, settings: rawSettings };
  } catch (error) {
    console.error('Failed to get raw settings:', error);
    return { success: false, error: 'Failed to get raw settings' };
  }
});
