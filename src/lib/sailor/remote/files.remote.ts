// SvelteKit remote functions for file management (cross-cutting)
import { command, query, getRequestEvent } from '$app/server';
import { db } from '$sailor/core/db/index.server';
import { files as filesTable, users as usersTable } from '$sailor/generated/schema';
import { eq, like, desc, inArray, sql, and, count } from 'drizzle-orm';
import { createACL, getPermissionErrorMessage } from '$lib/sailor/core/auth/acl';
import { TagService } from '$sailor/core/services/tag.server';
import { getFileTypeFromMime } from '$sailor/core/files/file';
import { type FileListItem } from '$sailor/core/files/file.server';
import { StorageProviderFactory } from '$sailor/core/services/storage-provider.server';
import { validateFile as validateFileUtil } from '$sailor/core/files/file';
import { type FileType } from '$sailor/core/files/file.server';
import { getSettings, parseFileSize } from '$sailor/core/settings';
import { repairFileURLs } from '$sailor/scripts/repair-file-urls';
import { generateUUID } from '$sailor/core/utils/common';

/**
 * Delete files
 */
export const deleteFiles = command('unchecked', async ({ ids }: { ids: string[] }) => {
  const { locals } = getRequestEvent();

  if (!Array.isArray(ids) || ids.length === 0) {
    return { success: false, error: 'File IDs are required' };
  }

  try {
    let successCount = 0;
    let errorCount = 0;
    const errorMessages: string[] = [];

    // Process each file
    for (const fileId of ids) {
      try {
        // Get file details for ACL check using direct DB query
        const fileResults = await db
          .select()
          .from(filesTable)
          .where(eq(filesTable.id, fileId))
          .limit(1);
        if (!fileResults[0]) {
          errorCount++;
          const errorMessage = 'File not found';
          if (!errorMessages.includes(errorMessage)) {
            errorMessages.push(errorMessage);
          }
          continue;
        }

        const file = fileResults[0];

        // Check if user can delete this file
        const acl = createACL(locals.user!);
        const canDelete = await acl.can('delete', 'file', file);

        if (!canDelete) {
          const errorMessage = getPermissionErrorMessage(locals.user!, 'delete', 'file', file);
          errorCount++;
          if (!errorMessages.includes(errorMessage)) {
            errorMessages.push(errorMessage);
          }
          continue;
        }

        // Delete file from storage
        const storageProvider = await StorageProviderFactory.getProvider();
        const deleted = await storageProvider.deleteFile(file.path);

        if (!deleted) {
          console.warn('Could not delete file from storage:', file.path);
        }

        // Delete from database
        await db.delete(filesTable).where(eq(filesTable.id, fileId));
        successCount++;
      } catch (err) {
        errorCount++;
        const errorMessage = 'Failed to delete file';
        if (!errorMessages.includes(errorMessage)) {
          errorMessages.push(errorMessage);
        }
      }
    }

    // Return appropriate message based on results
    if (errorCount === 0) {
      const message =
        successCount === 1
          ? 'File deleted successfully'
          : `${successCount} files deleted successfully`;
      return { success: true, message, deletedCount: successCount };
    } else if (successCount > 0) {
      const message = `${successCount} files deleted, ${errorCount} failed: ${errorMessages[0]}`;
      return { success: true, message, deletedCount: successCount };
    } else {
      return { success: false, error: errorMessages[0] || 'Failed to delete files' };
    }
  } catch (err) {
    return { success: false, error: 'Failed to delete file(s)' };
  }
});

/**
 * Reconstruct a File object from serializable format
 */
function reconstructFile(fileData: {
  name: string;
  type: string;
  size: number;
  lastModified: number;
  data: Uint8Array;
}): File {
  const blob = new Blob([new Uint8Array(fileData.data)], { type: fileData.type });
  return new File([blob], fileData.name, {
    type: fileData.type,
    lastModified: fileData.lastModified
  });
}

/**
 * Compute SHA256 hash of a file
 */
