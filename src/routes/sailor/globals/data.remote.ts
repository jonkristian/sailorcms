// SvelteKit remote functions for global management.
//
// `updateFlatGlobal` and `updateRepeatableGlobal` are thin wrappers around
// the `saveGlobalItem` persister — all save logic (categorize formData,
// transactional upsert with localized/non-localized routing, arrays, files,
// tags, search reindex) lives there. The other commands here (tags, status,
// delete, reorder, bulkUpdate, restore) remain inline.
//
// Tag and status commands accept an optional `locale` so they can target the
// right `_locales` row on localized globals — see `resolveLocaleScope` below.

import { command, getRequestEvent } from '$app/server';
import { TagService } from 'sailorcms/core/services/tag.server';
import { db } from 'sailorcms/core/db/index.server';
import { eq, sql, and } from 'drizzle-orm';
import * as schema from '$sailor/generated/schema';
import { fieldConfigurations } from '$sailor/generated/fields';
import { getCurrentTimestamp, getCurrentTimestampSeconds } from 'sailorcms/core/utils/date';
import { generateUUID, normalizeRelationId, slugify } from 'sailorcms/core/utils/common';
import { ensureUniqueSlug } from 'sailorcms/core/utils/slug';
import { toSnakeCase } from 'sailorcms/core/utils/string';
import { log } from 'sailorcms/core/utils/logger';
import { SearchIndexService } from 'sailorcms/core/services/search-index.server';
import {
  syncArrayRowFiles,
  clearArrayRowFiles
} from 'sailorcms/core/data/persisters/array-row-files.server';
import { saveGlobalItem } from 'sailorcms/core/data/persisters/global-item.server';
import { getContentSettings } from 'sailorcms/utils/data/collections';

/**
 * For the tag/status commands below — given a global slug + main row id, look
 * up the `_locales` row id for the requested locale so writes target the
 * correct scope. For non-localized globals it's a no-op that returns the
 * main row id + the legacy `global_<slug>` taggable type.
 *
 * Throws if a localized global has no translation yet for the requested
 * locale — tagging or status-flipping a translation that doesn't exist would
 * silently orphan data. The admin UI surfaces the error.
 */
async function resolveLocaleScope(
  globalSlug: string,
  mainItemId: string,
  locale?: string
): Promise<{
  isLocalized: boolean;
  taggableType: string;
  entityId: string;
  currentLocale: string | null;
}> {
  const isLocalized = (fieldConfigurations as any).globals?.[globalSlug]?.localized === true;
  if (!isLocalized) {
    return {
      isLocalized: false,
      taggableType: `global_${globalSlug}`,
      entityId: mainItemId,
      currentLocale: null
    };
  }

  const { defaultLocale } = getContentSettings();
  const currentLocale = locale || defaultLocale;
  if (!currentLocale) {
    throw new Error(
      `Localized global '${globalSlug}' needs content.i18n.default set in templates/settings.ts`
    );
  }

  const localesTable = (schema as any)[`global_${globalSlug}_locales`];
  if (!localesTable) {
    throw new Error(`Localized global '${globalSlug}' missing locales table — run db:update`);
  }
  const fkField = `${globalSlug}_id`;
  const rows = await db
    .select({ id: localesTable.id })
    .from(localesTable)
    .where(and(eq(localesTable[fkField], mainItemId), eq(localesTable.locale, currentLocale)))
    .limit(1);

  if (rows.length === 0) {
    throw new Error(
      `Global '${globalSlug}' has no translation for locale '${currentLocale}' — save the translation first.`
    );
  }

  return {
    isLocalized: true,
    taggableType: `global_${globalSlug}`,
    entityId: rows[0].id as string,
    currentLocale
  };
}

/**
 * Reorder array items with drag & drop support
 */
