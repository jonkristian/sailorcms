import { getSettings } from '$sailor/core/settings';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
  // Get shared settings data from layout
  const { settingsData } = await parent();

  // Get complete settings (defaults + template overrides + database overrides)
  const settings = await getSettings();

  // Create header actions for payload preview
  const headerActions = [];
  headerActions.push({
    type: 'payload-preview',
    props: {
      type: 'settings',
      id: 'settings',
      title: 'Storage Settings Payload',
      expandedCategory: 'storage',
      initialPayload: settingsData
    }
  });

  return {
    storageConfig: settings.storage,
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
