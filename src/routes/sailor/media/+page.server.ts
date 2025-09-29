import { error } from '@sveltejs/kit';
import { db } from '$sailor/core/db/index.server';
import { files as filesTable, users } from '$sailor/generated/schema';
import { eq, like, desc, inArray, sql, and, count } from 'drizzle-orm';
import { log } from '$sailor/core/utils/logger';
import { TagService } from '$sailor/core/services/tag.server';
import { StorageProviderFactory } from '$sailor/core/services/storage-provider.server';
import type { Pagination } from '$sailor/core/types';

export const load = async ({
  url,
  locals
}): Promise<{
  files: any[];
  availableTags: any[];
  pagination: Pagination;
  filters: {
    search: string | undefined;
    type: string;
    tags: string[];
  };
}> => {
  // Check permission to view files
  if (!(await locals.security.hasPermission('read', 'files'))) {
    throw error(403, 'Access denied: You do not have permission to view files');
  }

  // Get pagination parameters from URL
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const pageSize = Math.max(1, Math.min(100, parseInt(url.searchParams.get('pageSize') || '20')));
  const search = url.searchParams.get('search') || undefined;
  const type = (url.searchParams.get('type') as 'image' | 'video' | 'document' | 'all') || 'all';
  const tagsParam = url.searchParams.get('tags');
  const tags = tagsParam
    ? tagsParam
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
    : [];

  try {
    const offset = (page - 1) * pageSize;

    // Use appropriate filtering based on parameters
    let result;
    if (tags.length > 0) {
      // When filtering by tags, get file IDs from tag service then query files
      const fileIds = await TagService.findEntitiesByTags('file', tags, false);

      if (fileIds.length === 0) {
        result = { files: [], total: 0 };
      } else {
        // Build WHERE conditions
        const whereConditions = [inArray(filesTable.id, fileIds)];

        // Add type filtering
        if (type !== 'all') {
          if (type === 'image') {
            whereConditions.push(like(filesTable.mime_type, 'image/%'));
          } else if (type === 'document') {
            whereConditions.push(
              sql`${filesTable.mime_type} NOT LIKE 'image/%' AND ${filesTable.mime_type} NOT LIKE 'video/%'`
            );
          } else if (type === 'video') {
            whereConditions.push(like(filesTable.mime_type, 'video/%'));
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
          .where(and(...whereConditions));

        // Get paginated files with URLs
        const filesResult = await db
          .select()
          .from(filesTable)
          .where(and(...whereConditions))
          .orderBy(desc(filesTable.created_at))
          .limit(pageSize)
          .offset(offset);

        // Generate URLs for files that don't have them stored
        const storageProvider = await StorageProviderFactory.getProvider();
        const filesWithUrls = await Promise.all(
          filesResult.map(async (file: any) => {
            if (file.url && file.url !== '') {
              return file;
            } else {
              const url = await storageProvider.getPublicUrl(file.path);
              return { ...file, url };
            }
          })
        );

        result = {
          files: filesWithUrls,
          total: totalResult[0].count
        };
      }

      // If search is provided, we need to filter the results
      if (search) {
        const filteredFiles = result.files.filter(
          (file: any) =>
            file.name.toLowerCase().includes(search.toLowerCase()) ||
            file.name.toLowerCase().includes(search.toLowerCase())
        );

        // Recalculate total for search results
        result = {
          files: filteredFiles,
          total: filteredFiles.length
        };
      }
    } else {
      // Regular file loading with direct DB query
      const whereConditions = [];

      // Add type filtering
      if (type !== 'all') {
        if (type === 'image') {
          whereConditions.push(like(filesTable.mime_type, 'image/%'));
        } else if (type === 'document') {
          whereConditions.push(
            sql`${filesTable.mime_type} NOT LIKE 'image/%' AND ${filesTable.mime_type} NOT LIKE 'video/%'`
          );
        } else if (type === 'video') {
          whereConditions.push(like(filesTable.mime_type, 'video/%'));
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
        .limit(pageSize)
        .offset(offset);

      // Generate URLs for files that don't have them stored
      const storageProvider = await StorageProviderFactory.getProvider();
      const filesWithUrls = await Promise.all(
        filesResult.map(async (file: any) => {
          if (file.url && file.url !== '') {
            return file;
          } else {
            const url = await storageProvider.getPublicUrl(file.path);
            return { ...file, url };
          }
        })
      );

      result = {
        files: filesWithUrls,
        total: totalResult[0].count
      };
    }

    // Load tags and author names for each file
    const filesWithTagsAndAuthors = await Promise.all(
      result.files.map(async (file) => {
        const fileTags = await TagService.getTagsForEntity('file', file.id);

        // Load author name if file has an author
        let authorName = null;
        if (file.author) {
          try {
            const author = await db
              .select({ name: users.name })
              .from(users)
              .where(eq(users.id, file.author))
              .limit(1);
            authorName = author[0]?.name || null;
          } catch (err) {
            // If author lookup fails, leave as null
            authorName = null;
          }
        }

        return { ...file, tags: fileTags, authorName };
      })
    );

    const totalPages = Math.ceil(result.total / pageSize);

    // Load available tags for filter dropdown
    const availableTags = await TagService.getAllTags();

    return {
      files: filesWithTagsAndAuthors,
      availableTags,
      pagination: {
        page,
        pageSize,
        totalItems: result.total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1
      },
      filters: {
        search,
        type,
        tags
      }
    };
  } catch (error) {
    log.error('Error loading media files', {}, error as Error);
    return {
      files: [],
      availableTags: [],
      pagination: {
        page: 1,
        pageSize,
        totalItems: 0,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false
      },
      filters: {
        search,
        type,
        tags: []
      }
    };
  }
};
