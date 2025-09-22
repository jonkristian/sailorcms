import { getSettings } from '$sailor/core/settings';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const settings = await getSettings();

  return {
    storageConfig: settings.storage,
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

// No actions needed - using remote functions instead
