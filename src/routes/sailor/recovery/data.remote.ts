// Recovery view commands: hard-purge soft-deleted entities. Restore is exposed
// per-entity in the existing data.remote.ts files (collections/globals/files);
// this file owns the destructive purge path.

import { command, getRequestEvent } from '$app/server';
import { db } from 'sailorcms/core/db/index.server';
import { eq, isNotNull, and } from 'drizzle-orm';
import * as schema from '$sailor/generated/schema';
import { files as filesTable } from '$sailor/generated/schema';
import { fieldConfigurations } from '$sailor/generated/fields';
import { log } from 'sailorcms/core/utils/logger';
import { SearchIndexService } from 'sailorcms/core/services/search-index.server';
import { RevisionsService } from 'sailorcms/core/services/revisions.server';
import { purgeEntityChildren } from 'sailorcms/core/data/persisters/purge-children.server';
import { StorageProviderFactory } from 'sailorcms/core/services/storage-provider.server';
import { ImageProcessor } from 'sailorcms/core/services/image.server';

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
      // Establish that the item is really in the bin *before* destroying
      // anything. The guard used to live only on the final DELETE, so purging
      // an item someone had restored in the meantime still wiped its locales,
      // arrays, files and relations — and reported success, leaving a live row
      // stripped of everything it owned.
      const trashed = await db
        .select({ id: (table as any).id })
        .from(table as any)
        .where(and(eq((table as any).id, itemId), isNotNull((table as any).deleted_at)))
        .limit(1);
      if (trashed.length === 0) {
        return { success: false, error: 'Item not found in recovery' };
      }

      const isLocalized =
        (fieldConfigurations as any).collections?.[collectionSlug]?.localized === true;
      const localesTable = isLocalized
        ? (schema[`collection_${collectionSlug}_locales` as keyof typeof schema] as any)
        : null;

      // A localized entity's children key on its `_locales` row ids, not the
      // main id, so collect them while those rows still exist.
      const localeIds: string[] = localesTable
        ? (
            await db
              .select({ id: localesTable.id })
              .from(localesTable)
              .where(eq(localesTable[`${collectionSlug}_id`], itemId))
          ).map((row: any) => row.id)
        : [];

      // Child rows first: junction edges, array rows and file links. Leaving
      // them behind is invisible but not harmless — an orphaned junction row
      // still reads as an edge, so counts, filters and reverse panels report
      // items that no longer exist.
      await purgeEntityChildren('collection', collectionSlug, [itemId, ...localeIds]);

      // `_locales` holds a FK back to main; SQLite blocks the main DELETE until
      // those rows go.
      if (localesTable) {
        await db.delete(localesTable).where(eq(localesTable[`${collectionSlug}_id`], itemId));
      }

      await db
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
      // Same ordering as the collection purge: prove it is in the bin before
      // destroying anything, and gather the locale row ids the children key on
      // while those rows are still there.
      const trashed = await db
        .select({ id: (table as any).id })
        .from(table as any)
        .where(and(eq((table as any).id, itemId), isNotNull((table as any).deleted_at)))
        .limit(1);
      if (trashed.length === 0) {
        return { success: false, error: 'Item not found in recovery' };
      }

      const isLocalized = (fieldConfigurations as any).globals?.[globalSlug]?.localized === true;
      const localesTable = isLocalized
        ? (schema[`global_${globalSlug}_locales` as keyof typeof schema] as any)
        : null;
      const localeIds: string[] = localesTable
        ? (
            await db
              .select({ id: localesTable.id })
              .from(localesTable)
              .where(eq(localesTable[`${globalSlug}_id`], itemId))
          ).map((row: any) => row.id)
        : [];

      await purgeEntityChildren('global', globalSlug, [itemId, ...localeIds]);

      if (localesTable) {
        await db.delete(localesTable).where(eq(localesTable[`${globalSlug}_id`], itemId));
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
    // Look up path + url so we can drop the blob AND purge cached variants.
    // Only purge soft-deleted rows.
    const rows = await db
      .select({ path: filesTable.path, url: filesTable.url })
      .from(filesTable)
      .where(and(eq(filesTable.id, fileId), isNotNull(filesTable.deleted_at)))
      .limit(1);

    if (rows.length === 0) {
      return { success: false, error: 'File not found in recovery' };
    }

    const { path, url } = rows[0];
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

    // Purge cached image variants generated from this file's path/url. Cache
    // entries are keyed by a hash of the source path; without this they'd
    // outlive the file forever (R2 grows unbounded on busy sites). Failure
    // here is logged but doesn't block the DB delete.
    try {
      const { removed } = await ImageProcessor.purgeVariantsForFile({ path, url });
      if (removed > 0) log.info('Purged cached variants on file delete', { fileId, removed });
    } catch (cacheErr) {
      log.warn('Cache purge failed during file delete — variants will linger', {
        fileId,
        error: cacheErr
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
