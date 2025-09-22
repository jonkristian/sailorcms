// SvelteKit remote functions
import { command, getRequestEvent } from '$app/server';
import { db } from '$sailor/core/db/index.server';
import { log } from '$sailor/core/utils/logger';
import { eq, and, or, sql, asc, ne } from 'drizzle-orm';
import * as schema from '$sailor/generated/schema';
import { createACL, getPermissionErrorMessage } from '$lib/sailor/core/auth/acl';
import { generateUUID } from '$lib/sailor/core/utils/common';
import { TagService } from '$sailor/core/services/tag.server';

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
          const acl = createACL(locals.user);
          const canCreate = await acl.can('create', 'collection', originalItem[0]);

          if (!canCreate) {
            const errorMessage = getPermissionErrorMessage(
              locals.user!,
              'create',
              'collection',
              originalItem[0]
            );
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
          const acl = createACL(locals.user);
          const canDelete = await acl.can('delete', 'collection', itemToDelete[0]);

          if (!canDelete) {
            const errorMessage = getPermissionErrorMessage(
              locals.user!,
              'delete',
              'collection',
              itemToDelete[0]
            );
            errorCount++;
            if (!errorMessages.includes(errorMessage)) {
              errorMessages.push(errorMessage);
            }
            continue;
          }

          // Delete the item
          await db.delete(collectionTable).where(eq((collectionTable as any).id, itemId));
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
        const message =
          successCount === 1
            ? 'Item deleted successfully'
            : `${successCount} items deleted successfully`;
        return { success: true, message, deletedCount: successCount };
      } else if (successCount > 0) {
        const message = `${successCount} items deleted, ${errorCount} failed: ${errorMessages[0]}`;
        return { success: true, message, deletedCount: successCount };
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

          const acl = createACL(locals.user);
          const canUpdate = await acl.can('update', 'collection', item[0]);
          if (!canUpdate) {
            errorCount++;
            const msg = getPermissionErrorMessage(locals.user!, 'update', 'collection', item[0]);
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
    updates
  }: {
    collectionSlug: string;
    updates: Array<{ id: string; sort: number }>;
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

      // Check permissions for each item being reordered
      const acl = createACL(locals.user);
      for (const update of updates) {
        // Get the item to check permissions
        const item = await db
          .select()
          .from(collectionTable)
          .where(eq((collectionTable as any).id, update.id))
          .limit(1);

        if (item.length === 0) {
          return { success: false, error: `Item with ID '${update.id}' not found` };
        }

        const canUpdate = await acl.can('update', 'collection', item[0]);
        if (!canUpdate) {
          return {
            success: false,
            error: getPermissionErrorMessage(locals.user!, 'update', 'collection', item[0])
          };
        }
      }

      // Update sort values for all items after permission checks pass
      for (const update of updates) {
        await db
          .update(collectionTable)
          .set({ sort: update.sort, updated_at: new Date() })
          .where(eq((collectionTable as any).id, update.id));
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: 'Failed to update sort order' };
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
    newIndex
  }: {
    collectionSlug: string;
    itemId: string;
    parentId: string | null;
    newIndex: number;
  }) => {
    const { locals } = getRequestEvent();

    if (!itemId) {
      return { success: false, error: 'Item ID is required' };
    }

    try {
      const collectionTable = schema[`collection_${collectionSlug}` as keyof typeof schema];
      if (!collectionTable) {
        return { success: false, error: `Collection '${collectionSlug}' not found` };
      }

      // Check permissions for the item being moved
      const item = await db
        .select()
        .from(collectionTable)
        .where(eq((collectionTable as any).id, itemId))
        .limit(1);

      if (item.length === 0) {
        return { success: false, error: `Item with ID '${itemId}' not found` };
      }

      const acl = createACL(locals.user);
      const canUpdate = await acl.can('update', 'collection', item[0]);
      if (!canUpdate) {
        return {
          success: false,
          error: getPermissionErrorMessage(locals.user!, 'update', 'collection', item[0])
        };
      }

      // Get existing siblings to calculate proper sort order
      const siblingCondition = parentId
        ? eq((collectionTable as any).parent_id, parentId)
        : or(
            sql`${(collectionTable as any).parent_id} IS NULL`,
            sql`${(collectionTable as any).parent_id} = ''`,
            sql`${(collectionTable as any).parent_id} = '[]'`
          );

      const siblings = await db
        .select({ id: (collectionTable as any).id, sort: (collectionTable as any).sort })
        .from(collectionTable)
        .where(
          and(
            siblingCondition,
            ne((collectionTable as any).id, itemId) // Exclude the item being moved
          )
        )
        .orderBy(asc((collectionTable as any).sort));

      // Calculate sort value based on position among siblings
      let sortOrder;
      if (newIndex === 0) {
        // Insert at beginning
        sortOrder = siblings.length > 0 ? Math.max(0, siblings[0].sort - 1) : 0;
      } else if (newIndex >= siblings.length) {
        // Insert at end
        sortOrder = siblings.length > 0 ? siblings[siblings.length - 1].sort + 1 : newIndex;
      } else {
        // Insert between existing siblings
        const prevSort = siblings[newIndex - 1]?.sort || 0;
        const nextSort = siblings[newIndex]?.sort || prevSort + 2;
        sortOrder = prevSort + (nextSort - prevSort) / 2;
      }

      // Update the item's parent_id and sort order
      await db
        .update(collectionTable)
        .set({
          parent_id: parentId,
          sort: sortOrder,
          updated_at: new Date()
        })
        .where(eq((collectionTable as any).id, itemId));

      return { success: true };
    } catch (err) {
      return { success: false, error: 'Failed to update nesting' };
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
    tags
  }: {
    collectionSlug: string;
    itemId: string;
    tags: string[];
  }) => {
    const { locals } = getRequestEvent();

    // Authentication handled by hooks

    if (!collectionSlug || !itemId || !Array.isArray(tags)) {
      return { success: false, error: 'Collection slug, item ID, and tags are required' };
    }

    try {
      // Use TagService to replace tags with collection-scoped taggable_type
      await TagService.tagEntity(`collection_${collectionSlug}`, itemId, tags);

      return { success: true, message: 'Tags updated successfully' };
    } catch (error) {
      log.error('Failed to update item tags', {}, error as Error);
      return { success: false, error: 'Failed to update item tags' };
    }
  }
);
