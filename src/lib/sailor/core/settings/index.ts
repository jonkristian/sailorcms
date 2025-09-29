import type { CMSSettings } from './types';

// User settings will be loaded dynamically

// Core CMS defaults - users can override these in templates/settings.ts
const defaultCMSSettings: CMSSettings = {
  storage: {
    providers: {
      local: {
        uploadDir: 'static/uploads',
        publicUrl: '/uploads'
      }
    },
    images: {
      maxFileSize: '10.0MB',
      maxWidth: 2560,
      maxHeight: 2560
    },
    upload: {
      maxFileSize: '10.0MB',
      allowedTypes: ['*/*'],
      folderStructure: 'flat'
    }
  },
  cache: {
    enabled: true,
    maxSize: '1GB'
  },
  system: {}
};

// Deep merge helper for nested objects
function deepMerge<T>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(
        result[key] || ({} as T[Extract<keyof T, string>]),
        source[key] as any
      );
    } else if (source[key] !== undefined) {
      result[key] = source[key] as T[Extract<keyof T, string>];
    }
  }

  return result;
}

// Settings loader - core defaults + template overrides + database overrides
export async function getSettings(): Promise<CMSSettings> {
  // 1. Start with core CMS defaults
  let settings = defaultCMSSettings;

  // 2. Apply user overrides from templates/settings.ts
  try {
    const generatedSettings = await import('../../generated/settings');
    const userSettings = (generatedSettings.settings || {}) as unknown as Partial<CMSSettings>;
    settings = deepMerge<CMSSettings>(settings, userSettings);
  } catch (error) {
    if (error instanceof Error) {
      console.warn('No user settings found, using defaults:', error.message);
    } else {
      console.warn('No user settings found, using defaults');
    }
  }

  // 3. Apply database overrides (environment variables, etc.)
  try {
    const { SystemSettingsService } = await import('../services/settings.server');
    const dbSettings = await SystemSettingsService.getAllSettings();
    const dbSettingsObj: any = {};

    // Convert flat database settings to nested object
    for (const setting of dbSettings) {
      const keys = setting.key.split('.');
      let current = dbSettingsObj;

      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) {
          current[keys[i]] = {};
        }
        current = current[keys[i]];
      }

      // Parse JSON value
      try {
        current[keys[keys.length - 1]] = JSON.parse(setting.value);
      } catch {
        current[keys[keys.length - 1]] = setting.value;
      }
    }

    // Deep merge database overrides
    settings = deepMerge<CMSSettings>(settings, dbSettingsObj);
  } catch (error) {
    console.warn('Could not load database settings, using template defaults:', error);
  }

  return settings;
}

// Utility function to parse human-readable file sizes
export function parseFileSize(sizeString: string): number {
  const match = sizeString.match(/^(\d+(?:\.\d+)?)\s*(KB|MB|GB|TB)$/i);
  if (!match) {
    throw new Error(`Invalid file size format: ${sizeString}. Expected format like "10.0MB"`);
  }

  const [, value, unit] = match;
  const numValue = parseFloat(value);

  const multipliers: Record<string, number> = {
    KB: 1024,
    MB: 1024 * 1024,
    GB: 1024 * 1024 * 1024,
    TB: 1024 * 1024 * 1024 * 1024
  };

  return Math.round(numValue * multipliers[unit.toUpperCase()]);
}

// Utility function to format bytes as human-readable string
export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)}${units[unitIndex]}`;
}
