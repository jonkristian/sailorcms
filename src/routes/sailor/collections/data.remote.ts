// SvelteKit remote functions
import { command, getRequestEvent } from '$app/server';
import { db } from 'sailorcms/core/db/index.server';
import { log } from 'sailorcms/core/utils/logger';
import { eq, and, or, sql, asc, ne } from 'drizzle-orm';
import * as schema from '$sailor/generated/schema';
import { fieldConfigurations } from '$sailor/generated/fields';
import { generateUUID } from 'sailorcms/core/utils/common';
import { TagService } from 'sailorcms/core/services/tag.server';
import { SearchIndexService } from 'sailorcms/core/services/search-index.server';
import { getContentSettings } from 'sailorcms/utils/data/collections';

/**
 * Resolve the right scope for tag/sort/nesting/etc writes on a collection
 * item. For localized collections, sort/parent_id/tags live on the
 * `_locales` row keyed by `(item_id, locale)`. Non-localized collections
 * still write to main.
 *
 * Throws if a localized collection has no translation for the requested
 * locale — operations target a translation row that doesn't exist would
 * silently no-op (UPDATE 0 rows) or write orphan tags.
 */
async function resolveLocaleScope(
  collectionSlug: string,
  mainItemId: string,
  locale?: string
): Promise<{
  isLocalized: boolean;
  taggableType: string;
  entityId: string;
  currentLocale: string | null;
  localesTable: any;
  fkField: string;
}> {
  const isLocalized =
    (fieldConfigurations as any).collections?.[collectionSlug]?.localized === true;
  if (!isLocalized) {
    return {
      isLocalized: false,
      taggableType: `collection_${collectionSlug}`,
      entityId: mainItemId,
      currentLocale: null,
      localesTable: null,
      fkField: ''
    };
  }

  const { defaultLocale } = getContentSettings();
  const currentLocale = locale || defaultLocale;
  if (!currentLocale) {
    throw new Error(
      `Localized collection '${collectionSlug}' needs content.i18n.default set in templates/settings.ts`
    );
  }

  const localesTable = (schema as any)[`collection_${collectionSlug}_locales`];
  if (!localesTable) {
    throw new Error(
      `Localized collection '${collectionSlug}' missing locales table — run db:update`
    );
  }
  const fkField = `${collectionSlug}_id`;
  const rows = await db
    .select({ id: localesTable.id })
    .from(localesTable)
    .where(and(eq(localesTable[fkField], mainItemId), eq(localesTable.locale, currentLocale)))
    .limit(1);

  if (rows.length === 0) {
    throw new Error(
      `Collection '${collectionSlug}' has no translation for locale '${currentLocale}' on item ${mainItemId} — save the translation first.`
    );
  }

  return {
    isLocalized: true,
    taggableType: `collection_${collectionSlug}`,
    entityId: rows[0].id as string,
    currentLocale,
    localesTable,
    fkField
  };
}

/**
 * Clone collection items
 */
