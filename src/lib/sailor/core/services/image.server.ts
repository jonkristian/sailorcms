import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, basename, extname } from 'path';
import { getSettings } from '$sailor/core/settings';
import { StorageProviderFactory, type StorageProvider } from './storage-provider.server';
import sharp from 'sharp';

interface CacheEntry {
  data: Buffer;
  timestamp: number;
  ttl: number;
}

interface ImageTransformOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'webp' | 'jpg' | 'png';
  resize?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
}

interface ProcessedImage {
  buffer: Buffer;
  mimeType: string;
  size: number;
}

export class ImageProcessor {
  private static memoryCache = new Map<string, CacheEntry>();
  private static defaultTTL = 24 * 60 * 60 * 1000; // 24 hours

  // Get cache configuration (provider and path)
  private static async getCacheConfig(): Promise<{ provider: StorageProvider, path: string, enabled: boolean }> {
    const settings = await getSettings();

    // 1. Check if caching is enabled
    const enabled = settings.cache?.enabled !== false;

    // 2. Determine cache provider (env > settings > auto-detect)
    const envProvider = process.env.CACHE_PROVIDER;
    const settingsProvider = settings.cache?.provider;
    const autoProvider = settings.storage.provider === 's3' ? 's3' : 'local';
    const providerType = envProvider || settingsProvider || autoProvider;

    // 3. Get the appropriate provider instance
    let provider: StorageProvider;
    if (providerType === 'local') {
      const { LocalStorageProvider } = await import('./storage-provider.server');
      provider = new LocalStorageProvider();
    } else {
      // For S3 or auto-detect to S3
      provider = await StorageProviderFactory.getProvider();
    }

    // 4. Determine cache path (env > settings > default)
    const envPath = process.env.CACHE_PATH;
    const settingsPath = settings.cache?.path;
    const defaultPath = `${settings.storage.providers?.local?.uploadDir || 'static/uploads'}/cache`;
    const path = envPath || settingsPath || defaultPath;

    return { provider, path, enabled };
  }

  // Get cache directory for local storage
  private static async getCacheDir(): Promise<string> {
    const { path } = await this.getCacheConfig();
    return path;
  }


  // Generate cache key using predictable naming scheme
  private static generateCacheKey(imagePath: string, options: ImageTransformOptions): string {
    const { width, height, quality = 80, format = 'webp', resize = 'cover' } = options;

    // Get the base filename without extension
    const baseName = basename(imagePath, extname(imagePath));

    // Create a simple cache key: filename_resolution_qquality
    const sizeStr = width && height ? `${width}x${height}` : 'auto';
    const cacheKey = `${baseName}_${sizeStr}_q${quality}`;

    return cacheKey;
  }

  // Generate cache path for storage provider
  private static generateCachePath(cacheKey: string, format: string = 'webp'): string {
    return `cache/${cacheKey}.${format}`;
  }

  // Get filesystem cache path (for local storage)
  private static async getLocalCachePath(
    cacheKey: string,
    format: string = 'webp'
  ): Promise<string> {
    const cacheDir = await this.getCacheDir();
    return join(cacheDir, `${cacheKey}.${format}`);
  }

  // Check if cache entry is still valid
  private static isCacheValid(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp < entry.ttl;
  }

