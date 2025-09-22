import { db } from '$sailor/core/db/index.server';
import { files as filesTable } from '$sailor/generated/schema';
import { eq, like, desc, inArray, and, count } from 'drizzle-orm';
import { StorageProviderFactory } from '$sailor/core/services/storage-provider.server';
import { TagService } from '$sailor/core/services/tag.server';
import {
  getFileUrl as getFileUrlFromClient,
  type FileTransformOptions,
  validateFile as validateFileUtil
} from '$sailor/core/files/file.server';
import { getSettings, parseFileSize } from '$sailor/core/settings';
import { createHash } from 'crypto';
import crypto from 'crypto';
import type { File as FileType, Tag } from '$sailor/generated/types';

/**
 * Server-side file utilities
 *
 * ⚠️  ONLY use these for server-side rendering needs:
 *     - SEO meta tags (og:image, etc.)
 *     - Email templates
 *     - PDF generation
 *     - RSS feeds
 *
 * ⚠️  For client components, use the client-side getImage() which handles UUIDs automatically
 */

/**
 * Get a file URL by database ID (server-side only)
 *
 * @example
 * ```typescript
 * // SEO meta tags in +page.server.ts
 * const fileUrl = await getFile(post.attachment_id);
 * return { post, fileUrl };
 * ```
 */
export async function getFile(fileId: string): Promise<string> {
  if (!fileId) return '';

  try {
    const fileResults = await db
      .select()
      .from(filesTable)
      .where(eq(filesTable.id, fileId))
      .limit(1);
    const file = fileResults[0];

    if (!file) return '';

    // Use stored URL if available, otherwise generate dynamically
    if (file.url && file.url !== '') {
      return file.url;
    } else {
      // Generate URL dynamically
      const storageProvider = await StorageProviderFactory.getProvider();
      const url = await storageProvider.getPublicUrl(file.path);
      return url;
    }
  } catch (error) {
    console.error(`Failed to get file URL for ID ${fileId}:`, error);
    return '';
  }
}

/**
 * Get a complete file object by database ID (server-side only)
 *
 * @example
 * ```typescript
 * // API routes that need full file data
 * const file = await getFileObject(fileId);
 * if (file) {
 *   const url = file.url || await storageProvider.getPublicUrl(file.path);
 * }
 * ```
 */
export async function getFileObject(fileId: string): Promise<FileType | null> {
  if (!fileId) return null;

  try {
    const fileResults = await db
      .select()
      .from(filesTable)
      .where(eq(filesTable.id, fileId))
      .limit(1);
    const file = fileResults[0];

    if (!file) return null;

    // Generate URL if not stored
    if (!file.url || file.url === '') {
      const storageProvider = await StorageProviderFactory.getProvider();
      const url = await storageProvider.getPublicUrl(file.path);
      return { ...file, url };
    }

    return file;
  } catch (error) {
    console.error(`Failed to get file object for ID ${fileId}:`, error);
    return null;
  }
}

/**
 * Get an image URL by database ID (server-side only)
 *
 * @example
 * ```typescript
 * // SEO meta tags in +page.server.ts
 * const ogImage = await getImage(post.featured_image, { width: 1200, height: 630 });
 * return { post, ogImage };
 * ```
 */
export async function getImage(
  fileId: string,
  options: FileTransformOptions = {}
): Promise<string> {
  if (!fileId) return '';

  try {
    const fileResults = await db
      .select()
      .from(filesTable)
      .where(eq(filesTable.id, fileId))
      .limit(1);
    const file = fileResults[0];

    if (!file) return '';

    // Get file URL (either stored or generated)
    let fileUrl = file.url;
    if (!fileUrl || fileUrl === '') {
      const storageProvider = await StorageProviderFactory.getProvider();
      fileUrl = await storageProvider.getPublicUrl(file.path);
    }

    // Apply transformations
    return getFileUrlFromClient(fileUrl, { ...options, transform: true });
  } catch (error) {
    console.error(`Failed to get image URL for ID ${fileId}:`, error);
    return '';
  }
}

/**
 * Get images by tags with pagination and filtering options (server-side only)
 *
 * @example
 * ```typescript
 * // Get gallery images in +page.server.ts
 * const galleryImages = await getImagesByTags(['gallery', 'featured']);
 * return { galleryImages };
 *
 * // Get images with pagination
 * const result = await getImagesByTags(['nature'], { limit: 20, offset: 0 });
 *
 * // Get images that have ALL specified tags
 * const specificImages = await getImagesByTags(['nature', 'sunset'], {
 *   matchAll: true,
 *   limit: 10,
 *   offset: 20
 * });
 * ```
 */