export const cloneCollectionItems = command(
  'unchecked',
  async ({ collectionSlug, itemIds }: { collectionSlug: string; itemIds: string[] }) => {
    const { locals } = getRequestEvent();

    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return { success: false, error: 'Item IDs are required' };
    }

    try {
      const collectionTable = schema[`collection_${collectionSlug}` as keyof typeof schema];
      if (!collectionTable) {
        return { success: false, error: `Collection '${collectionSlug}' not found` };
      }

      // Cloning a localized item means deep-copying the main row + every
      // `_locales` row + every per-locale junction + every per-locale block.
      // Not wired up yet — fail loudly rather than silently shipping a clone
      // that loses all translations.
      const isLocalized =
        (fieldConfigurations as any).collections?.[collectionSlug]?.localized === true;
      if (isLocalized) {
        return {
          success: false,
          error: `Cloning isn't supported for localized collections yet — clone the source item, edit each translation manually, or implement deep-clone in cloneCollectionItems.`
        };
      }

      let successCount = 0;
      let errorCount = 0;
      const errorMessages: string[] = [];

      for (const itemId of itemIds) {
        try {
          // Get the original item
          const originalItem = await db
            .select()
            .from(collectionTable)
            .where(eq((collectionTable as any).id, itemId))
            .limit(1);

          if (originalItem.length === 0) {
            errorCount++;
            if (!errorMessages.includes('Original item not found')) {
              errorMessages.push('Original item not found');
            }
            continue;
          }

          // Check permissions
          const canCreate = await locals.security.hasPermission('create', 'content');

          if (!canCreate) {
            const errorMessage = 'You do not have permission to create content';
            errorCount++;
            if (!errorMessages.includes(errorMessage)) {
              errorMessages.push(errorMessage);
            }
            continue;
          }

          const original = originalItem[0];
          const timestamp = Date.now();

          // Create a clone with new ID and modified title/slug
          const clonedData = {
            ...original,
            id: generateUUID(),
            title: `${original.title} (Copy)`,
            slug: original.slug ? `${original.slug}-copy-${timestamp}` : null,
            author: locals.user?.id || original.author,
            created_at: new Date(),
            updated_at: new Date(),
            // Reset parent relationship to avoid hierarchy issues
            parent_id: null
          };

          // Remove fields that should be auto-generated
          delete (clonedData as any).created_at;
          delete (clonedData as any).updated_at;

          await db.insert(collectionTable).values({
            ...clonedData,
            created_at: new Date(),
            updated_at: new Date()
          });

          successCount++;
        } catch (err) {
          errorCount++;
          const errorMessage = 'Failed to clone item';
          if (!errorMessages.includes(errorMessage)) {
            errorMessages.push(errorMessage);
          }
        }
      }

      if (errorCount === 0) {
        const message =
          successCount === 1
            ? 'Item cloned successfully'
            : `${successCount} items cloned successfully`;
        return { success: true, message, clonedCount: successCount };
      } else if (successCount > 0) {
        const message = `${successCount} items cloned, ${errorCount} failed: ${errorMessages[0]}`;
        return { success: true, message, clonedCount: successCount };
      } else {
        return { success: false, error: errorMessages[0] || 'Failed to clone items' };
      }
    } catch (err) {
      return { success: false, error: 'Failed to clone items' };
    }
  }
);

/**
 * Delete collection items
 */
export const deleteCollectionItems = command(
  'unchecked',
  async ({ collectionSlug, itemIds }: { collectionSlug: string; itemIds: string[] }) => {
    const { locals } = getRequestEvent();

    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return { success: false, error: 'Item IDs are required' };
    }

    try {
      const collectionTable = schema[`collection_${collectionSlug}` as keyof typeof schema];
      if (!collectionTable) {
        return { success: false, error: `Collection '${collectionSlug}' not found` };
      }

      let successCount = 0;
      let errorCount = 0;
      const errorMessages: string[] = [];

      for (const itemId of itemIds) {
        try {
          // Get item details for permission checking
          const itemToDelete = await db
            .select({
              id: (collectionTable as any).id,
              status: (collectionTable as any).status,
              author: (collectionTable as any).author
            })
            .from(collectionTable)
            .where(eq((collectionTable as any).id, itemId))
            .limit(1);

          if (itemToDelete.length === 0) {
            errorCount++;
            const errorMessage = 'Item not found';
            if (!errorMessages.includes(errorMessage)) {
              errorMessages.push(errorMessage);
            }
            continue;
          }

          // Check permissions
          const canDelete = await locals.security.hasPermission('delete', 'content');

          if (!canDelete) {
            const errorMessage = 'You do not have permission to delete content';
            errorCount++;
            if (!errorMessages.includes(errorMessage)) {
              errorMessages.push(errorMessage);
            }
            continue;
          }

          // Soft-delete: mark deleted_at + deleted_by; row stays in the DB so
          // it can be restored from the recovery view. Search index is removed
          // immediately so deleted items don't surface in search results.
          await db
            .update(collectionTable)
            .set({
              deleted_at: new Date(),
              deleted_by: locals.user?.id ?? null,
              updated_at: new Date()
            } as any)
            .where(eq((collectionTable as any).id, itemId));
          await SearchIndexService.onDeleteSafe('collection', collectionSlug, itemId);
          successCount++;
        } catch (err) {
          errorCount++;
          const errorMessage = 'Failed to delete item';
          if (!errorMessages.includes(errorMessage)) {
            errorMessages.push(errorMessage);
          }
        }
      }

      if (errorCount === 0) {
        return { success: true, deletedCount: successCount };
      } else if (successCount > 0) {
        return { success: true, deletedCount: successCount };
      } else {
        return { success: false, error: errorMessages[0] || 'Failed to delete items' };
      }
    } catch (err) {
      return { success: false, error: 'Failed to delete items' };
    }
  }
);