export const reorderArrayItems = command(
  'unchecked',
  async ({
    globalSlug,
    fieldName,
    items
  }: {
    globalSlug: string;
    fieldName: string;
    items: Array<{ id: string; parent_id?: string | null }>;
  }) => {
    const { locals } = getRequestEvent();

    if (!locals.user?.id) {
      return { success: false, error: 'Unauthorized' };
    }

    if (!globalSlug || !fieldName || !Array.isArray(items) || items.length === 0) {
      return { success: false, error: 'Global slug, field name, and items array are required' };
    }

    // Check if user can update globals
    const canUpdate = await locals.security.hasPermission('update', 'content');

    if (!canUpdate) {
      return {
        success: false,
        error: 'You do not have permission to update content'
      };
    }

    try {
      // Array tables anchor on `global_<slug>` for both modes. Row ids are
      // unique to the array table regardless of localization, so the
      // UPDATE WHERE id = ? works without knowing the parent locale.
      const snakeCaseFieldName = toSnakeCase(fieldName);
      const tableName = `global_${globalSlug}_${snakeCaseFieldName}`;

      await db.transaction(async (tx: any) => {
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          await tx.run(
            sql`UPDATE ${sql.identifier(tableName)}
                SET sort = ${i}, parent_id = ${item.parent_id || null}, updated_at = ${getCurrentTimestampSeconds()}
                WHERE id = ${item.id}`
          );
        }
      });

      return { success: true };
    } catch (error) {
      log.error('Error reordering array items', {}, error as Error);
      return { success: false, error: 'Failed to reorder array items' };
    }
  }
);

/**
 * Update tags for a global item
 */
export const updateGlobalItemTags = command(
  'unchecked',
  async ({
    globalSlug,
    itemId,
    tags,
    locale
  }: {
    globalSlug: string;
    itemId: string;
    tags: string[];
    /** For localized globals — defaults to `content.i18n.default`. */
    locale?: string;
  }) => {
    if (!globalSlug || !itemId || !Array.isArray(tags)) {
      return { success: false, error: 'Global slug, item ID, and tags are required' };
    }

    try {
      const scope = await resolveLocaleScope(globalSlug, itemId, locale);
      await TagService.tagEntity(scope.taggableType, scope.entityId, tags);
      await SearchIndexService.onSaveSafe(
        'global',
        globalSlug,
        itemId,
        scope.currentLocale ?? undefined
      );

      return { success: true, message: 'Tags updated successfully' };
    } catch (error) {
      log.error('Failed to update global item tags', {}, error as Error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update global item tags'
      };
    }
  }
);

/**
 * Add tags to a global item
 */
export const addGlobalItemTags = command(
  'unchecked',
  async ({
    globalSlug,
    itemId,
    tags,
    locale
  }: {
    globalSlug: string;
    itemId: string;
    tags: string[];
    /** For localized globals — defaults to `content.i18n.default`. */
    locale?: string;
  }) => {
    if (!globalSlug || !itemId || !Array.isArray(tags) || tags.length === 0) {
      return { success: false, error: 'Global slug, item ID, and tags are required' };
    }

    try {
      const scope = await resolveLocaleScope(globalSlug, itemId, locale);
      const currentTags = await TagService.getTagsForEntity(scope.taggableType, scope.entityId);
      const currentTagNames = currentTags.map((tag) => tag.name);
      const allTagNames = [...new Set([...currentTagNames, ...tags])]; // Deduplicate

      await TagService.tagEntity(scope.taggableType, scope.entityId, allTagNames);
      await SearchIndexService.onSaveSafe(
        'global',
        globalSlug,
        itemId,
        scope.currentLocale ?? undefined
      );

      return { success: true, message: `${tags.length} tag(s) added successfully` };
    } catch (error) {
      log.error('Failed to add tags to global item', {}, error as Error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to add tags to global item'
      };
    }
  }
);

/**
 * Remove tags from a global item
 */
export const removeGlobalItemTags = command(
  'unchecked',
  async ({
    globalSlug,
    itemId,
    tags,
    locale
  }: {
    globalSlug: string;
    itemId: string;
    tags: string[];
    /** For localized globals — defaults to `content.i18n.default`. */
    locale?: string;
  }) => {
    if (!globalSlug || !itemId || !Array.isArray(tags) || tags.length === 0) {
      return { success: false, error: 'Global slug, item ID, and tags are required' };
    }

    try {
      const scope = await resolveLocaleScope(globalSlug, itemId, locale);
      const currentTags = await TagService.getTagsForEntity(scope.taggableType, scope.entityId);
      const currentTagNames = currentTags.map((tag) => tag.name);
      const remainingTagNames = currentTagNames.filter((tagName) => !tags.includes(tagName));

      await TagService.tagEntity(scope.taggableType, scope.entityId, remainingTagNames);
      await SearchIndexService.onSaveSafe(
        'global',
        globalSlug,
        itemId,
        scope.currentLocale ?? undefined
      );

      return { success: true, message: `${tags.length} tag(s) removed successfully` };
    } catch (error) {
      log.error('Failed to remove tags from global item', {}, error as Error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to remove tags from global item'
      };
    }
  }
);