export async function getImagesByTags(
  tags: string[],
  options: {
    limit?: number;
    offset?: number;
    matchAll?: boolean;
  } = {}
): Promise<ImageResult> {
  if (!tags || tags.length === 0) {
    return {
      images: [],
      total: 0,
      hasMore: false
    };
  }

  const { limit = 50, offset = 0, matchAll = false } = options;

  try {
    // Get file IDs from tag service
    const fileIds = await TagService.findEntitiesByTags('file', tags, matchAll);

    if (fileIds.length === 0) {
      return {
        images: [],
        total: 0,
        hasMore: false
      };
    }

    // Build WHERE conditions for tag filtering (images only)
    const whereConditions = [
      inArray(filesTable.id, fileIds),
      like(filesTable.mime_type, 'image/%')
    ];

    // Get total count
    const totalResult = await db
      .select({ count: count() })
      .from(filesTable)
      .where(and(...whereConditions));

    // Get paginated files
    const filesResult = await db
      .select()
      .from(filesTable)
      .where(and(...whereConditions))
      .orderBy(desc(filesTable.created_at))
      .limit(limit)
      .offset(offset);

    // Generate URLs and load tags for each image
    const storageProvider = await StorageProviderFactory.getProvider();
    const imagesWithTags = await Promise.all(
      filesResult.map(async (file: any) => {
        // Generate URL if needed
        let fileUrl = file.url;
        if (!fileUrl || fileUrl === '') {
          fileUrl = await storageProvider.getPublicUrl(file.path);
        }

        // Load tags for file
        const fileTags = await TagService.getTagsForEntity('file', file.id);

        return {
          ...file,
          url: fileUrl,
          tags: fileTags
        } as ImageWithTags;
      })
    );

    const total = totalResult[0].count;

    return {
      images: imagesWithTags,
      total: total,
      hasMore: offset + imagesWithTags.length < total
    };
  } catch (error) {
    console.error(`Failed to get images by tags ${tags.join(', ')}:`, error);
    return {
      images: [],
      total: 0,
      hasMore: false
    };
  }
}

// Type definitions for the getImagesByTags function
export interface ImageWithTags extends FileType {
  tags: Tag[];
}

export interface ImageResult {
  images: ImageWithTags[];
  total: number;
  hasMore: boolean;
}

/**
 * Compute SHA256 hash of a file
 */
async function computeFileHash(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const hash = createHash('sha256');
  hash.update(new Uint8Array(arrayBuffer));
  return hash.digest('hex');
}

/**
 * Upload a single file with validation and deduplication (server-side only)
 *
 * @example
 * ```typescript
 * // WordPress import in server context
 * const uploadedFile = await uploadFile(file, {
 *   alt: 'Image description',
 *   created_at: new Date(wordpressDate)
 * });
 * ```
 */
export async function uploadFile(
  file: File,
  options: {
    alt?: string;
    title?: string;
    description?: string;
    maxSize?: number;
    accept?: string;
    created_at?: Date;
  } = {}
): Promise<FileType> {
  // Get settings for validation
  const settings = await getSettings();
  const maxFileSize = parseFileSize(settings.storage.upload.maxFileSize);
  const allowedTypes = settings.storage.upload.allowedTypes;

  const validationError = validateFileUtil(file, {
    maxSize: options.maxSize || maxFileSize,
    accept: options.accept || allowedTypes.join(',')
  });

  if (validationError) {
    throw new Error(validationError);
  }

  // Compute file hash for deduplication
  const fileHash = await computeFileHash(file);

  // Check if a file with this hash already exists
  const existingFileResults = await db
    .select()
    .from(filesTable)
    .where(eq(filesTable.hash, fileHash))
    .limit(1);
  const existingFile = existingFileResults[0];

  if (existingFile) {
    // File already exists, return the existing file record
    // Update metadata if provided
    if (options.alt || options.title || options.description) {
      await db
        .update(filesTable)
        .set({
          alt: options.alt || existingFile.alt,
          title: options.title || existingFile.title,
          description: options.description || existingFile.description,
          updated_at: new Date()
        })
        .where(eq(filesTable.id, existingFile.id));

      // Return updated file
      return {
        ...existingFile,
        alt: options.alt || existingFile.alt,
        title: options.title || existingFile.title,
        description: options.description || existingFile.description,
        updated_at: new Date()
      };
    }

    return existingFile;
  }

  // Get storage provider and upload file
  const storageProvider = await StorageProviderFactory.getProvider();
  const uploadResult = await storageProvider.uploadFile(file);

  const fileRecord = {
    id: crypto.randomUUID(),
    name: file.name, // Store original filename from user
    mime_type: file.type,
    size: file.size,
    path: uploadResult.path,
    url: uploadResult.url, // Store the actual URL from storage provider
    hash: fileHash, // Store computed hash
    alt: options.alt || null,
    title: options.title || null,
    description: options.description || null,
    created_at: options.created_at || new Date(), // Use custom date if provided
    updated_at: new Date()
  };

  await db.insert(filesTable).values(fileRecord);

  // Convert Date objects to strings to match File interface
  return {
    ...fileRecord,
    created_at: fileRecord.created_at.toISOString(),
    updated_at: fileRecord.updated_at.toISOString()
  };
}