async function computeFileHash(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Upload files
 */
export const uploadFiles = command(
  'unchecked',
  async ({
    files,
    options = {}
  }: {
    files: Array<{
      name: string;
      type: string;
      size: number;
      lastModified: number;
      data: Uint8Array;
    }>;
    options?: {
      alt?: string;
      title?: string;
      description?: string;
      maxSize?: number;
      accept?: string;
      created_at?: Date;
    };
  }) => {
    const { locals } = getRequestEvent();

    if (!Array.isArray(files) || files.length === 0) {
      return { success: false, error: 'No files provided' };
    }

    try {
      const uploadResults: FileListItem[] = [];
      const errors: Array<{ filename: string; error: string }> = [];

      for (const fileData of files) {
        try {
          // Reconstruct File object from serializable format
          const file = reconstructFile(fileData);

          // Check permissions (create permission for files)
          const acl = createACL(locals.user!);
          const canCreate = await acl.can('create', 'file', {});

          if (!canCreate) {
            const errorMsg = getPermissionErrorMessage(locals.user!, 'create', 'file', {});
            errors.push({
              filename: fileData.name,
              error: errorMsg
            });
            continue;
          }

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
              const updatedFile = {
                ...existingFile,
                alt: options.alt || existingFile.alt,
                title: options.title || existingFile.title,
                description: options.description || existingFile.description,
                updated_at: new Date()
              };

              // Transform to FileListItem format
              const fileListItem: FileListItem = {
                value: updatedFile.id,
                label: updatedFile.name,
                url: updatedFile.url,
                type: getFileTypeFromMime(updatedFile.mime_type),
                size: updatedFile.size,
                created_at: updatedFile.created_at
              };

              uploadResults.push(fileListItem);
              continue;
            }

            // Transform existing file to FileListItem format
            const fileListItem: FileListItem = {
              value: existingFile.id,
              label: existingFile.name,
              url: existingFile.url,
              type: getFileTypeFromMime(existingFile.mime_type),
              size: existingFile.size,
              created_at: existingFile.created_at
            };

            uploadResults.push(fileListItem);
            continue;
          }

          // Get storage provider and upload file
          const storageProvider = await StorageProviderFactory.getProvider();
          const uploadResult = await storageProvider.uploadFile(file);

          const fileRecord = {
            id: generateUUID(),
            name: file.name, // Store original filename from user
            mime_type: file.type,
            size: file.size,
            path: uploadResult.path,
            url: uploadResult.url, // Store the actual URL from storage provider
            hash: fileHash, // Store computed hash
            alt: options.alt || null,
            title: options.title || null,
            description: options.description || null,
            author: locals.user?.id || null, // Set author to current user
            created_at: options.created_at || new Date(), // Use custom date if provided
            updated_at: new Date()
          };

          await db.insert(filesTable).values(fileRecord);

          // Transform to FileListItem format
          const fileListItem: FileListItem = {
            value: fileRecord.id,
            label: fileRecord.name,
            url: fileRecord.url,
            type: getFileTypeFromMime(fileRecord.mime_type),
            size: fileRecord.size,
            created_at: fileRecord.created_at
          };

          uploadResults.push(fileListItem);
        } catch (err) {
          errors.push({
            filename: fileData.name,
            error: err instanceof Error ? err.message : 'Upload failed'
          });
        }
      }

      if (uploadResults.length === 0) {
        const errorMessage = `All file uploads failed: ${errors.map((e) => `${e.filename}: ${e.error}`).join(', ')}`;
        return { success: false, error: errorMessage };
      }

      return {
        success: true,
        message: `${uploadResults.length} file(s) uploaded successfully`,
        files: uploadResults,
        uploadedCount: uploadResults.length,
        ...(errors.length > 0 && { errors })
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to upload files'
      };
    }
  }
);

/**
 * Update file metadata
 */