/**
 * Bulk update author for collection items
 */
export const updateCollectionItemsAuthor = command(
  'unchecked',
  async ({
    collectionSlug,
    itemIds,
    authorId
  }: {
    collectionSlug: string;
    itemIds: string[];
    authorId: string;
  }) => {
    const { locals } = getRequestEvent();

    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return { success: false, error: 'Item IDs are required' };
    }

    if (!authorId) {
      return { success: false, error: 'Author ID is required' };
    }

    try {
      const collectionTable = schema[`collection_${collectionSlug}` as keyof typeof schema];
      if (!collectionTable) {
        return { success: false, error: `Collection '${collectionSlug}' not found` };
      }

      let successCount = 0;
      let errorCount = 0;
      const errorMessages: string[] = [];

      for (const itemId of itemIds) {
        try {
          const item = await db
            .select({ id: (collectionTable as any).id, author: (collectionTable as any).author })
            .from(collectionTable)
            .where(eq((collectionTable as any).id, itemId))
            .limit(1);

          if (item.length === 0) {
            errorCount++;
            if (!errorMessages.includes('Item not found')) {
              errorMessages.push('Item not found');
            }
            continue;
          }

          const canUpdate = await locals.security.hasPermission('update', 'content');
          if (!canUpdate) {
            errorCount++;
            const msg = 'You do not have permission to update content';
            if (!errorMessages.includes(msg)) {
              errorMessages.push(msg);
            }
            continue;
          }

          await db
            .update(collectionTable)
            .set({ author: authorId, updated_at: new Date() })
            .where(eq((collectionTable as any).id, itemId));
          successCount++;
        } catch (e) {
          errorCount++;
          if (!errorMessages.includes('Failed to update author')) {
            errorMessages.push('Failed to update author');
          }
        }
      }

      if (errorCount === 0) {
        const message =
          successCount === 1
            ? 'Author updated successfully'
            : `Author updated for ${successCount} items`;
        return { success: true, message, updatedCount: successCount };
      } else if (successCount > 0) {
        const message = `Author updated for ${successCount} items, ${errorCount} failed: ${errorMessages[0]}`;
        return { success: true, message, updatedCount: successCount };
      } else {
        return { success: false, error: errorMessages[0] || 'Failed to update author' };
      }
    } catch (err) {
      return { success: false, error: 'Failed to update author' };
    }
  }
);

/**
 * Update sort order for collection items
 */
export const updateCollectionItemsSort = command(
  'unchecked',
  async ({
    collectionSlug,
    updates,
    locale
  }: {
    collectionSlug: string;
    updates: Array<{ id: string; sort: number }>;
    /** For localized collections — defaults to `content.i18n.default`. Sort lives on `_locales` (per-locale tree). */
    locale?: string;
  }) => {
    const { locals } = getRequestEvent();

    if (!Array.isArray(updates) || updates.length === 0) {
      return { success: false, error: 'Updates are required' };
    }

    try {
      const collectionTable = schema[`collection_${collectionSlug}` as keyof typeof schema];
      if (!collectionTable) {
        return { success: false, error: `Collection '${collectionSlug}' not found` };
      }

      const canUpdate = await locals.security.hasPermission('update', 'content');
      if (!canUpdate) {
        return { success: false, error: 'You do not have permission to update content' };
      }

      const isLocalized =
        (fieldConfigurations as any).collections?.[collectionSlug]?.localized === true;

      if (isLocalized) {
        // For localized collections, sort lives on the `_locales` row for
        // the current locale. Each translation can have its own ordering.
        const { defaultLocale } = getContentSettings();
        const currentLocale = locale || defaultLocale;
        if (!currentLocale) {
          return {
            success: false,
            error: `Localized collection '${collectionSlug}' needs content.i18n.default set in templates/settings.ts`
          };
        }
        const localesTable = (schema as any)[`collection_${collectionSlug}_locales`];
        if (!localesTable) {
          return {
            success: false,
            error: `Localized collection '${collectionSlug}' missing locales table — run db:update`
          };
        }
        const fkField = `${collectionSlug}_id`;
        for (const update of updates) {
          await db
            .update(localesTable)
            .set({ sort: update.sort, updated_at: new Date() })
            .where(
              and(eq(localesTable[fkField], update.id), eq(localesTable.locale, currentLocale))
            );
        }
        return { success: true };
      }

      // Non-localized path: verify items exist, then update sort on main.
      for (const update of updates) {
        const item = await db
          .select()
          .from(collectionTable)
          .where(eq((collectionTable as any).id, update.id))
          .limit(1);
        if (item.length === 0) {
          return { success: false, error: `Item with ID '${update.id}' not found` };
        }
      }

      for (const update of updates) {
        await db
          .update(collectionTable)
          .set({ sort: update.sort, updated_at: new Date() })
          .where(eq((collectionTable as any).id, update.id));
      }

      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to update sort order'
      };
    }
  }
);

