import { env } from '$env/dynamic/private';
import type { CMSSettings } from './types';
import { getDatabaseSettings } from './database-settings';

/**
 * Server-only settings that require environment variables
 * This module should only be imported in server-side code
 */
export async function getServerSettings(): Promise<Partial<CMSSettings>> {
  try {
    // Try to get settings from database first
    const settings = await getDatabaseSettings();
    return settings;
  } catch (error) {
    // Fallback to environment variables if database settings not available
    console.warn('Failed to load database settings, falling back to environment variables:', error);

    // Auto-detect storage provider based on S3_BUCKET presence
    const storageProvider = env.S3_BUCKET ? 's3' : 'local';

    // Build storage providers dynamically
    const providers: any = {
      local: {
        uploadDir: env.UPLOAD_DIR || 'static/uploads',
        publicUrl: `/${env.UPLOAD_DIR?.replace('static/', '') || 'uploads'}`
      }
    };

    // Always include S3 config if S3_BUCKET is available (regardless of provider setting)
    if (env.S3_BUCKET) {
      providers.s3 = {
        bucket: env.S3_BUCKET || '',
        region: env.S3_REGION || '',
        accessKeyId: env.S3_ACCESS_KEY_ID || '',
        secretAccessKey: env.S3_SECRET_ACCESS_KEY || '',
        endpoint: env.S3_ENDPOINT || 'https://s3.amazonaws.com',
        publicUrl: env.S3_PUBLIC_URL || ''
      };
    }

    return {
      storage: {
        provider: storageProvider,
        providers,
        images: {
          sizes: {
            thumbnail: { width: 150, height: 150, quality: 80 },
            small: { width: 300, height: 300, quality: 85 },
            medium: { width: 600, height: 600, quality: 90 },
            large: { width: 1200, height: 1200, quality: 95 }
          },
          formats: ['webp', 'jpg', 'png'],
          maxFileSize: '10.0MB',
          maxWidth: 2048,
          maxHeight: 2048,
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
          folderStructure: 'flat' as const
        },
        cache: {
          provider: 'local' as const,
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
        }
      },
      seo: {
        // Core system settings (still from environment)
        enabled: env.SEO_ENABLED !== 'false',
        titleTemplate: '{title} | {siteName}',
        titleSeparator: '|',
        defaultDescription: '',
        language: 'en'
      },
      system: {
        debugMode: env.DEBUG_MODE === 'true'
      }
    };
  }
}
