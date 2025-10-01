import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { generateFileName } from '$sailor/core/files/file.server';
import { getSettings } from '$sailor/core/settings';
import type { S3StorageConfig } from '$sailor/core/settings/types';
import { log } from '$sailor/core/utils/logger';

export class S3StorageService {
  // Local helper to avoid cross-package private property type mismatch while keeping strong external types
  private static async presignGetObject(
    client: S3Client,
    command: GetObjectCommand,
    expiresIn: number
  ): Promise<string> {
    return getSignedUrl(client as unknown as any, command, { expiresIn });
  }

  private static async getS3Client(): Promise<S3Client> {
    const settings = await getSettings();
    const s3Config = settings.storage?.providers?.s3;

    if (!s3Config) {
      throw new Error('S3 storage provider not configured');
    }

    // Read credentials from environment variables for security
    // (they are intentionally not stored in database)
    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

    if (!accessKeyId || !secretAccessKey) {
      throw new Error(
        'S3 credentials not found in environment variables (S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY)'
      );
    }

    return new S3Client({
      region: s3Config.region,
      credentials: {
        accessKeyId,
        secretAccessKey
      },
      endpoint: s3Config.endpoint,
      forcePathStyle: s3Config.endpoint !== 'https://s3.amazonaws.com' // For custom endpoints like MinIO
    });
  }

  private static async getS3Config(): Promise<S3StorageConfig> {
    const settings = await getSettings();
    const s3Config = settings.storage?.providers?.s3;

    if (!s3Config) {
      throw new Error('S3 storage provider not configured');
    }

    return s3Config;
  }

  static async uploadFile(file: File): Promise<{ filename: string; path: string; url: string }> {
    const s3Client = await this.getS3Client();
    const s3Config = await this.getS3Config();

    const filename = generateFileName(file.name);
    const key = await this.generateS3Key(filename);

    const buffer = Buffer.from(await file.arrayBuffer());

    const uploadCommand = new PutObjectCommand({
      Bucket: s3Config.bucket,
      Key: key,
      Body: buffer,
      ContentType: file.type,
      ACL: 'public-read', // Make the file publicly accessible
      Metadata: {
        originalName: file.name,
        uploadedAt: new Date().toISOString()
      }
    });

    try {
      await s3Client.send(uploadCommand);
      const publicUrl = await this.generatePublicUrl(key);

      log.debug('File uploaded to S3', {
        filename,
        key,
        bucket: s3Config.bucket,
        size: buffer.length
      });

      return {
        filename,
        path: key, // Store the S3 key as path for cloud storage
        url: publicUrl // Store the full URL for direct access
      };
    } catch (error) {
      log.error(
        'S3 upload failed',
        {
          filename,
          key,
          bucket: s3Config.bucket,
          size: buffer.length
        },
        error as Error
      );
      throw new Error(
        `Failed to upload file to S3: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  static async deleteFile(path: string): Promise<boolean> {
    const s3Client = await this.getS3Client();
    const s3Config = await this.getS3Config();

    const deleteCommand = new DeleteObjectCommand({
      Bucket: s3Config.bucket,
      Key: path
    });

    try {
      await s3Client.send(deleteCommand);
      log.debug('File deleted from S3', { path, bucket: s3Config.bucket });
      return true;
    } catch (error) {
      log.error('S3 delete failed', { path, bucket: s3Config.bucket }, error as Error);
      return false;
    }
  }

  static async getSignedUrl(path: string, expiresIn: number = 3600): Promise<string> {
    const s3Client = await this.getS3Client();
    const s3Config = await this.getS3Config();

    const getObjectCommand = new GetObjectCommand({
      Bucket: s3Config.bucket,
      Key: path
    });

    try {
      const signedUrl = await this.presignGetObject(s3Client, getObjectCommand, {
        expiresIn
      } as any);
      log.debug('Generated S3 signed URL', { path, expiresIn, bucket: s3Config.bucket });
      return signedUrl;
    } catch (error) {
      log.error(
        'S3 signed URL generation failed',
        { path, expiresIn, bucket: s3Config.bucket },
        error as Error
      );
      throw new Error(
        `Failed to generate signed URL: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  static async generatePublicUrl(path: string): Promise<string> {
    const s3Config = await this.getS3Config();

    if (s3Config.publicUrl) {
      // Use public URL if configured
      // For R2, the path should be just the filename
      const url = `${s3Config.publicUrl}/${path}`;
      return url;
    } else {
      // Fallback to signed URL for development
      return this.getSignedUrl(path, 3600); // 1 hour expiry
    }
  }

  private static async generateS3Key(filename: string): Promise<string> {
    const settings = await getSettings();
    const folderStructure = settings.storage.upload.folderStructure;

    let key = filename;

    switch (folderStructure) {
      case 'date': {
        const date = new Date();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        key = `${year}/${month}/${day}/${filename}`;
        break;
      }

      case 'type': {
        const extension = filename.split('.').pop()?.toLowerCase();
        if (extension) {
          key = `${extension}/${filename}`;
        }
        break;
      }

      case 'flat':
      default:
        // Keep filename as is
        break;
    }

    return key;
  }

  static async listFiles(): Promise<{ path: string; size?: number }[]> {
    const s3Client = await this.getS3Client();
    const s3Config = await this.getS3Config();
    const settings = await getSettings();

    try {
      const listCommand = new ListObjectsV2Command({
        Bucket: s3Config.bucket,
        MaxKeys: 1000 // Limit for initial implementation
      });

      const response = await s3Client.send(listCommand);

      // Get exclude paths from settings, with fallback to defaults
      const excludePaths = settings.storage?.excludePaths || [
        'cache/',
        'backup/',
        '.tmp/',
        '.git/'
      ];

      return (response.Contents || [])
        .filter((obj) => {
          const key = obj.Key || '';
          // Skip any configured exclude paths and hidden files/folders
          return !excludePaths.some((exclude) => key.startsWith(exclude)) && !key.startsWith('.');
        })
        .map((obj) => ({
          path: obj.Key || '',
          size: obj.Size
        }));
    } catch (error) {
      log.error('S3 list files failed', { bucket: s3Config.bucket }, error as Error);
      return [];
    }
  }

  static async testConnection(): Promise<boolean> {
    try {
      const s3Client = await this.getS3Client();
      const s3Config = await this.getS3Config();

      // Try HeadBucket first (most reliable for R2 and S3)
      const headCommand = new HeadBucketCommand({
        Bucket: s3Config.bucket
      });

      await s3Client.send(headCommand);
      log.info('S3 connection test successful', { bucket: s3Config.bucket });
      return true;
    } catch (error) {
      const s3Config = await this.getS3Config();
      log.error('S3 connection test failed', { bucket: s3Config.bucket }, error as Error);
      return false;
    }
  }
}