export const updateFile = command(
  'unchecked',
  async ({
    fileId,
    updates,
    tags
  }: {
    fileId: string;
    updates: {
      alt?: string;
      title?: string;
      description?: string;
    };
    tags?: string[];
  }) => {
    const { locals } = getRequestEvent();

    if (!fileId) {
      return { success: false, error: 'File ID is required' };
    }

    try {
      // Get file for permission check using direct DB query
      const fileResults = await db
        .select()
        .from(filesTable)
        .where(eq(filesTable.id, fileId))
        .limit(1);
      if (!fileResults[0]) {
        return { success: false, error: 'File not found' };
      }
      const file = fileResults[0];

      // Check permissions
      const acl = createACL(locals.user!);
      const canUpdate = await acl.can('update', 'file', file);

      if (!canUpdate) {
        return {
          success: false,
          error: getPermissionErrorMessage(locals.user!, 'update', 'file', file)
        };
      }

      let updatedFile;

      if (tags && Array.isArray(tags)) {
        // Update file metadata first
        const updateData = {
          ...updates,
          updated_at: new Date()
        };

        await db.update(filesTable).set(updateData).where(eq(filesTable.id, fileId));

        // Update tags using TagService
        await TagService.tagEntity('file', fileId, tags);

        // Get updated file
        const updatedFileResults = await db
          .select()
          .from(filesTable)
          .where(eq(filesTable.id, fileId))
          .limit(1);
        updatedFile = updatedFileResults[0];
      } else {
        // Update metadata only
        const updateData = {
          ...updates,
          updated_at: new Date()
        };

        await db.update(filesTable).set(updateData).where(eq(filesTable.id, fileId));

        // Get updated file
        const updatedFileResults = await db
          .select()
          .from(filesTable)
          .where(eq(filesTable.id, fileId))
          .limit(1);
        updatedFile = updatedFileResults[0];
      }

      if (!updatedFile) {
        return { success: false, error: 'File not found' };
      }

      return {
        success: true,
        message: 'File updated successfully',
        file: updatedFile
      };
    } catch (err) {
      return { success: false, error: 'Failed to update file' };
    }
  }
);

/**
 * Bulk update tags for files
 */
export const updateFilesTags = command(
  'unchecked',
  async ({
    ids,
    tags,
    mode = 'replace'
  }: {
    ids: string[];
    tags: string[];
    mode?: 'replace' | 'add' | 'remove';
  }) => {
    const { locals } = getRequestEvent();

    if (!Array.isArray(ids) || ids.length === 0) {
      return { success: false, error: 'File IDs are required' };
    }

    if (!Array.isArray(tags)) {
      return { success: false, error: 'Tags must be an array' };
    }

    try {
      let successCount = 0;
      let errorCount = 0;
      const errorMessages: string[] = [];

      for (const fileId of ids) {
        try {
          let result;

          // Check permissions first (entity-specific)
          const fileResults = await db
            .select()
            .from(filesTable)
            .where(eq(filesTable.id, fileId))
            .limit(1);
          const file = fileResults[0];
          if (!file) {
            errorCount++;
            errorMessages.push('File not found');
            continue;
          }

          const acl = createACL(locals.user!);
          const canUpdate = await acl.can('update', 'file', file);
          if (!canUpdate) {
            errorCount++;
            errorMessages.push(getPermissionErrorMessage(locals.user!, 'update', 'file', file));
            continue;
          }

          // Use TagService for tag operations
          if (mode === 'add') {
            // Get current tags and add new ones
            const currentTags = await TagService.getTagsForEntity('file', fileId);
            const currentTagNames = currentTags.map((tag) => tag.name);
            const allTagNames = [...new Set([...currentTagNames, ...tags])]; // Deduplicate
            await TagService.tagEntity('file', fileId, allTagNames);
            result = { success: true, message: `${tags.length} tag(s) added successfully` };
          } else if (mode === 'remove') {
            // Get current tags and remove specified ones
            const currentTags = await TagService.getTagsForEntity('file', fileId);
            const currentTagNames = currentTags.map((tag) => tag.name);
            const remainingTagNames = currentTagNames.filter((tagName) => !tags.includes(tagName));
            await TagService.tagEntity('file', fileId, remainingTagNames);
            result = { success: true, message: `${tags.length} tag(s) removed successfully` };
          } else if (mode === 'replace') {
            // Replace all tags
            await TagService.tagEntity('file', fileId, tags);
            result = { success: true, message: 'Tags updated successfully' };
          }

          successCount++;
        } catch (err) {
          errorCount++;
          const errorMessage = 'Failed to update tags';
          if (!errorMessages.includes(errorMessage)) {
            errorMessages.push(errorMessage);
          }
        }
      }

      if (errorCount === 0) {
        const message =
          successCount === 1
            ? 'Tags updated successfully'
            : `Tags updated for ${successCount} files`;
        return { success: true, message, updatedCount: successCount };
      } else if (successCount > 0) {
        const message = `Tags updated for ${successCount} files, ${errorCount} failed: ${errorMessages[0]}`;
        return { success: true, message, updatedCount: successCount };
      } else {
        return { success: false, error: errorMessages[0] || 'Failed to update tags' };
      }
    } catch (err) {
      return { success: false, error: 'Failed to update tags' };
    }
  }
);