/**
 * Delete a global item
 */
export const deleteGlobalItem = command(
  'unchecked',
  async ({ globalSlug, itemId }: { globalSlug: string; itemId: string }) => {
    const { locals } = getRequestEvent();

    if (!locals.user?.id) {
      return { success: false, error: 'Unauthorized' };
    }

    if (!globalSlug || !itemId) {
      return { success: false, error: 'Global slug and item ID are required' };
    }

    try {
      const globalTable = schema[`global_${globalSlug}` as keyof typeof schema];
      if (!globalTable) {
        return { success: false, error: `Global table for '${globalSlug}' not found` };
      }

      // Get the item to check permissions
      const item = await db
        .select()
        .from(globalTable)
        .where(eq((globalTable as any).id, itemId))
        .limit(1);

      if (item.length === 0) {
        return { success: false, error: 'Item not found' };
      }

      // Check delete permissions
      const canDelete = await locals.security.hasPermission('delete', 'content');

      if (!canDelete) {
        return {
          success: false,
          error: 'Access denied: You do not have permission to delete content'
        };
      }

      // Soft-delete: keep the row, mark it. Restore via the recovery view.
      await db
        .update(globalTable)
        .set({
          deleted_at: new Date(),
          deleted_by: locals.user?.id ?? null,
          updated_at: new Date()
        } as any)
        .where(eq((globalTable as any).id, itemId));
      await SearchIndexService.onDeleteSafe('global', globalSlug, itemId);

      return { success: true };
    } catch (error) {
      log.error('Error deleting global item', {}, error as Error);
      return { success: false, error: 'Failed to delete item' };
    }
  }
);

/**
 * Update only the `status` field on a single repeatable-global row. Used by
 * the inline-list status toggle in the admin UI — surgical write so flipping a
 * row's status from the list doesn't overwrite unsaved edits on other fields
 * in the same item.
 */
export const updateGlobalItemStatus = command(
  'unchecked',
  async ({
    globalSlug,
    itemId,
    status,
    locale
  }: {
    globalSlug: string;
    itemId: string;
    status: string;
    /** For localized globals — defaults to `content.i18n.default`. Status lives on `_locales` for localized globals (per-translation publish state). */
    locale?: string;
  }) => {
    const { locals } = getRequestEvent();

    if (!locals.user?.id) {
      return { success: false, error: 'Unauthorized' };
    }

    if (!globalSlug || !itemId || !status) {
      return { success: false, error: 'Global slug, item ID and status are required' };
    }

    const canUpdate = await locals.security.hasPermission('update', 'content');
    if (!canUpdate) {
      return { success: false, error: 'You do not have permission to update content' };
    }

    const table = (schema as any)[`global_${globalSlug}`];
    if (!table) {
      return { success: false, error: `Global table for '${globalSlug}' not found` };
    }

    try {
      const isLocalized = (fieldConfigurations as any).globals?.[globalSlug]?.localized === true;

      if (isLocalized) {
        // Status is on `_locales` for localized globals — update that row's
        // status for the requested locale, leaving other locales untouched.
        const { defaultLocale } = getContentSettings();
        const currentLocale = locale || defaultLocale;
        if (!currentLocale) {
          return {
            success: false,
            error: `Localized global '${globalSlug}' needs content.i18n.default set in templates/settings.ts`
          };
        }
        const localesTable = (schema as any)[`global_${globalSlug}_locales`];
        if (!localesTable) {
          return {
            success: false,
            error: `Localized global '${globalSlug}' missing locales table — run db:update`
          };
        }
        const fkField = `${globalSlug}_id`;
        await db
          .update(localesTable)
          .set({
            status,
            updated_at: new Date(),
            last_modified_by: locals.user.id
          } as any)
          .where(and(eq(localesTable[fkField], itemId), eq(localesTable.locale, currentLocale)));
        await SearchIndexService.onSaveSafe('global', globalSlug, itemId, currentLocale);
      } else {
        await db
          .update(table)
          .set({
            status,
            updated_at: new Date(),
            last_modified_by: locals.user.id
          } as any)
          .where(eq((table as any).id, itemId));
        await SearchIndexService.onSaveSafe('global', globalSlug, itemId);
      }
      return { success: true };
    } catch (error) {
      log.error('Failed to update global item status', {}, error as Error);
      return { success: false, error: 'Failed to update status' };
    }
  }
);

