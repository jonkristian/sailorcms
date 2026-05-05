// Recovery view commands: hard-purge soft-deleted entities. Restore is exposed
// per-entity in the existing data.remote.ts files (collections/globals/files);
// this file owns the destructive purge path.

import { command, getRequestEvent } from '$app/server';
import { db } from 'sailorcms/core/db/index.server';
import { eq, isNotNull, and } from 'drizzle-orm';
import * as schema from '$sailor/generated/schema';
import { files as filesTable } from '$sailor/generated/schema';
import { log } from 'sailorcms/core/utils/logger';
import { SearchIndexService } from 'sailorcms/core/services/search-index.server';
import { RevisionsService } from 'sailorcms/core/services/revisions.server';
import { StorageProviderFactory } from 'sailorcms/core/services/storage-provider.server';

export const purgeCollectionItem = command(
  'unchecked',
  async ({ collectionSlug, itemId }: { collectionSlug: string; itemId: string }) => {
    const { locals } = getRequestEvent();
    if (!collectionSlug || !itemId) {
      return { success: false, error: 'Collection slug and item ID are required' };
    }
    if (!(await locals.security.hasPermission('delete', 'content'))) {
      return { success: false, error: 'You do not have permission to purge content' };
    }
    try {
      const table = schema[`collection_${collectionSlug}` as keyof typeof schema];
      if (!table) {
        return { success: false, error: `Collection '${collectionSlug}' not found` };
      }
      // Only purge rows that are already soft-deleted — protects against the
      // recovery UI being used to nuke live items.
      const result = await db
        .delete(table)
        .where(and(eq((table as any).id, itemId), isNotNull((table as any).deleted_at)));
      await SearchIndexService.onDeleteSafe('collection', collectionSlug, itemId);
      await RevisionsService.deleteForEntity({
        entityType: `collection:${collectionSlug}`,
        entityId: itemId
      }).catch((err) =>
        log.error('Failed to drop revisions on purge', { collectionSlug, itemId }, err as Error)
      );
      return { success: true, message: 'Item permanently deleted' };
    } catch (err) {
      log.error('Failed to purge collection item', {}, err as Error);
      return { success: false, error: 'Failed to purge item' };
    }
  }
);

export const purgeGlobalItem = command(
  'unchecked',
  async ({ globalSlug, itemId }: { globalSlug: string; itemId: string }) => {
    const { locals } = getRequestEvent();
    if (!globalSlug || !itemId) {
      return { success: false, error: 'Global slug and item ID are required' };
    }
    if (!(await locals.security.hasPermission('delete', 'content'))) {
      return { success: false, error: 'You do not have permission to purge content' };
    }
    try {
      const table = schema[`global_${globalSlug}` as keyof typeof schema];
      if (!table) {
        return { success: false, error: `Global '${globalSlug}' not found` };
      }
      await db
        .delete(table)
        .where(and(eq((table as any).id, itemId), isNotNull((table as any).deleted_at)));
      await SearchIndexService.onDeleteSafe('global', globalSlug, itemId);
      return { success: true, message: 'Item permanently deleted' };
    } catch (err) {
      log.error('Failed to purge global item', {}, err as Error);
      return { success: false, error: 'Failed to purge item' };
    }
  }
);

export const purgeFile = command('unchecked', async ({ fileId }: { fileId: string }) => {
  const { locals } = getRequestEvent();
  if (!fileId) {
    return { success: false, error: 'File ID is required' };
  }
  if (!(await locals.security.hasPermission('delete', 'files'))) {
    return { success: false, error: 'You do not have permission to purge files' };
  }
  try {
    // Look up the path so we can drop the blob too. Only purge soft-deleted.
    const rows = await db
      .select({ path: filesTable.path })
      .from(filesTable)
      .where(and(eq(filesTable.id, fileId), isNotNull(filesTable.deleted_at)))
      .limit(1);

    if (rows.length === 0) {
      return { success: false, error: 'File not found in recovery' };
    }

    const path = rows[0].path;
    try {
      const provider = await StorageProviderFactory.getProvider();
      const ok = await provider.deleteFile(path);
      if (!ok) {
        // Storage failure shouldn't block DB purge — log and continue.
        log.warn('Could not remove physical file during purge', { path });
      }
    } catch (storageErr) {
      log.warn('Storage error during file purge — proceeding with DB delete', {
        path,
        error: storageErr
      });
    }

    await db
      .delete(filesTable)
      .where(and(eq(filesTable.id, fileId), isNotNull(filesTable.deleted_at)));
    return { success: true, message: 'File permanently deleted' };
  } catch (err) {
    log.error('Failed to purge file', {}, err as Error);
    return { success: false, error: 'Failed to purge file' };
  }
});