/**
 * Get a single file by ID
 */
export const getFile = command('unchecked', async ({ fileId }: { fileId: string }) => {
  if (!fileId) {
    return { success: false, error: 'File ID is required' };
  }

  try {
    const fileResults = await db
      .select()
      .from(filesTable)
      .where(eq(filesTable.id, fileId))
      .limit(1);
    const file = fileResults[0];
    if (!file) {
      return { success: false, error: 'File not found' };
    }

    // Generate URL if not stored
    if (!file.url || file.url === '') {
      const storageProvider = await StorageProviderFactory.getProvider();
      const url = await storageProvider.getPublicUrl(file.path);
      const fileWithUrl = { ...file, url };
      return { success: true, file: fileWithUrl };
    }

    return { success: true, file };
  } catch (err) {
    return { success: false, error: 'Failed to get file' };
  }
});

/**
 * Get files with pagination and search
 */
export const getFiles = query(
  'unchecked',
  async ({
    limit = 50,
    offset = 0,
    search,
    type = 'all',
    ids
  }: {
    limit?: number;
    offset?: number;
    search?: string;
    type?: 'image' | 'document' | 'all';
    ids?: string[];
  }) => {
    try {
      // If specific IDs are requested, fetch them directly
      if (ids && ids.length > 0) {
        const filesResult = await db
          .select()
          .from(filesTable)
          .where(inArray(filesTable.id, ids))
          .orderBy(desc(filesTable.created_at));

        // Generate URLs for files that don't have them stored
        const storageProvider = await StorageProviderFactory.getProvider();
        const filesWithUrls = await Promise.all(
          filesResult.map(async (file: FileType) => {
            if (file.url && file.url !== '') {
              return file;
            } else {
              const url = await storageProvider.getPublicUrl(file.path);
              return { ...file, url };
            }
          })
        );

        return {
          success: true,
          files: filesWithUrls,
          total: filesWithUrls.length
        };
      }

      // Regular query with filtering
      const whereConditions = [];

      // Add type filtering
      if (type !== 'all') {
        if (type === 'image') {
          whereConditions.push(like(filesTable.mime_type, 'image/%'));
        } else if (type === 'document') {
          whereConditions.push(
            sql`${filesTable.mime_type} NOT LIKE 'image/%' AND ${filesTable.mime_type} NOT LIKE 'video/%'`
          );
        }
      }

      // Add search filtering
      if (search) {
        whereConditions.push(like(filesTable.name, `%${search}%`));
      }

      // Get total count
      const totalResult = await db
        .select({ count: count() })
        .from(filesTable)
        .where(whereConditions.length > 0 ? and(...whereConditions) : undefined);

      // Get paginated files
      const filesResult = await db
        .select()
        .from(filesTable)
        .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
        .orderBy(desc(filesTable.created_at))
        .limit(limit)
        .offset(offset);

      // Generate URLs for files that don't have them stored
      const storageProvider = await StorageProviderFactory.getProvider();
      const filesWithUrls = await Promise.all(
        filesResult.map(async (file: FileType) => {
          if (file.url && file.url !== '') {
            return file;
          } else {
            const url = await storageProvider.getPublicUrl(file.path);
            return { ...file, url };
          }
        })
      );

      return {
        success: true,
        files: filesWithUrls,
        total: totalResult[0].count
      };
    } catch (err) {
      return { success: false, error: 'Failed to get files' };
    }
  }
);

/**
 * Get tags for a file
 */
export const getFileTags = command('unchecked', async ({ fileId }: { fileId: string }) => {
  if (!fileId) {
    return { success: false, error: 'File ID is required' };
  }

  try {
    const tags = await TagService.getTagsForEntity('file', fileId);
    return { success: true, tags };
  } catch (err) {
    return { success: false, error: 'Failed to get file tags' };
  }
});

/**
 * Repair file URLs
 */
export const repairFileUrls = command(
  'unchecked',
  async ({
    dryRun = false,
    provider = 'auto'
  }: {
    dryRun?: boolean;
    provider?: 'local' | 's3' | 'auto';
  }) => {
    try {
      const stats = await repairFileURLs({
        dryRun,
        provider: provider as 'local' | 's3' | 'auto'
      });

      return {
        success: true,
        ...stats
      };
    } catch (error) {
      console.error('File repair error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to repair file URLs'
      };
    }
  }
);

