import { getSettings } from 'sailorcms/core/settings/index';
import {
  StorageProviderFactory,
  type StorageFolderSummary
} from 'sailorcms/core/services/storage-provider.server';
import { ImageProcessor } from 'sailorcms/core/services/image.server';
import { m } from '$sailor/i18n';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
  // Get shared settings data from layout
  const { settingsData } = await parent();

  // Get complete settings (defaults + template overrides + database overrides)
  const settings = await getSettings();

  // Top-level folder inventory. Tolerant of misconfigured providers so the settings
  // page still renders if the bucket creds are stale.
  let folders: StorageFolderSummary[] = [];
  try {
    const provider = await StorageProviderFactory.getProvider();
    folders = await provider.listTopLevelFolders();
  } catch (err) {
    console.warn('Storage folder listing failed:', err);
  }

  // Image pipeline state. Tolerant for the same reason the folder listing is:
  // stale bucket creds should not blank the page that exists to fix them.
  let imageCacheStats: Awaited<ReturnType<typeof ImageProcessor.getCacheStats>> | null = null;
  try {
    imageCacheStats = await ImageProcessor.getCacheStats();
  } catch (err) {
    console.warn('Image cache stats failed:', err);
  }

  // Create header actions for payload preview
  const headerActions = [];
  headerActions.push({
    type: 'payload-preview',
    props: {
      type: 'settings',
      id: 'settings',
      title: m.payload_title_storage(),
      expandedCategory: 'storage',
      initialPayload: settingsData
    }
  });

  return {
    storageConfig: settings.storage,
    folders,
    imageCacheStats,
    headerActions,
    // Mask sensitive information for display
    displayConfig: {
      provider: settings.storage.provider,
      upload: settings.storage.upload,
      local: settings.storage.providers?.local || { uploadDir: '', publicUrl: '' },
      s3: settings.storage.providers?.s3
        ? {
            ...settings.storage.providers.s3,
            accessKeyId: settings.storage.providers.s3.accessKeyId
              ? '***' + settings.storage.providers.s3.accessKeyId.slice(-4)
              : '',
            secretAccessKey: settings.storage.providers.s3.secretAccessKey ? '***' : ''
          }
        : null
    }
  };
};
