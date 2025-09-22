import { SystemSettingsService } from '../services/system-settings.server';
import type { CMSSettings } from './types';

// Core CMS defaults - users can override these in templates/settings.ts
const defaultCMSSettings: CMSSettings = {
  storage: {
    cache: {
      provider: 'local',
      local: {
        enabled: true,
        directory: 'static/cache',
        maxSize: '1GB'
      },
      s3: {
        bucket: '',
        prefix: 'processed-images/',
        region: ''
      }
    },
    images: {
      formats: ['webp', 'jpg', 'png'],
      maxFileSize: '10.0MB',
      maxWidth: 2560,
      maxHeight: 2560,
      defaultQuality: 85,
      allowedTypes: [
        'image/*',
        'application/pdf',
        '.doc',
        '.docx',
        '.txt',
        '.csv',
        '.xlsx',
        '.pptx'
      ]
    },
    upload: {
      maxFileSize: '10.0MB',
      allowedTypes: ['*/*'],
      folderStructure: 'flat'
    }
  },
  seo: {
    enabled: true,
    titleTemplate: '{title} | {siteName}',
    titleSeparator: '|',
    defaultDescription: '',
    language: 'en'
  },
  system: {
    debugMode: false
  }
};

/**
 * Load settings from database and merge with defaults
 */
export async function getDatabaseSettings(): Promise<CMSSettings> {
  // Start with defaults
  const settings = defaultCMSSettings;

  try {
    // Load storage settings
    const storageProvider = await SystemSettingsService.getSetting('storage.provider');
    if (storageProvider) {
      settings.storage.provider = storageProvider as 'local' | 's3';
    }

    // Load S3 settings
    const s3Bucket = await SystemSettingsService.getSetting('storage.s3.bucket');
    const s3Region = await SystemSettingsService.getSetting('storage.s3.region');
    const s3AccessKeyId = await SystemSettingsService.getSetting('storage.s3.accessKeyId');
    const s3SecretAccessKey = await SystemSettingsService.getSetting('storage.s3.secretAccessKey');
    const s3Endpoint = await SystemSettingsService.getSetting('storage.s3.endpoint');
    const s3PublicUrl = await SystemSettingsService.getSetting('storage.s3.publicUrl');

    // Load local storage settings
    const uploadDir = await SystemSettingsService.getSetting('storage.local.uploadDir');

    // Build providers object
    const providers: any = {
      local: {
        uploadDir: uploadDir || 'static/uploads',
        publicUrl: `/${(uploadDir || 'static/uploads').replace('static/', '')}`
      }
    };

    if (s3Bucket || s3Region || s3AccessKeyId || s3SecretAccessKey || s3Endpoint || s3PublicUrl) {
      providers.s3 = {
        bucket: s3Bucket || '',
        region: s3Region || '',
        accessKeyId: s3AccessKeyId || '',
        secretAccessKey: s3SecretAccessKey || '',
        endpoint: s3Endpoint || 'https://s3.amazonaws.com',
        publicUrl: s3PublicUrl || ''
      };
    }

    settings.storage.providers = providers;

    // Load SEO settings
    const seoEnabled = await SystemSettingsService.getSettingJSON<boolean>('seo.enabled');
    if (seoEnabled !== null) {
      settings.seo.enabled = seoEnabled;
    }

    // SEO settings are now loaded directly in the main settings function
    // Technical/social settings can be added via environment variables if needed

    // Load system settings
    const debugMode = await SystemSettingsService.getSettingJSON<boolean>('system.debugMode');
    if (debugMode !== null) {
      settings.system.debugMode = debugMode;
    }

    // Load auth settings
    const useSecureCookies =
      await SystemSettingsService.getSettingJSON<boolean>('auth.useSecureCookies');
    if (useSecureCookies !== null) {
      settings.auth = {
        useSecureCookies
      };
    }
  } catch (error) {
    console.warn('Failed to load database settings, using defaults:', error);
  }

  return settings;
}

/**
 * Initialize database settings from environment variables
 * This should be called once during setup
 */
export async function initializeDatabaseSettings(): Promise<void> {
  try {
    await SystemSettingsService.initializeFromEnv();
    console.log('Database settings initialized from environment variables');
  } catch (error) {
    console.error('Failed to initialize database settings:', error);
    throw error;
  }
}
