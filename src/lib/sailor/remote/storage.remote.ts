import { command, getRequestEvent } from '$app/server';
import { error } from '@sveltejs/kit';
import { StorageProviderFactory } from 'sailorcms/core/services/storage-provider.server';
import { ImageProcessor } from 'sailorcms/core/services/image.server';
import { getSettings } from 'sailorcms/core/settings/index';

/**
 * Test storage connection and get configuration
 */
export const testStorageConnection = command('unchecked', async () => {
  try {
    const settings = await getSettings();
    const connectionTest = await StorageProviderFactory.testConnection();

    return {
      success: connectionTest.success,
      provider: connectionTest.provider,
      error: connectionTest.error,
      config: {
        provider: settings.storage.provider || 'local',
        local: settings.storage.providers?.local
          ? {
              uploadDir: settings.storage.providers.local.uploadDir,
              publicUrl: settings.storage.providers.local.publicUrl
            }
          : null,
        s3: settings.storage.providers?.s3
          ? {
              bucket: settings.storage.providers.s3.bucket,
              region: settings.storage.providers.s3.region,
              endpoint: settings.storage.providers.s3.endpoint,
              publicUrl: settings.storage.providers.s3.publicUrl
            }
          : null
      }
    };
  } catch (error) {
    console.error('Failed to test storage connection:', error);
    return {
      success: false,
      error: 'Failed to test storage connection'
    };
  }
});

/**
 * Purge every cached image variant from the configured storage provider and reset
 * the in-process state. Variants regenerate lazily on the next request for each.
 */
export const purgeImageCache = command('unchecked', async () => {
  const { locals } = getRequestEvent();
  if (!locals.user) throw error(401, 'Unauthorized');
  if (!(await locals.security.hasPermission('update', 'settings'))) {
    throw error(403, 'Forbidden');
  }

  try {
    const { removed } = await ImageProcessor.purgeStorageCache();
    return { success: true as const, removed };
  } catch (e) {
    console.error('Image cache purge failed:', e);
    return {
      success: false as const,
      error: e instanceof Error ? e.message : 'Failed to purge image cache'
    };
  }
});