/**
 * Reorder global items with drag & drop support
 */
export const reorderGlobalItems = command(
  'unchecked',
  async ({
    globalSlug,
    items,
    locale
  }: {
    globalSlug: string;
    items: Array<{ id: string; parent_id?: string | null }>;
    /** For localized globals — defaults to `content.i18n.default`. Sort + parent_id live on `_locales` (per-locale tree structure). */
    locale?: string;
  }) => {
    const { locals } = getRequestEvent();

    if (!locals.user?.id) {
      return { success: false, error: 'Unauthorized' };
    }

    if (!globalSlug || !Array.isArray(items) || items.length === 0) {
      return { success: false, error: 'Global slug and items array are required' };
    }

    const canUpdate = await locals.security.hasPermission('update', 'content');
    if (!canUpdate) {
      return { success: false, error: 'You do not have permission to update content' };
    }

    try {
      const isLocalized = (fieldConfigurations as any).globals?.[globalSlug]?.localized === true;

      if (isLocalized) {
        // For localized globals, sort + parent_id live on the `_locales` row
        // for the current locale (each translation has its own tree). The
        // `items` array carries main row ids; we update the locale row's
        // sort/parent_id keyed on (main_id, locale).
        const { defaultLocale } = getContentSettings();
        const currentLocale = locale || defaultLocale;
        if (!currentLocale) {
          return {
            success: false,
            error: `Localized global '${globalSlug}' needs content.i18n.default set in templates/settings.ts`
          };
        }
        const localesTable = (schema as any)[`global_${globalSlug}_locales`];
        if (!localesTable) {
          return {
            success: false,
            error: `Localized global '${globalSlug}' missing locales table — run db:update`
          };
        }
        const fkField = `${globalSlug}_id`;
        await db.transaction(async (tx: any) => {
          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            await tx
              .update(localesTable)
              .set({
                sort: i,
                parent_id: item.parent_id || null,
                updated_at: new Date(),
                last_modified_by: locals.user!.id
              } as any)
              .where(
                and(eq(localesTable[fkField], item.id), eq(localesTable.locale, currentLocale))
              );
          }
        });
      } else {
        await db.transaction(async (tx: any) => {
          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            await tx.run(
              sql`UPDATE ${sql.identifier(`global_${globalSlug}`)}
                  SET sort = ${i}, parent_id = ${item.parent_id || null}, updated_at = ${getCurrentTimestampSeconds()}
                  WHERE id = ${item.id}`
            );
          }
        });
      }

      return { success: true };
    } catch (error) {
      log.error('Error reordering global items', {}, error as Error);
      return { success: false, error: 'Failed to reorder items' };
    }
  }
);

/**
 * Update flat/singleton global data
 */
export const updateFlatGlobal = command(
  'unchecked',
  async ({ globalSlug, data }: { globalSlug: string; data: Record<string, any> }) => {
    const { locals } = getRequestEvent();
    const [canCreate, canUpdate] = await Promise.all([
      locals.security.hasPermission('create', 'content'),
      locals.security.hasPermission('update', 'content')
    ]);
    return await saveGlobalItem({
      globalSlug,
      data,
      user: locals.user ? { id: locals.user.id } : null,
      canCreate,
      canUpdate
    });
  }
);

/**
 * Update repeatable global data
 */
export const updateRepeatableGlobal = command(
  'unchecked',
  async ({
    globalSlug,
    itemId,
    data
  }: {
    globalSlug: string;
    itemId?: string;
    data: Record<string, any>;
  }) => {
    const { locals } = getRequestEvent();
    const [canCreate, canUpdate] = await Promise.all([
      locals.security.hasPermission('create', 'content'),
      locals.security.hasPermission('update', 'content')
    ]);
    return await saveGlobalItem({
      globalSlug,
      itemId,
      data,
      user: locals.user ? { id: locals.user.id } : null,
      canCreate,
      canUpdate
    });
  }
);

