import { readFile, writeFile, mkdir, readdir, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { join, basename, extname } from 'path';
import { createHash } from 'crypto';
import { getSettings } from 'sailorcms/core/settings/index';
import { StorageProviderFactory, type StorageProvider } from './storage-provider.server';
import { S3StorageService } from './storage-s3.server';
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
  position?: string;
}

interface ProcessedImage {
  buffer: Buffer;
  mimeType: string;
  size: number;
}

export class ImageProcessor {
  private static memoryCache = new Map<string, CacheEntry>();
  private static defaultTTL = 24 * 60 * 60 * 1000; // 24 hours

  // Positive existence cache for processed variants. Lets the transform endpoint skip
  // a HEAD-check round-trip on warm requests and 302 straight to the CDN/static URL.
  // 5-minute TTL bounds staleness if the cache is wiped out-of-band.
  private static existsCache = new Map<string, number>();
  private static existsCacheTTL = 5 * 60 * 1000;

  // Get cache configuration (provider and path)
  private static async getCacheConfig(): Promise<{
    provider: StorageProvider;
    path: string;
    enabled: boolean;
  }> {
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

  // Generate cache key. The basename stays in the key for human readability when poking
  // around storage; the path hash makes the key safe against same-filename collisions
  // (different uploads with the same filename, file replacement, flat folder structure).
  private static generateCacheKey(imagePath: string, options: ImageTransformOptions): string {
    const { width, height, quality = 80, position } = options;
    const baseName = basename(imagePath, extname(imagePath));
    const pathHash = createHash('sha1').update(imagePath).digest('hex').slice(0, 10);
    const sizeStr = width && height ? `${width}x${height}` : 'auto';
    const positionStr = position ? `_${position.replace(/\s+/g, '-')}` : '';
    return `${baseName}_${pathHash}_${sizeStr}_q${quality}${positionStr}`;
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
  private static async writeToCache(cachePath: string, buffer: Buffer): Promise<void> {
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

    this.markCacheExists(cachePath);
  }

  // Read from S3 cache folder
  private static async readFromS3Cache(cachePath: string): Promise<Buffer | null> {
    try {
      const settings = await getSettings();
      const s3Config = settings.storage?.providers?.s3;

      if (!s3Config) {
        return null;
      }

      // Read credentials from environment variables for security
      // (they are intentionally not stored in database)
      const accessKeyId = process.env.S3_ACCESS_KEY_ID;
      const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

      if (!accessKeyId || !secretAccessKey) {
        console.warn('S3 credentials not found in environment variables, skipping cache read');
        return null;
      }

      const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');

      const s3Client = new S3Client({
        region: s3Config.region,
        credentials: {
          accessKeyId,
          secretAccessKey
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

  // Mark a cache path as known-to-exist so subsequent requests can skip the HEAD probe.
  private static markCacheExists(cachePath: string): void {
    this.existsCache.set(cachePath, Date.now() + this.existsCacheTTL);
  }

  // HEAD-probe the S3 cache for a given path. Cheap (no body); used by getCacheRedirectUrl.
  private static async headS3Cache(cachePath: string): Promise<boolean> {
    try {
      const settings = await getSettings();
      const s3Config = settings.storage?.providers?.s3;
      if (!s3Config) return false;

      const accessKeyId = process.env.S3_ACCESS_KEY_ID;
      const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
      if (!accessKeyId || !secretAccessKey) return false;

      const { S3Client, HeadObjectCommand } = await import('@aws-sdk/client-s3');
      const s3Client = new S3Client({
        region: s3Config.region,
        credentials: { accessKeyId, secretAccessKey },
        endpoint: s3Config.endpoint,
        forcePathStyle: s3Config.endpoint !== 'https://s3.amazonaws.com'
      });

      await s3Client.send(new HeadObjectCommand({ Bucket: s3Config.bucket, Key: cachePath }));
      return true;
    } catch {
      return false;
    }
  }

  // Resolve the public-facing URL for a cached variant if (and only if) it actually exists.
  // Returns null on cache miss so the caller falls back to synchronous processing.
  //
  // The point is to let the transform endpoint 302-redirect to the CDN / static path on
  // cache hits, so the browser fetches bytes directly from R2 / S3 / the static handler
  // instead of streaming them through Node on every request.
  static async getCacheRedirectUrl(
    imagePath: string,
    options: ImageTransformOptions
  ): Promise<string | null> {
    const { enabled, provider } = await this.getCacheConfig();
    if (!enabled) return null;

    const cacheKey = this.generateCacheKey(imagePath, options);
    const format = options.format || 'webp';
    const cachePath = this.generateCachePath(cacheKey, format);

    const { LocalStorageProvider } = await import('./storage-provider.server');
    const isLocal = provider instanceof LocalStorageProvider;

    const cachedHit = this.existsCache.get(cachePath);
    let exists = cachedHit !== undefined && cachedHit > Date.now();
    if (!exists) {
      if (isLocal) {
        exists = existsSync(await this.getLocalCachePath(cacheKey, format));
      } else {
        exists = await this.headS3Cache(cachePath);
      }
      if (exists) this.markCacheExists(cachePath);
    }
    if (!exists) return null;

    if (isLocal) {
      // SvelteKit serves files under static/ at the site root, so a cache file at
      // static/uploads/cache/<key>.<fmt> is reachable at /uploads/cache/<key>.<fmt>.
      const settings = await getSettings();
      const uploadDir = settings.storage.providers?.local?.uploadDir || 'static/uploads';
      const publicPrefix = uploadDir.startsWith('static/')
        ? '/' + uploadDir.slice('static/'.length)
        : '/' + uploadDir.replace(/^\/+/, '');
      return `${publicPrefix}/cache/${cacheKey}.${format}`;
    }

    return S3StorageService.generatePublicUrl(cachePath);
  }

  // Upload directly to S3 cache folder
  private static async uploadToS3Cache(
    cachePath: string,
    buffer: Buffer,
    mimeType: string
  ): Promise<void> {
    try {
      const settings = await getSettings();
      const s3Config = settings.storage?.providers?.s3;

      if (!s3Config) {
        throw new Error('S3 not configured');
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

      const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');

      const s3Client = new S3Client({
        region: s3Config.region,
        credentials: {
          accessKeyId,
          secretAccessKey
        },
        endpoint: s3Config.endpoint,
        forcePathStyle: s3Config.endpoint !== 'https://s3.amazonaws.com'
      });

      const uploadCommand = new PutObjectCommand({
        Bucket: s3Config.bucket,
        Key: cachePath, // e.g., cache/filename_<hash>_640x480_q80.webp
        Body: buffer,
        ContentType: mimeType,
        // Cache key includes a hash of the source path, so a cache entry is content-stable —
        // the browser can hold onto these forever once the 302 redirect delivers them.
        CacheControl: 'public, max-age=31536000, immutable',
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
    const { width, height, quality = 80, format = 'webp', resize = 'cover', position } = options;

    // Handle remote URLs vs local files
    let sharpInstance: sharp.Sharp;

    if (originalPath.startsWith('http')) {
      const response = await fetch(originalPath);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch remote image (${response.status} ${response.statusText}): ${originalPath}`
        );
      }
      const contentType = response.headers.get('content-type') || '';
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (buffer.length === 0) {
        throw new Error(`Remote URL returned empty body: ${originalPath}`);
      }
      if (contentType && !contentType.startsWith('image/')) {
        throw new Error(
          `Remote URL returned non-image content-type "${contentType}" (${buffer.length} bytes): ${originalPath}`
        );
      }

      sharpInstance = sharp(buffer);
    } else {
      // For local files
      sharpInstance = sharp(originalPath);
    }

    // Honor EXIF orientation so processed output matches how browsers render the original
    sharpInstance = sharpInstance.rotate();

    // Apply resize based on resize mode
    if (width || height) {
      const resizeOptions: sharp.ResizeOptions = {
        width,
        height,
        fit: resize as 'cover' | 'contain' | 'fill' | 'inside' | 'outside'
      };
      // Sharp's `position` only affects `cover` / `contain` fits; ignored otherwise.
      if (position) resizeOptions.position = position as any;

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

  /**
   * Generate cached variants for an image at every width declared in
   * `storage.images.prewarmBreakpoints`. Designed to run fire-and-forget
   * right after upload — first-paint of a fresh image hits the 302 fast
   * path instead of cold Sharp.
   *
   * Errors per-breakpoint are caught + logged; we don't propagate so the
   * upload response is unaffected. Returns counts for callers that want
   * to log a summary.
   *
   * Skips silently if `prewarmBreakpoints` is unset / empty (zero-cost
   * when not configured).
   */
  static async prewarmImageVariants(imagePath: string): Promise<{ ok: number; failed: number }> {
    const settings = await getSettings();
    const breakpoints = settings.storage?.images?.prewarmBreakpoints;
    if (!Array.isArray(breakpoints) || breakpoints.length === 0) {
      return { ok: 0, failed: 0 };
    }

    let ok = 0;
    let failed = 0;
    // Sequential — Sharp is CPU-heavy and parallelism risks pegging cores
    // during a multi-file batch upload (4 images × 4 breakpoints = 16
    // concurrent Sharp instances on a parallel branch). Sequential keeps
    // pressure predictable while still moving every variant into cache.
    for (const width of breakpoints) {
      try {
        await this.getProcessedImage(imagePath, { width });
        ok++;
      } catch (err) {
        failed++;
        console.warn(
          `prewarm variant w=${width} for ${imagePath} failed:`,
          err instanceof Error ? err.message : err
        );
      }
    }
    return { ok, failed };
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
    this.existsCache.clear();
  }

  // Purge every cached variant from storage and wipe the in-process state. Returns the
  // count of objects removed for UI feedback. Cache regenerates lazily on the next request
  // for each variant (or eagerly via pre-warm when that lands).
  static async purgeStorageCache(): Promise<{ removed: number }> {
    const { provider } = await this.getCacheConfig();
    const { LocalStorageProvider } = await import('./storage-provider.server');

    let removed = 0;
    if (provider instanceof LocalStorageProvider) {
      const cacheDir = await this.getCacheDir();
      if (existsSync(cacheDir)) {
        for (const name of await readdir(cacheDir)) {
          try {
            await unlink(join(cacheDir, name));
            removed++;
          } catch {
            // ignore unlink races / nested dirs
          }
        }
      }
    } else {
      removed = await this.purgeS3Cache();
    }

    this.memoryCache.clear();
    this.existsCache.clear();
    return { removed };
  }

  // List + bulk-delete everything under the cache/ prefix on S3 / R2.
  private static async purgeS3Cache(): Promise<number> {
    const settings = await getSettings();
    const s3Config = settings.storage?.providers?.s3;
    if (!s3Config) return 0;

    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
    if (!accessKeyId || !secretAccessKey) return 0;

    const { S3Client, ListObjectsV2Command, DeleteObjectsCommand } =
      await import('@aws-sdk/client-s3');
    const s3 = new S3Client({
      region: s3Config.region,
      credentials: { accessKeyId, secretAccessKey },
      endpoint: s3Config.endpoint,
      forcePathStyle: s3Config.endpoint !== 'https://s3.amazonaws.com'
    });

    let removed = 0;
    let continuationToken: string | undefined;
    do {
      const list = await s3.send(
        new ListObjectsV2Command({
          Bucket: s3Config.bucket,
          Prefix: 'cache/',
          ContinuationToken: continuationToken
        })
      );
      const keys = list.Contents?.filter((o) => o.Key).map((o) => ({ Key: o.Key! })) ?? [];
      if (keys.length) {
        await s3.send(
          new DeleteObjectsCommand({
            Bucket: s3Config.bucket,
            Delete: { Objects: keys, Quiet: true }
          })
        );
        removed += keys.length;
      }
      continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
    } while (continuationToken);

    return removed;
  }

  /**
   * Purge every cached variant generated from a specific source image. Walks
   * the cache and deletes any entry whose key contains the path-hash for
   * that file. Wired into the file-delete path so cache doesn't leak after
   * a file is removed.
   *
   * `file.path` and `file.url` are both hashed (the transform endpoint may
   * have resolved either form depending on storage backend), so we catch
   * variants generated from either resolution. Memory + exists caches are
   * also cleared for matching keys.
   *
   * Returns the count of variants removed for caller logging.
   */
  static async purgeVariantsForFile(file: {
    path?: string | null;
    url?: string | null;
  }): Promise<{ removed: number }> {
    const candidates = new Set<string>();
    if (file.path) candidates.add(file.path);
    if (file.url) candidates.add(file.url);
    if (candidates.size === 0) return { removed: 0 };

    // Each candidate path produces a distinct hash; collect them all so we
    // catch variants regardless of which resolution generated them.
    const hashes = new Set<string>();
    for (const p of candidates) {
      hashes.add(createHash('sha1').update(p).digest('hex').slice(0, 10));
    }

    const nameMatches = (name: string): boolean => {
      for (const h of hashes) {
        // Hash is sandwiched between underscores in the cache key
        // (`{baseName}_{pathHash}_{size}_q{quality}{position}.{format}`).
        if (name.includes(`_${h}_`)) return true;
      }
      return false;
    };

    const { provider } = await this.getCacheConfig();
    const { LocalStorageProvider } = await import('./storage-provider.server');

    let removed = 0;
    if (provider instanceof LocalStorageProvider) {
      const cacheDir = await this.getCacheDir();
      if (existsSync(cacheDir)) {
        for (const name of await readdir(cacheDir)) {
          if (!nameMatches(name)) continue;
          try {
            await unlink(join(cacheDir, name));
            removed++;
          } catch {
            // ignore unlink races
          }
        }
      }
    } else {
      removed = await this.purgeS3CacheMatching(nameMatches);
    }

    // Drop in-memory entries that match. Cache key is the cachePath sans
    // extension + dir prefix, so we just need to scan keys.
    for (const key of Array.from(this.memoryCache.keys())) {
      for (const h of hashes) {
        if (key.includes(`_${h}_`)) {
          this.memoryCache.delete(key);
          break;
        }
      }
    }
    for (const path of Array.from(this.existsCache.keys())) {
      for (const h of hashes) {
        if (path.includes(`_${h}_`)) {
          this.existsCache.delete(path);
          break;
        }
      }
    }

    return { removed };
  }

  // S3 variant of selective purge — filter cache/ objects by key name and
  // delete in batches. Mirrors purgeS3Cache but with a predicate.
  private static async purgeS3CacheMatching(
    nameMatches: (name: string) => boolean
  ): Promise<number> {
    const settings = await getSettings();
    const s3Config = settings.storage?.providers?.s3;
    if (!s3Config) return 0;

    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
    if (!accessKeyId || !secretAccessKey) return 0;

    const { S3Client, ListObjectsV2Command, DeleteObjectsCommand } =
      await import('@aws-sdk/client-s3');
    const s3 = new S3Client({
      region: s3Config.region,
      credentials: { accessKeyId, secretAccessKey },
      endpoint: s3Config.endpoint,
      forcePathStyle: s3Config.endpoint !== 'https://s3.amazonaws.com'
    });

    let removed = 0;
    let continuationToken: string | undefined;
    do {
      const list = await s3.send(
        new ListObjectsV2Command({
          Bucket: s3Config.bucket,
          Prefix: 'cache/',
          ContinuationToken: continuationToken
        })
      );
      const keys =
        list.Contents?.filter((o) => o.Key && nameMatches(basename(o.Key))).map((o) => ({
          Key: o.Key!
        })) ?? [];
      if (keys.length) {
        await s3.send(
          new DeleteObjectsCommand({
            Bucket: s3Config.bucket,
            Delete: { Objects: keys, Quiet: true }
          })
        );
        removed += keys.length;
      }
      continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
    } while (continuationToken);

    return removed;
  }

  /**
   * Enforce `cache.maxSize` — walks the cache, sums total size, and prunes
   * oldest-first until under the limit. Idempotent + safe to run repeatedly
   * (no-op when under the limit). Designed for periodic invocation via the
   * `sailor cache:sweep` CLI or a cron job.
   *
   * Returns `{ removed, freedBytes, beforeBytes, limit }` for caller logging.
   * If the cache size can't be determined (provider error) or no limit is
   * configured, returns zeros without throwing.
   */
  static async enforceCacheMaxSize(): Promise<{
    removed: number;
    freedBytes: number;
    beforeBytes: number;
    limit: number;
  }> {
    const settings = await getSettings();
    // Env override wins so ops can tighten via deploy without a settings push.
    const limitStr = process.env.CACHE_MAX_SIZE || settings.cache?.maxSize;
    if (!limitStr) return { removed: 0, freedBytes: 0, beforeBytes: 0, limit: 0 };

    let limit = 0;
    try {
      const { parseFileSize } = await import('../settings/index');
      limit = parseFileSize(limitStr);
    } catch {
      return { removed: 0, freedBytes: 0, beforeBytes: 0, limit: 0 };
    }
    if (!limit) return { removed: 0, freedBytes: 0, beforeBytes: 0, limit: 0 };

    const { provider } = await this.getCacheConfig();
    const { LocalStorageProvider } = await import('./storage-provider.server');
    const isLocal = provider instanceof LocalStorageProvider;

    // entries: { key, size, mtimeMs } — sorted ascending = oldest first
    const entries: Array<{ key: string; size: number; mtimeMs: number }> = isLocal
      ? await this.listLocalCacheEntries()
      : await this.listS3CacheEntries();

    const beforeBytes = entries.reduce((sum, e) => sum + e.size, 0);
    if (beforeBytes <= limit) {
      return { removed: 0, freedBytes: 0, beforeBytes, limit };
    }

    entries.sort((a, b) => a.mtimeMs - b.mtimeMs);

    let removed = 0;
    let freedBytes = 0;
    let currentSize = beforeBytes;
    for (const e of entries) {
      if (currentSize <= limit) break;
      try {
        if (isLocal) {
          await unlink(e.key);
        } else {
          await this.deleteS3CacheKey(e.key);
        }
        currentSize -= e.size;
        freedBytes += e.size;
        removed++;
        // Match in-memory cache by basename (without ext); these are best-effort.
        const baseKey = basename(e.key, extname(e.key));
        this.memoryCache.delete(baseKey);
      } catch {
        // ignore failures — leave the entry, move on
      }
    }

    return { removed, freedBytes, beforeBytes, limit };
  }

  private static async listLocalCacheEntries(): Promise<
    Array<{ key: string; size: number; mtimeMs: number }>
  > {
    const cacheDir = await this.getCacheDir();
    if (!existsSync(cacheDir)) return [];
    const { stat } = await import('fs/promises');
    const names = await readdir(cacheDir);
    const out: Array<{ key: string; size: number; mtimeMs: number }> = [];
    for (const name of names) {
      const full = join(cacheDir, name);
      try {
        const s = await stat(full);
        if (s.isFile()) out.push({ key: full, size: s.size, mtimeMs: s.mtimeMs });
      } catch {
        // ignore — race with concurrent delete
      }
    }
    return out;
  }

  private static async listS3CacheEntries(): Promise<
    Array<{ key: string; size: number; mtimeMs: number }>
  > {
    const settings = await getSettings();
    const s3Config = settings.storage?.providers?.s3;
    if (!s3Config) return [];
    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
    if (!accessKeyId || !secretAccessKey) return [];

    const { S3Client, ListObjectsV2Command } = await import('@aws-sdk/client-s3');
    const s3 = new S3Client({
      region: s3Config.region,
      credentials: { accessKeyId, secretAccessKey },
      endpoint: s3Config.endpoint,
      forcePathStyle: s3Config.endpoint !== 'https://s3.amazonaws.com'
    });

    const out: Array<{ key: string; size: number; mtimeMs: number }> = [];
    let continuationToken: string | undefined;
    do {
      const list = await s3.send(
        new ListObjectsV2Command({
          Bucket: s3Config.bucket,
          Prefix: 'cache/',
          ContinuationToken: continuationToken
        })
      );
      for (const o of list.Contents ?? []) {
        if (!o.Key) continue;
        out.push({
          key: o.Key,
          size: o.Size ?? 0,
          mtimeMs: o.LastModified ? o.LastModified.getTime() : 0
        });
      }
      continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
    } while (continuationToken);
    return out;
  }

  private static async deleteS3CacheKey(key: string): Promise<void> {
    const settings = await getSettings();
    const s3Config = settings.storage?.providers?.s3;
    if (!s3Config) return;
    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
    if (!accessKeyId || !secretAccessKey) return;

    const { S3Client, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    const s3 = new S3Client({
      region: s3Config.region,
      credentials: { accessKeyId, secretAccessKey },
      endpoint: s3Config.endpoint,
      forcePathStyle: s3Config.endpoint !== 'https://s3.amazonaws.com'
    });
    await s3.send(new DeleteObjectCommand({ Bucket: s3Config.bucket, Key: key }));
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
