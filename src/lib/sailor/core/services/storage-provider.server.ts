import { saveFile } from '$sailor/core/files/file.server';
import { S3StorageService } from './s3-storage.server';
import { getSettings } from '$sailor/core/settings';
import type { FileType } from '$sailor/core/files/file.server';

export interface StorageProvider {
  uploadFile(file: File): Promise<{ filename: string; path: string; url: string }>;
  deleteFile(path: string): Promise<boolean>;
  getPublicUrl(path: string): Promise<string>;
  listFiles(): Promise<{ path: string; size?: number }[]>;
}

export class LocalStorageProvider implements StorageProvider {
  async uploadFile(file: File): Promise<{ filename: string; path: string; url: string }> {
    return await saveFile(file);
  }

  async deleteFile(path: string): Promise<boolean> {
    try {
      const { unlink } = await import('fs/promises');
      await unlink(path);
      return true;
    } catch (error) {
      console.warn('Could not delete local file:', error);
      return false;
    }
  }

  async getPublicUrl(path: string): Promise<string> {
    const settings = await getSettings();
    const publicUrl = settings.storage?.providers?.local?.publicUrl || '/uploads';

    // For local storage, path should be just the filename
    return `${publicUrl}/${path}`;
  }

  async listFiles(): Promise<{ path: string; size?: number }[]> {
    const settings = await getSettings();
    const uploadDir = settings.storage?.providers?.local?.uploadDir || 'static/uploads';

    try {
      const { readdir, stat } = await import('fs/promises');
      const { join } = await import('path');

      const files = await readdir(uploadDir);
      const result = [];

      for (const file of files) {
        // Skip cache, backup folders and any hidden files/folders
        if (file === 'cache' || file === 'backup' || file === 'backups' || file.startsWith('.')) {
          continue;
        }

        const filePath = join(uploadDir, file);
        const stats = await stat(filePath);

        if (stats.isFile()) {
          result.push({ path: file, size: stats.size });
        }
      }

      return result;
    } catch (error) {
      console.warn('Could not list local files:', error);
      return [];
    }
  }
}

export class S3StorageProvider implements StorageProvider {
  async uploadFile(file: File): Promise<{ filename: string; path: string; url: string }> {
    return await S3StorageService.uploadFile(file);
  }

  async deleteFile(path: string): Promise<boolean> {
    return await S3StorageService.deleteFile(path);
  }

  async getPublicUrl(path: string): Promise<string> {
    return await S3StorageService.generatePublicUrl(path);
  }

  async listFiles(): Promise<{ path: string; size?: number }[]> {
    return await S3StorageService.listFiles();
  }
}

export class StorageProviderFactory {
  static async getProvider(): Promise<StorageProvider> {
    const settings = await getSettings();
    const provider = settings.storage?.provider || 'local';

    switch (provider) {
      case 's3':
        return new S3StorageProvider();
      case 'local':
      default:
        return new LocalStorageProvider();
    }
  }

  static async testConnection(): Promise<{ success: boolean; provider: string; error?: string }> {
    const settings = await getSettings();
    const provider = settings.storage?.provider || 'local';

    try {
      switch (provider) {
        case 's3': {
          const success = await S3StorageService.testConnection();
          return {
            success,
            provider: 's3',
            error: success ? undefined : 'Failed to connect to S3'
          };
        }
        case 'local': {
          // For local storage, we just check if the upload directory exists
          const { existsSync } = await import('fs');
          const uploadDir = settings.storage?.providers?.local?.uploadDir;
          if (!uploadDir) {
            return {
              success: false,
              provider: 'local',
              error: 'Local upload directory not configured'
            };
          }
          const exists = existsSync(uploadDir);
          return {
            success: exists,
            provider: 'local',
            error: exists ? undefined : `Upload directory does not exist: ${uploadDir}`
          };
        }
        default:
          return {
            success: false,
            provider,
            error: `Unknown storage provider: ${provider}`
          };
      }
    } catch (error) {
      return {
        success: false,
        provider,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}