/**
 * Update relational global data
 */
export const updateRelationalGlobal = command(
  'unchecked',
  async ({
    globalSlug,
    itemId,
    data
  }: {
    globalSlug: string;
    itemId?: string;
    data: Record<string, any>;
  }) => {
    const { locals } = getRequestEvent();

    if (!locals.user?.id) {
      return { success: false, error: 'Unauthorized' };
    }

    if (!globalSlug || !data) {
      return { success: false, error: 'Global slug and data are required' };
    }

    // Check if user can update globals
    const canUpdate = await locals.security.hasPermission('update', 'content');

    if (!canUpdate) {
      return {
        success: false,
        error: 'You do not have permission to update content'
      };
    }

    try {
      // Get global definition from database
      const globalTypeRow = await db.query.globalTypes.findFirst({
        where: eq(schema.globalTypes.slug, globalSlug)
      });

      if (!globalTypeRow || globalTypeRow.data_type !== 'relational') {
        return { success: false, error: 'Invalid global type' };
      }

      const globalFields = JSON.parse(globalTypeRow.schema);

      // Separate array fields from regular fields
      const arrayFields: Record<string, any[]> = {};
      const regularFields: Record<string, any> = {};

      Object.entries(data).forEach(([key, value]) => {
        const fieldDef = globalFields[key];

        if (fieldDef?.type === 'array') {
          // Parse array data
          try {
            arrayFields[key] = Array.isArray(value)
              ? value
              : typeof value === 'string'
                ? JSON.parse(value)
                : [value];
          } catch (error) {
            log.warn(`Failed to parse array field ${key}`, { value, error });
            arrayFields[key] = [];
          }
        } else if (fieldDef) {
          // Only persist fields that exist in schema
          regularFields[key] = value;
        }
      });

      if (regularFields.slug) regularFields.slug = slugify(String(regularFields.slug));

      // For relational globals, we need an item ID (from parameter or create new)
      const finalItemId = itemId || generateUUID();

      const globalTable = schema[`global_${globalSlug}` as keyof typeof schema];

      await db.transaction(async (tx: any) => {
        // Check if item exists
        const existing = await tx.run(
          sql`SELECT * FROM ${sql.identifier(`global_${globalSlug}`)} WHERE id = ${finalItemId} LIMIT 1`
        );

        if (regularFields.slug && globalTable) {
          regularFields.slug = await ensureUniqueSlug({
            table: globalTable as any,
            slug: regularFields.slug,
            excludeId: finalItemId,
            tx
          });
        }

        if (existing.rows.length > 0) {
          // Update existing item
          const updateFields = Object.keys(regularFields).filter(
            (key) => !['id', 'created_at', 'updated_at', 'sort'].includes(key)
          );

          if (updateFields.length > 0) {
            const updateSetters = updateFields.map((key) => {
              let value = regularFields[key];

              // Handle relation fields
              if (key.endsWith('_id') && Array.isArray(value) && value.length > 0) {
                value = value[0].id || value[0] || null;
              } else if (key.endsWith('_id') && typeof value === 'object' && value !== null) {
                value = value.id || null;
              }

              return sql`${sql.identifier(key)} = ${value}`;
            });
            updateSetters.push(sql`updated_at = ${getCurrentTimestampSeconds()}`);
            updateSetters.push(sql`last_modified_by = ${locals.user!.id}`);

            await tx.run(
              sql`UPDATE ${sql.identifier(`global_${globalSlug}`)}
                  SET ${sql.join(updateSetters, sql`, `)}
                  WHERE id = ${finalItemId}`
            );
          }
        } else {
          // Create new item with core fields
          const insertFields = Object.keys(regularFields).filter(
            // Exclude system-managed fields to avoid duplicate columns in INSERT
            (key) =>
              !['id', 'created_at', 'updated_at', 'sort', 'author', 'last_modified_by'].includes(
                key
              )
          );
          const insertValues = insertFields.map((key) => {
            let value = regularFields[key];

            // Handle relation fields
            if (key.endsWith('_id') && Array.isArray(value) && value.length > 0) {
              value = value[0].id || value[0] || null;
            } else if (key.endsWith('_id') && typeof value === 'object' && value !== null) {
              value = value.id || null;
            }

            return value;
          });

          // Respect provided author if present; otherwise default to current user
          let authorValue: any = regularFields.author;
          if (Array.isArray(authorValue) && authorValue.length > 0) {
            authorValue = authorValue[0].id || authorValue[0] || locals.user!.id;
          } else if (typeof authorValue === 'object' && authorValue !== null) {
            authorValue = authorValue.id || locals.user!.id;
          }
          if (!authorValue) authorValue = locals.user!.id;

          await tx.run(
            sql`INSERT INTO ${sql.identifier(`global_${globalSlug}`)}
                (id, sort, author, last_modified_by, created_at, updated_at${
                  insertFields.length > 0
                    ? sql`, ${sql.join(
                        insertFields.map((f) => sql.identifier(f)),
                        sql`, `
                      )}`
                    : sql``
                })
                VALUES (${finalItemId}, 0, ${authorValue}, ${locals.user!.id}, ${getCurrentTimestampSeconds()}, ${getCurrentTimestampSeconds()}${
                  insertValues.length > 0
                    ? sql`, ${sql.join(
                        insertValues.map((v) => sql`${v}`),
                        sql`, `
                      )}`
                    : sql``
                })`
          );
        }

        // Handle complex array relationships for relational globals
        for (const [fieldName, arrayItems] of Object.entries(arrayFields)) {
          const fieldDef = globalFields[fieldName];
          if (fieldDef?.type !== 'array' || !fieldDef?.items?.properties) continue;

          // Convert camelCase field name to snake_case for table name
          const snakeCaseFieldName = toSnakeCase(fieldName);
          const relationTableName = `global_${globalSlug}_${snakeCaseFieldName}`;
          const relationTable = schema[relationTableName as keyof typeof schema];

          if (!relationTable) continue;

          // Get existing items from database
          const existingItems = await tx
            .select()
            .from(relationTable)
            .where(eq((relationTable as any).global_id, finalItemId));

          // Create maps for efficient lookup
          const existingItemsMap = new Map(existingItems.map((item: any) => [item.id, item]));
          const newItemsMap = new Map(arrayItems.map((item: any) => [item.id, item]));

          // Find items to delete (exist in DB but not in new array)
          const itemsToDelete = existingItems.filter((item: any) => !newItemsMap.has(item.id));

          // Delete removed items + their nested file relation rows
          for (const item of itemsToDelete) {
            await clearArrayRowFiles(
              tx,
              relationTableName,
              (item as any).id,
              fieldDef.items.properties
            );
            await tx.delete(relationTable).where(eq((relationTable as any).id, item.id));
          }

          // Update or insert items with full relational support
          for (let i = 0; i < arrayItems.length; i++) {
            const item = arrayItems[i];
            const existingItem = existingItemsMap.get(item.id);
            const arrayItemId = item.id || generateUUID();

            if (existingItem) {
              // Update existing item with new sort order and any changed data
              const updateData: Record<string, any> = {
                sort: item.sort !== undefined ? item.sort : i,
                updated_at: getCurrentTimestamp()
              };

              // Add field properties that might have changed (skip file types — handled separately)
              Object.entries(fieldDef.items.properties).forEach(([propKey, propDef]) => {
                if ((propDef as any).type === 'file') return;
                updateData[propKey] = item[propKey] || null;
              });

              // Add parent_id for nestable arrays only if defined in schema.
              // Coerce self-references to null — a row pointing at itself becomes
              // unreachable from the tree builder.
              if (fieldDef.nestable && fieldDef.items?.properties?.parent_id !== undefined) {
                updateData.parent_id =
                  item.parent_id && item.parent_id !== item.id ? item.parent_id : null;
              }

              await tx
                .update(relationTable)
                .set(updateData)
                .where(eq((relationTable as any).id, item.id));
            } else {
              // Insert new item
              const insertData: Record<string, any> = {
                id: arrayItemId,
                global_id: finalItemId,
                sort: item.sort !== undefined ? item.sort : i,
                created_at: getCurrentTimestamp(),
                updated_at: getCurrentTimestamp()
              };

              // Add field properties (skip file types — handled separately)
              Object.entries(fieldDef.items.properties).forEach(([propKey, propDef]) => {
                if ((propDef as any).type === 'file') return;
                insertData[propKey] = item[propKey] || null;
              });

              // Add parent_id for nestable arrays only if defined in schema.
              // Coerce self-references to null — a row pointing at itself becomes
              // unreachable from the tree builder.
              if (fieldDef.nestable && fieldDef.items?.properties?.parent_id !== undefined) {
                insertData.parent_id =
                  item.parent_id && item.parent_id !== insertData.id ? item.parent_id : null;
              }

              await tx.insert(relationTable).values(insertData);
            }

            await syncArrayRowFiles(
              tx,
              relationTableName,
              arrayItemId,
              fieldDef.items.properties,
              item,
              'global'
            );
          }
        }
      });

      await SearchIndexService.onSaveSafe('global', globalSlug, finalItemId);

      return { success: true, itemId: finalItemId };
    } catch (error) {
      log.error('Error updating relational global', {}, error as Error);
      return { success: false, error: 'Failed to update global' };
    }
  }
);

