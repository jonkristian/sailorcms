import type { CMSSettings, SEOSettings } from './types';

// Import user settings overrides
import { settings as userSettings } from '../../templates/settings';

// Cache for SEO settings
let cachedSEOSettings: SEOSettings | null = null;

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

// Load SEO settings from SystemSettings
async function loadSEOSettings(): Promise<SEOSettings> {
  try {
    // Return cached settings if available
    if (cachedSEOSettings) {
      return cachedSEOSettings;
    }

    // Load from SystemSettings
    const { SystemSettingsService } = await import('../services/system-settings.server');

    const [titleTemplate, titleSeparator, defaultDescription, language] = await Promise.all([
      SystemSettingsService.getSetting('seo.titleTemplate'),
      SystemSettingsService.getSetting('seo.titleSeparator'),
      SystemSettingsService.getSetting('seo.defaultDescription'),
      SystemSettingsService.getSetting('seo.language')
    ]);

    const seoSettings: SEOSettings = {
      enabled: true,
      titleTemplate: titleTemplate || '{title} | {siteName}',
      titleSeparator: titleSeparator || '|',
      defaultDescription: defaultDescription || '',
      language: language || 'en'
    };

    // Cache the result
    cachedSEOSettings = seoSettings;
    return seoSettings;
  } catch (error) {
    console.warn('Failed to load SEO settings, using defaults:', error);
    const fallbackSettings: SEOSettings = {
      enabled: true,
      titleTemplate: '{title} | {siteName}',
      titleSeparator: '|',
      defaultDescription: '',
      language: 'en'
    };

    // Cache fallback
    cachedSEOSettings = fallbackSettings;
    return fallbackSettings;
  }
}

// Settings loader with database settings
export async function getSettings(): Promise<CMSSettings> {
  // 1. Start with core CMS defaults
  let settings = defaultCMSSettings;

  // 2. Apply user overrides from templates/settings.ts
  settings = deepMerge(settings, userSettings);

  // 3. Load and merge database settings (includes storage, SEO, system)
  try {
    const { getDatabaseSettings } = await import('./database-settings');
    const databaseSettings = await getDatabaseSettings();

    // Merge database settings (they take precedence)
    settings = deepMerge(settings, databaseSettings);
  } catch (error) {
    console.warn('Failed to load database settings, using defaults:', error);
  }

  // 4. Load and merge SEO settings from SystemSettings
  try {
    const seoSettings = await loadSEOSettings();
    settings.seo = seoSettings;
  } catch (error) {
    console.warn('Failed to load SEO settings, using defaults:', error);
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

// Utility to clear SEO settings cache (useful after updates)
export function clearSEOSettingsCache(): void {
  cachedSEOSettings = null;
}