/**
 * Update nesting for a collection item
 */
export const updateCollectionItemNesting = command(
  'unchecked',
  async ({
    collectionSlug,
    itemId,
    parentId,
    newIndex,
    locale
  }: {
    collectionSlug: string;
    itemId: string;
    parentId: string | null;
    newIndex: number;
    /** For localized collections — defaults to `content.i18n.default`. parent_id + sort live on `_locales`. */
    locale?: string;
  }) => {
    const { locals } = getRequestEvent();

    if (!itemId) {
      return { success: false, error: 'Item ID is required' };
    }

    if (parentId === itemId) {
      return { success: false, error: 'Cannot nest an item under itself' };
    }

    try {
      const collectionTable = schema[`collection_${collectionSlug}` as keyof typeof schema];
      if (!collectionTable) {
        return { success: false, error: `Collection '${collectionSlug}' not found` };
      }

      const canUpdate = await locals.security.hasPermission('update', 'content');
      if (!canUpdate) {
        return { success: false, error: 'You do not have permission to update content' };
      }

      const isLocalized =
        (fieldConfigurations as any).collections?.[collectionSlug]?.localized === true;

      // Resolve the table + columns for the parent_id/sort write. Localized
      // collections store both on `_locales`; siblings query also targets that
      // table scoped to the current locale.
      let writeTable: any;
      let parentCol: any;
      let sortCol: any;
      let idCol: any;
      let extraWhere: any = undefined;

      if (isLocalized) {
        const { defaultLocale } = getContentSettings();
        const currentLocale = locale || defaultLocale;
        if (!currentLocale) {
          return {
            success: false,
            error: `Localized collection '${collectionSlug}' needs content.i18n.default set`
          };
        }
        const localesTable = (schema as any)[`collection_${collectionSlug}_locales`];
        if (!localesTable) {
          return {
            success: false,
            error: `Localized collection '${collectionSlug}' missing locales table — run db:update`
          };
        }
        const fkField = `${collectionSlug}_id`;
        // Confirm the locale row exists before we calculate sibling positions.
        const localeRow = await db
          .select({ id: localesTable.id })
          .from(localesTable)
          .where(and(eq(localesTable[fkField], itemId), eq(localesTable.locale, currentLocale)))
          .limit(1);
        if (localeRow.length === 0) {
          return {
            success: false,
            error: `Collection '${collectionSlug}' has no translation for locale '${currentLocale}' on item ${itemId} — save the translation first.`
          };
        }
        writeTable = localesTable;
        parentCol = localesTable.parent_id;
        sortCol = localesTable.sort;
        idCol = localesTable[fkField]; // keyed by main item id, locale-scoped
        extraWhere = eq(localesTable.locale, currentLocale);
      } else {
        const item = await db
          .select()
          .from(collectionTable)
          .where(eq((collectionTable as any).id, itemId))
          .limit(1);
        if (item.length === 0) {
          return { success: false, error: `Item with ID '${itemId}' not found` };
        }
        writeTable = collectionTable;
        parentCol = (collectionTable as any).parent_id;
        sortCol = (collectionTable as any).sort;
        idCol = (collectionTable as any).id;
      }

      // Get siblings to calculate proper sort order (in the right scope).
      const siblingCondition = parentId
        ? eq(parentCol, parentId)
        : or(sql`${parentCol} IS NULL`, sql`${parentCol} = ''`, sql`${parentCol} = '[]'`);

      const conditions: any[] = [siblingCondition, ne(idCol, itemId)];
      if (extraWhere) conditions.push(extraWhere);

      const siblings = await db
        .select({ id: idCol, sort: sortCol })
        .from(writeTable)
        .where(and(...conditions))
        .orderBy(asc(sortCol));

      let sortOrder: number;
      if (newIndex === 0) {
        sortOrder = siblings.length > 0 ? Math.max(0, (siblings[0].sort ?? 0) - 1) : 0;
      } else if (newIndex >= siblings.length) {
        sortOrder = siblings.length > 0 ? (siblings[siblings.length - 1].sort ?? 0) + 1 : newIndex;
      } else {
        const prevSort = siblings[newIndex - 1]?.sort ?? 0;
        const nextSort = siblings[newIndex]?.sort ?? prevSort + 2;
        sortOrder = prevSort + (nextSort - prevSort) / 2;
      }

      const whereConditions: any[] = [eq(idCol, itemId)];
      if (extraWhere) whereConditions.push(extraWhere);

      await db
        .update(writeTable)
        .set({
          parent_id: parentId,
          sort: sortOrder,
          updated_at: new Date()
        })
        .where(and(...whereConditions));

      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to update nesting'
      };
    }
  }
);