/**
 * Bulk update multiple global items
 */
export const bulkUpdateGlobalItems = command(
  'unchecked',
  async ({
    globalSlug,
    items,
    locale
  }: {
    globalSlug: string;
    items: Array<{ id: string; tags?: any[]; [key: string]: any }>;
    /** For localized globals — defaults to `content.i18n.default`. */
    locale?: string;
  }) => {
    const { locals } = getRequestEvent();

    if (!locals.user?.id) {
      return { success: false, error: 'Unauthorized' };
    }

    if (!globalSlug || !Array.isArray(items) || items.length === 0) {
      return { success: false, error: 'Global slug and items array are required' };
    }

    const [canCreate, canUpdate] = await Promise.all([
      locals.security.hasPermission('create', 'content'),
      locals.security.hasPermission('update', 'content')
    ]);
    if (!canUpdate) {
      return { success: false, error: 'You do not have permission to update content' };
    }

    try {
      const globalTypeRow = await db.query.globalTypes.findFirst({
        where: eq(schema.globalTypes.slug, globalSlug)
      });

      if (!globalTypeRow || globalTypeRow.data_type !== 'repeatable') {
        return { success: false, error: 'Invalid global type' };
      }

      // For localized globals, route each item through the persister so the
      // identity/content split + locale row upserts happen correctly. The
      // inline SQL below is only used for non-localized globals because that
      // path was hot-tuned and we don't want to regress its performance.
      const isLocalized = (fieldConfigurations as any).globals?.[globalSlug]?.localized === true;
      if (isLocalized) {
        let errored: string | null = null;
        for (const rawItem of items) {
          const { id: rawId, ...rest } = rawItem;
          const id = !rawId || String(rawId).startsWith('temp-') ? generateUUID() : rawId;
          const result = await saveGlobalItem({
            globalSlug,
            itemId: id,
            data: rest,
            user: { id: locals.user.id },
            canCreate,
            canUpdate,
            locale
          });
          if (!result.success && !errored) {
            errored = result.error ?? 'Failed to update item';
          }
        }
        if (errored) return { success: false, error: errored };
        return { success: true };
      }

      const globalTable = schema[`global_${globalSlug}` as keyof typeof schema];

      await db.transaction(async (tx: any) => {
        for (const item of items) {
          const { id: rawId, tags, ...regularData } = item;
          // `temp-…` ids are client-side placeholders for unsaved items —
          // promote to a real UUID before inserting.
          const id = !rawId || String(rawId).startsWith('temp-') ? generateUUID() : rawId;

          if (regularData.slug) {
            regularData.slug = slugify(String(regularData.slug));
            if (globalTable) {
              regularData.slug = await ensureUniqueSlug({
                table: globalTable as any,
                slug: regularData.slug,
                excludeId: id,
                tx
              });
            }
          }

          // Check if item exists
          const existing = await tx.run(
            sql`SELECT * FROM ${sql.identifier(`global_${globalSlug}`)} WHERE id = ${id} LIMIT 1`
          );

          if (existing.rows.length > 0) {
            // Update existing item
            const filteredData = Object.fromEntries(
              Object.entries(regularData).filter(
                ([key]) =>
                  ![
                    'name',
                    'id',
                    'sort',
                    'author',
                    'last_modified_by',
                    'created_at',
                    'updated_at'
                  ].includes(key)
              )
            );
            const updateFields = Object.keys(filteredData).filter(
              (key) => !['created_at', 'updated_at'].includes(key)
            );

            if (updateFields.length > 0) {
              const updateSetters = updateFields.map((key) => {
                return sql`${sql.identifier(key)} = ${filteredData[key]}`;
              });
              updateSetters.push(sql`updated_at = ${getCurrentTimestampSeconds()}`);
              updateSetters.push(sql`last_modified_by = ${locals.user!.id}`);

              await tx.run(
                sql`UPDATE ${sql.identifier(`global_${globalSlug}`)}
                    SET ${sql.join(updateSetters, sql`, `)}
                    WHERE id = ${id}`
              );
            }
          } else {
            // Create new item
            const filteredData = Object.fromEntries(
              Object.entries(regularData).filter(
                ([key]) =>
                  ![
                    'name',
                    'id',
                    'sort',
                    'author',
                    'last_modified_by',
                    'created_at',
                    'updated_at'
                  ].includes(key)
              )
            );
            const insertFields = [
              'id',
              'author',
              'last_modified_by',
              'created_at',
              'updated_at',
              ...Object.keys(filteredData)
            ];
            const insertValues = [
              id,
              locals.user!.id,
              locals.user!.id,
              getCurrentTimestampSeconds(),
              getCurrentTimestampSeconds(),
              ...Object.values(filteredData)
            ];

            await tx.run(
              sql`INSERT INTO ${sql.identifier(`global_${globalSlug}`)} (${sql.join(
                insertFields.map((f) => sql.identifier(f)),
                sql`, `
              )})
                  VALUES (${sql.join(
                    insertValues.map((v) => sql`${v}`),
                    sql`, `
                  )})`
            );
          }
        }
      });

      // Handle tags outside transaction to avoid locks
      for (const item of items) {
        if (item.tags && Array.isArray(item.tags)) {
          try {
            const tagNames = item.tags
              .map((tag: any) => (typeof tag === 'object' ? tag.name : String(tag)))
              .filter(Boolean);

            // Use direct service call to avoid circular dependency
            await TagService.tagEntity(`global_${globalSlug}`, item.id, tagNames);
          } catch (error) {
            log.error(`Failed to save tags for item ${item.id}`, {}, error as Error);
          }
        }
      }

      return { success: true };
    } catch (error) {
      log.error('Error bulk updating global items', {}, error as Error);
      return { success: false, error: 'Failed to update items' };
    }
  }
);

