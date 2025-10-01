import { fail, error } from '@sveltejs/kit';
import { SystemSettingsService } from '$sailor/core/services/settings.server';
import { log } from '$sailor/core/utils/logger';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ parent, locals }) => {
  // Check permission to view settings
  if (!(await locals.security.hasPermission('read', 'settings'))) {
    throw error(403, 'Access denied: You do not have permission to view settings');
  }

  // Get shared settings data from layout
  const { settingsData } = await parent();

  // Use services directly in load function since remote functions can't be called during SSR
  const siteName = await SystemSettingsService.getSetting('site.name');
  const siteUrl = await SystemSettingsService.getSetting('site.url');
  const siteDescription = await SystemSettingsService.getSetting('site.description');
  const allowRegistration = await SystemSettingsService.isRegistrationEnabled();

  // Create header actions for payload preview
  const headerActions = [];
  headerActions.push({
    type: 'payload-preview',
    props: {
      type: 'settings',
      id: 'settings',
      title: 'Settings Payload',
      expandedCategory: 'site',
      initialPayload: settingsData
    }
  });

  return {
    settings: {
      siteName: siteName || 'My Website',
      siteUrl: siteUrl || '',
      siteDescription: siteDescription || '',
      allowRegistration: allowRegistration
    },
    headerActions,
    permissions: {
      canUpdate: await locals.security.hasPermission('update', 'settings')
    }
  };
};

export const actions: Actions = {
  save: async ({ request, locals }) => {
    // Check if user has permission to update settings
    if (!(await locals.security.hasPermission('update', 'settings'))) {
      return fail(403, { error: 'You do not have permission to update settings' });
    }
    const formData = await request.formData();
    const siteName = formData.get('siteName') as string;
    const siteUrl = formData.get('siteUrl') as string;
    const siteDescription = formData.get('siteDescription') as string;
    const allowRegistration = formData.get('allowRegistration') === 'on';

    // Basic validation
    if (!siteName || siteName.trim().length === 0) {
      return fail(400, { error: 'Site name is required' });
    }

    try {
      // Use SystemSettingsService directly (can't use remote functions in server actions)
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

      return { success: true, message: 'Site settings updated successfully' };
    } catch (error) {
      log.error('Settings update exception', {}, error as Error);
      return fail(500, { error: 'Failed to save site settings' });
    }
  },

  purge: async ({ locals }) => {
    // Check if user has permission to update settings
    if (!(await locals.security.hasPermission('update', 'settings'))) {
      return fail(403, { error: 'You do not have permission to purge settings' });
    }
    try {
      const result = await SystemSettingsService.refreshSettings();
      log.info(`Settings purged: ${result.removed} old settings removed, reloaded fresh settings`);
      return {
        success: true,
        message: `Purged ${result.removed} old settings and reloaded fresh templates`
      };
    } catch (error) {
      log.error('Failed to purge settings:', {}, error as Error);
      return fail(500, { error: 'Failed to purge settings' });
    }
  }
};
