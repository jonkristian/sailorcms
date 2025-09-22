import { command } from '$app/server';
import { StorageProviderFactory } from '$sailor/core/services/storage-provider.server';
import { getSettings } from '$sailor/core/settings';

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