/**
 * Restore a soft-deleted global item. Re-instates at the end of the list with
 * neutral position; user re-organizes if needed.
 */
export const restoreGlobalItem = command(
  'unchecked',
  async ({ globalSlug, itemId }: { globalSlug: string; itemId: string }) => {
    const { locals } = getRequestEvent();

    if (!globalSlug || !itemId) {
      return { success: false, error: 'Global slug and item ID are required' };
    }

    const canUpdate = await locals.security.hasPermission('update', 'content');
    if (!canUpdate) {
      return { success: false, error: 'You do not have permission to restore content' };
    }

    try {
      const globalTable = schema[`global_${globalSlug}` as keyof typeof schema];
      if (!globalTable) {
        return { success: false, error: `Global '${globalSlug}' not found` };
      }

      const [maxRow] = await db
        .select({ max: sql<number>`coalesce(max(${(globalTable as any).sort}), 0)` })
        .from(globalTable);
      const nextSort = (maxRow?.max ?? 0) + 1;

      await db
        .update(globalTable)
        .set({
          deleted_at: null,
          deleted_by: null,
          parent_id: null,
          sort: nextSort,
          updated_at: new Date()
        } as any)
        .where(eq((globalTable as any).id, itemId));

      await SearchIndexService.onSaveSafe('global', globalSlug, itemId);

      return { success: true, message: 'Item restored' };
    } catch (error) {
      log.error('Failed to restore global item', {}, error as Error);
      return { success: false, error: 'Failed to restore item' };
    }
  }
);