/**
 * Update tags for a collection item
 */
export const updateCollectionItemTags = command(
  'unchecked',
  async ({
    collectionSlug,
    itemId,
    tags,
    locale
  }: {
    collectionSlug: string;
    itemId: string;
    tags: string[];
    /** For localized collections — defaults to `content.i18n.default`. */
    locale?: string;
  }) => {
    if (!collectionSlug || !itemId || !Array.isArray(tags)) {
      return { success: false, error: 'Collection slug, item ID, and tags are required' };
    }

    try {
      const scope = await resolveLocaleScope(collectionSlug, itemId, locale);
      await TagService.tagEntity(scope.taggableType, scope.entityId, tags);

      return { success: true, message: 'Tags updated successfully' };
    } catch (error) {
      log.error('Failed to update item tags', {}, error as Error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update item tags'
      };
    }
  }
);

/**
 * Restore a soft-deleted collection item. Re-instates the row at root with
 * neutral position (clears parent_id, appends to end) — leaves it to the user
 * to re-organize within the tree.
 */
export const restoreCollectionItem = command(
  'unchecked',
  async ({ collectionSlug, itemId }: { collectionSlug: string; itemId: string }) => {
    const { locals } = getRequestEvent();

    if (!collectionSlug || !itemId) {
      return { success: false, error: 'Collection slug and item ID are required' };
    }

    const canUpdate = await locals.security.hasPermission('update', 'content');
    if (!canUpdate) {
      return { success: false, error: 'You do not have permission to restore content' };
    }

    try {
      const collectionTable = schema[`collection_${collectionSlug}` as keyof typeof schema];
      if (!collectionTable) {
        return { success: false, error: `Collection '${collectionSlug}' not found` };
      }

      const isLocalized =
        (fieldConfigurations as any).collections?.[collectionSlug]?.localized === true;

      if (isLocalized) {
        // For localized collections, sort + parent_id live on `_locales` and
        // don't need restoration (the locale rows weren't deleted in the first
        // place — delete is item-level on main). Just clear deleted_at/by.
        await db
          .update(collectionTable)
          .set({
            deleted_at: null,
            deleted_by: null
          } as any)
          .where(eq((collectionTable as any).id, itemId));
      } else {
        const [maxRow] = await db
          .select({ max: sql<number>`coalesce(max(${(collectionTable as any).sort}), 0)` })
          .from(collectionTable);
        const nextSort = (maxRow?.max ?? 0) + 1;

        await db
          .update(collectionTable)
          .set({
            deleted_at: null,
            deleted_by: null,
            parent_id: null,
            sort: nextSort,
            updated_at: new Date()
          } as any)
          .where(eq((collectionTable as any).id, itemId));
      }

      await SearchIndexService.onSaveSafe('collection', collectionSlug, itemId);

      return { success: true, message: 'Item restored' };
    } catch (error) {
      log.error('Failed to restore item', {}, error as Error);
      return { success: false, error: 'Failed to restore item' };
    }
  }
);