  // Clean up expired memory cache entries
  private static cleanupMemoryCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.memoryCache.entries()) {
      if (!this.isCacheValid(entry)) {
        this.memoryCache.delete(key);
      }
    }
  }

  // Ensure cache directory exists (for local storage)
  private static async ensureCacheDir(): Promise<void> {
    const cacheDir = await this.getCacheDir();
    if (!existsSync(cacheDir)) {
      await mkdir(cacheDir, { recursive: true });
    }
  }

  // Read from cache storage (unified for local/S3)
  private static async readFromCache(cachePath: string): Promise<Buffer | null> {
    const { provider } = await this.getCacheConfig();
    const { LocalStorageProvider } = await import('./storage-provider.server');

    if (provider instanceof LocalStorageProvider) {
      // Local storage: read from filesystem
      const localPath = await this.getLocalCachePath(
        basename(cachePath, extname(cachePath)),
        extname(cachePath).slice(1)
      );
      if (existsSync(localPath)) {
        return await readFile(localPath);
      }
    } else {
      // S3 storage: read from S3 cache
      try {
        return await this.readFromS3Cache(cachePath);
      } catch (error) {
        // Cache miss is normal, don't log as warning
        return null;
      }
    }

    return null;
  }

  // Write to cache storage (unified for local/S3)
  private static async writeToCache(
    cachePath: string,
    buffer: Buffer
  ): Promise<void> {
    const { provider } = await this.getCacheConfig();
    const { LocalStorageProvider } = await import('./storage-provider.server');

    if (provider instanceof LocalStorageProvider) {
      // Local storage: write to filesystem
      await this.ensureCacheDir();
      const localPath = await this.getLocalCachePath(
        basename(cachePath, extname(cachePath)),
        extname(cachePath).slice(1)
      );
      await writeFile(localPath, buffer);
    } else {
      // S3 storage: upload to S3 cache folder
      const cacheFile = new File([new Uint8Array(buffer)], basename(cachePath), {
        type: `image/${extname(cachePath).slice(1)}`
      });

      // Create a custom upload that goes directly to cache path
      await this.uploadToS3Cache(cachePath, buffer, cacheFile.type);
    }
  }

  // Read from S3 cache folder
  private static async readFromS3Cache(cachePath: string): Promise<Buffer | null> {
    try {
      const settings = await getSettings();
      const s3Config = settings.storage?.providers?.s3;

      if (!s3Config) {
        return null;
      }

      const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');

      const s3Client = new S3Client({
        region: s3Config.region,
        credentials: {
          accessKeyId: s3Config.accessKeyId,
          secretAccessKey: s3Config.secretAccessKey
        },
        endpoint: s3Config.endpoint,
        forcePathStyle: s3Config.endpoint !== 'https://s3.amazonaws.com'
      });

      const getCommand = new GetObjectCommand({
        Bucket: s3Config.bucket,
        Key: cachePath
      });

      const response = await s3Client.send(getCommand);

      if (response.Body) {
        // Convert stream to buffer
        const chunks: Uint8Array[] = [];
        const reader = response.Body.transformToWebStream().getReader();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }

        const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
        const buffer = new Uint8Array(totalLength);
        let offset = 0;

        for (const chunk of chunks) {
          buffer.set(chunk, offset);
          offset += chunk.length;
        }

        return Buffer.from(buffer);
      }

      return null;
    } catch (error) {
      // Cache miss is normal, don't log
      return null;
    }
  }

  // Upload directly to S3 cache folder
  private static async uploadToS3Cache(
    cachePath: string,
    buffer: Buffer,
    mimeType: string
  ): Promise<void> {
    try {
      const { S3StorageService } = await import('./storage-s3.server');
      const settings = await getSettings();
      const s3Config = settings.storage?.providers?.s3;

      if (!s3Config) {
        throw new Error('S3 not configured');
      }

      const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');

      const s3Client = new S3Client({
        region: s3Config.region,
        credentials: {
          accessKeyId: s3Config.accessKeyId,
          secretAccessKey: s3Config.secretAccessKey
        },
        endpoint: s3Config.endpoint,
        forcePathStyle: s3Config.endpoint !== 'https://s3.amazonaws.com'
      });

      const uploadCommand = new PutObjectCommand({
        Bucket: s3Config.bucket,
        Key: cachePath, // e.g., cache/filename_640x480_q80.webp
        Body: buffer,
        ContentType: mimeType,
        ACL: 'public-read'
      });

      await s3Client.send(uploadCommand);
    } catch (error) {
      console.warn('Failed to upload to S3 cache:', error);
      throw error;
    }
  }

  // Process image with Sharp
  private static async processImage(
    originalPath: string,
    options: ImageTransformOptions
  ): Promise<ProcessedImage> {
    const { width, height, quality = 80, format = 'webp', resize = 'cover' } = options;

    // Handle remote URLs vs local files
    let sharpInstance: sharp.Sharp;

    if (originalPath.startsWith('http')) {
      // For remote URLs, fetch the image first
      const response = await fetch(originalPath);
      if (!response.ok) {
        throw new Error(`Failed to fetch remote image: ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      sharpInstance = sharp(buffer);
    } else {
      // For local files
      sharpInstance = sharp(originalPath);
    }

    // Apply resize based on resize mode
    if (width || height) {
      const resizeOptions: sharp.ResizeOptions = {
        width,
        height,
        fit: resize as 'cover' | 'contain' | 'fill' | 'inside' | 'outside'
      };

      sharpInstance = sharpInstance.resize(resizeOptions);
    }

    // Apply format conversion and quality
    switch (format) {
      case 'webp':
        sharpInstance = sharpInstance.webp({ quality });
        break;
      case 'jpg':
        sharpInstance = sharpInstance.jpeg({ quality });
        break;
      case 'png':
        sharpInstance = sharpInstance.png({ quality });
        break;
    }

    // Process the image
    const buffer = await sharpInstance.toBuffer();

    return {
      buffer,
      mimeType: `image/${format}`,
      size: buffer.length
    };
  }

  // Main method to get processed image
  static async getProcessedImage(
    imagePath: string,
    options: ImageTransformOptions
  ): Promise<ProcessedImage> {
    const cacheKey = this.generateCacheKey(imagePath, options);
    const format = options.format || 'webp'; // Always prefer WebP
    const cachePath = this.generateCachePath(cacheKey, format);

    // Check if caching is enabled
    const { enabled: cacheEnabled } = await this.getCacheConfig();

    // Clean up expired cache entries
    this.cleanupMemoryCache();

    // 1. Check memory cache first (fastest)
    const memoryEntry = this.memoryCache.get(cacheKey);
    if (memoryEntry && this.isCacheValid(memoryEntry)) {
      return {
        buffer: memoryEntry.data,
        mimeType: `image/${format}`,
        size: memoryEntry.data.length
      };
    }

    // 2. Check storage cache (storage provider-aware) - only if caching is enabled
    if (cacheEnabled) {
      try {
        // Try to read from cache storage (local file or S3)
        const cachedData = await this.readFromCache(cachePath);
        if (cachedData) {
          // Populate memory cache
          this.memoryCache.set(cacheKey, {
            data: cachedData,
            timestamp: Date.now(),
            ttl: this.defaultTTL
          });

          return {
            buffer: cachedData,
            mimeType: `image/${format}`,
            size: cachedData.length
          };
        }
      } catch (error) {
        console.warn('Failed to read storage cache:', error);
      }
    }

    // 3. Generate and cache (slow)
    try {
      const processed = await this.processImage(imagePath, options);

      // Cache to storage - only if caching is enabled
      if (cacheEnabled) {
        try {
          await this.writeToCache(cachePath, processed.buffer);
        } catch (error) {
          console.warn('Failed to write storage cache:', cachePath, error);
        }
      }

      // Cache to memory
      this.memoryCache.set(cacheKey, {
        data: processed.buffer,
        timestamp: Date.now(),
        ttl: this.defaultTTL
      });

      return processed;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Log simple message for common missing file errors
      if (errorMessage.includes('Input file is missing') || errorMessage.includes('ENOENT')) {
        console.error(`Image file not found: ${errorMessage.split(':').pop()?.trim()}`);
      } else {
        console.error('Image processing failed:', errorMessage);
      }

      throw new Error(`Image processing failed: ${errorMessage}`);
    }
  }

  // Get image URL with transformation parameters using SvelteKit's URLSearchParams
  static async getImageUrl(
    imagePath: string,
    options: ImageTransformOptions = {}
  ): Promise<string> {
    const params = new URLSearchParams();

    if (options.width) params.append('width', options.width.toString());
    if (options.height) params.append('height', options.height.toString());
    if (options.quality) params.append('quality', options.quality.toString());
    if (options.format) params.append('format', options.format);
    if (options.resize) params.append('resize', options.resize);

    return `/api/images/transform?path=${encodeURIComponent(imagePath)}&${params.toString()}`;
  }

  // Clear all caches
  static clearCache(): void {
    this.memoryCache.clear();
  }

  // Get cache statistics
  static getCacheStats(): { memoryEntries: number; memorySize: number } {
    let totalSize = 0;
    for (const entry of this.memoryCache.values()) {
      totalSize += entry.data.length;
    }

    return {
      memoryEntries: this.memoryCache.size,
      memorySize: totalSize
    };
  }
}