/**
 * Check files in storage (dry run)
 */
export const checkFiles = command('unchecked', async () => {
  try {
    const stats = { scanned: 0, imported: 0, errors: 0, skipped: 0 };

    // Get storage provider
    const storageProvider = await StorageProviderFactory.getProvider();

    // Get existing files from database
    const existingFiles = await db.select({ path: filesTable.path }).from(filesTable);
    const existingPaths = new Set(existingFiles.map((f: any) => f.path));

    // Scan storage for files
    const storageFiles = await storageProvider.listFiles();
    stats.scanned = storageFiles.length;

    const filesToImport = storageFiles.filter((file) => {
      const notExists = !existingPaths.has(file.path);

      if (!notExists) {
        stats.skipped++;
        return false;
      }
      return true;
    });

    return {
      success: true,
      message: `Found ${filesToImport.length} files to import`,
      stats: { ...stats, imported: filesToImport.length },
      files: filesToImport.slice(0, 10) // Preview first 10
    };
  } catch (error) {
    console.error('Check files failed:', error);
    return {
      success: false,
      error: 'Check files failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
});

/**
 * Import files from storage
 */
export const importFiles = command(
  'unchecked',
  async ({ dryRun = false }: { dryRun?: boolean }) => {
    try {
      const stats = { scanned: 0, imported: 0, errors: 0, skipped: 0 };

      // Get storage provider
      const storageProvider = await StorageProviderFactory.getProvider();

      // Get existing files from database
      const existingFiles = await db.select({ path: filesTable.path }).from(filesTable);
      const existingPaths = new Set(existingFiles.map((f: any) => f.path));

      // Scan storage for files
      const storageFiles = await storageProvider.listFiles();
      stats.scanned = storageFiles.length;

      const filesToImport = storageFiles.filter((file) => {
        const notExists = !existingPaths.has(file.path);

        if (!notExists) {
          stats.skipped++;
          return false;
        }
        return true;
      });

      if (dryRun) {
        return {
          success: true,
          message: `Found ${filesToImport.length} files to import`,
          stats: { ...stats, imported: filesToImport.length },
          files: filesToImport.slice(0, 10) // Preview first 10
        };
      }

      // Import files
      for (const file of filesToImport) {
        try {
          const filename = file.path.split('/').pop() || file.path;
          const publicUrl = await storageProvider.getPublicUrl(file.path);

          // Get MIME type from filename
          const ext = filename.includes('.') ? '.' + filename.split('.').pop()?.toLowerCase() : '';
          const mimeTypes: Record<string, string> = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.svg': 'image/svg+xml',
            '.pdf': 'application/pdf',
            '.txt': 'text/plain',
            '.doc': 'application/msword',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          };
          const mimeType = mimeTypes[ext] || 'application/octet-stream';

          await db.insert(filesTable).values({
            name: filename,
            mime_type: mimeType,
            size: file.size || 0,
            path: file.path,
            url: publicUrl,
            author: null, // No author for imported files
            created_at: new Date(),
            updated_at: new Date()
          });

          stats.imported++;
        } catch (error) {
          console.error('Import error for', file.path, error);
          stats.errors++;
        }
      }

      return {
        success: true,
        message: `Imported ${stats.imported} files successfully`,
        stats
      };
    } catch (error) {
      console.error('Import failed:', error);
      return {
        success: false,
        error: 'Import failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
);

/**
 * Find files by tags
 */
export const findFilesByTags = command(
  'unchecked',
  async ({ tags, matchAll = false }: { tags: string[]; matchAll?: boolean }) => {
    if (!Array.isArray(tags) || tags.length === 0) {
      return { success: false, error: 'Tags are required' };
    }

    try {
      const fileIds = await TagService.findEntitiesByTags('file', tags, matchAll);
      return { success: true, fileIds };
    } catch (err) {
      return { success: false, error: 'Failed to find files by tags' };
    }
  }
);

/**
 * Get author name by user ID
 */
export const getAuthor = query('unchecked', async ({ userId }: { userId: string }) => {
  if (!userId) return { success: true, name: null };

  try {
    const user = await db
      .select({ name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    return {
      success: true,
      name: user[0]?.name || null
    };
  } catch (err) {
    return { success: true, name: null };
  }
});
