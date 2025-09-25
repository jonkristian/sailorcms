// SvelteKit remote functions for global management
import { command, getRequestEvent } from '$app/server';
import { TagService } from '$sailor/core/services/tag.server';
import { db } from '$sailor/core/db/index.server';
import { eq, sql } from 'drizzle-orm';
import * as schema from '$sailor/generated/schema';
import { createACL, getPermissionErrorMessage } from '$sailor/core/rbac/acl';
import { getCurrentTimestamp } from '$sailor/core/utils/date';
import { generateUUID, normalizeRelationId } from '$sailor/core/utils/common';
import { toSnakeCase } from '$sailor/core/utils/string';
import { log } from '$sailor/core/utils/logger';

/**
 * Update tags for a global item
 */
export const updateGlobalItemTags = command(
  'unchecked',
  async ({ globalSlug, itemId, tags }: { globalSlug: string; itemId: string; tags: string[] }) => {
    const { locals } = getRequestEvent();

    // Authentication handled by hooks

    if (!globalSlug || !itemId || !Array.isArray(tags)) {
      return { success: false, error: 'Global slug, item ID, and tags are required' };
    }

    try {
      // Use specific global entity type for better organization
      await TagService.tagEntity(`global_${globalSlug}`, itemId, tags);

      return { success: true, message: 'Tags updated successfully' };
    } catch (error) {
      log.error('Failed to update global item tags', {}, error as Error);
      return { success: false, error: 'Failed to update global item tags' };
    }
  }
);

/**
 * Add tags to a global item
 */
export const addGlobalItemTags = command(
  'unchecked',
  async ({ globalSlug, itemId, tags }: { globalSlug: string; itemId: string; tags: string[] }) => {
    const { locals } = getRequestEvent();

    // Authentication handled by hooks

    if (!globalSlug || !itemId || !Array.isArray(tags) || tags.length === 0) {
      return { success: false, error: 'Global slug, item ID, and tags are required' };
    }

    try {
      // Get current tags and add new ones (without removing existing)
      const currentTags = await TagService.getTagsForEntity('global', itemId);
      const currentTagNames = currentTags.map((tag) => tag.name);
      const allTagNames = [...new Set([...currentTagNames, ...tags])]; // Deduplicate

      await TagService.tagEntity('global', itemId, allTagNames);

      return { success: true, message: `${tags.length} tag(s) added successfully` };
    } catch (error) {
      log.error('Failed to add tags to global item', {}, error as Error);
      return { success: false, error: 'Failed to add tags to global item' };
    }
  }
);

/**
 * Remove tags from a global item
 */
export const removeGlobalItemTags = command(
  'unchecked',
  async ({ globalSlug, itemId, tags }: { globalSlug: string; itemId: string; tags: string[] }) => {
    const { locals } = getRequestEvent();

    // Authentication handled by hooks

    if (!globalSlug || !itemId || !Array.isArray(tags) || tags.length === 0) {
      return { success: false, error: 'Global slug, item ID, and tags are required' };
    }

    try {
      // Get current tags and remove specified ones
      const currentTags = await TagService.getTagsForEntity('global', itemId);
      const currentTagNames = currentTags.map((tag) => tag.name);
      const remainingTagNames = currentTagNames.filter((tagName) => !tags.includes(tagName));

      await TagService.tagEntity('global', itemId, remainingTagNames);

      return { success: true, message: `${tags.length} tag(s) removed successfully` };
    } catch (error) {
      log.error('Failed to remove tags from global item', {}, error as Error);
      return { success: false, error: 'Failed to remove tags from global item' };
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
      const acl = createACL(locals.user);
      const canDelete = await acl.can('delete', 'global', item[0]);

      if (!canDelete) {
        return {
          success: false,
          error: getPermissionErrorMessage(locals.user, 'delete', 'global', item[0])
        };
      }

      // Delete the item
      await db.delete(globalTable).where(eq((globalTable as any).id, itemId));

      return { success: true };
    } catch (error) {
      log.error('Error deleting global item', {}, error as Error);
      return { success: false, error: 'Failed to delete item' };
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
    items
  }: {
    globalSlug: string;
    items: Array<{ id: string; parent_id?: string | null }>;
  }) => {
    const { locals } = getRequestEvent();

    if (!locals.user?.id) {
      return { success: false, error: 'Unauthorized' };
    }

    if (!globalSlug || !Array.isArray(items) || items.length === 0) {
      return { success: false, error: 'Global slug and items array are required' };
    }

    // Check if user can update globals
    const acl = createACL(locals.user);
    const canUpdate = await acl.can('update', 'global');

    if (!canUpdate) {
      return {
        success: false,
        error: getPermissionErrorMessage(locals.user, 'update', 'global')
      };
    }

    try {
      await db.transaction(async (tx: any) => {
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          await tx.run(
            sql`UPDATE ${sql.identifier(`global_${globalSlug}`)}
                SET sort = ${i}, parent_id = ${item.parent_id || null}, updated_at = ${getCurrentTimestamp()}
                WHERE id = ${item.id}`
          );
        }
      });

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

    if (!locals.user?.id) {
      return { success: false, error: 'Unauthorized' };
    }

    if (!globalSlug || !data) {
      return { success: false, error: 'Global slug and data are required' };
    }

    // Check if user can update globals
    const acl = createACL(locals.user);
    const canUpdate = await acl.can('update', 'global');

    if (!canUpdate) {
      return {
        success: false,
        error: getPermissionErrorMessage(locals.user, 'update', 'global')
      };
    }

    try {
      // Get global definition from database
      const globalTypeRow = await db.query.globalTypes.findFirst({
        where: eq(schema.globalTypes.slug, globalSlug)
      });

      if (!globalTypeRow || globalTypeRow.data_type !== 'flat') {
        return { success: false, error: 'Invalid global type' };
      }

      const globalFields = JSON.parse(globalTypeRow.schema);

      // Separate array fields from regular fields
      const arrayFields: Record<string, any[]> = {};
      const regularFields: Record<string, any> = {};

      Object.entries(data).forEach(([key, value]) => {
        const fieldDef = globalFields[key];
        if (fieldDef?.type === 'array') {
          arrayFields[key] = Array.isArray(value) ? value : [value];
        } else if (key !== 'id' && fieldDef) {
          // Only persist fields that exist in schema
          regularFields[key] = value;
        }
      });

      const itemId = globalSlug; // Use globalSlug as unique ID for flat globals
      const globalTable = schema[`global_${globalSlug}` as keyof typeof schema];
      if (!globalTable) {
        return { success: false, error: `Global table for '${globalSlug}' not found` };
      }

      await db.transaction(async (tx: any) => {
        // Check if singleton exists
        const existing = await tx
          .select()
          .from(globalTable)
          .where(eq((globalTable as any).id, itemId))
          .limit(1);

        if (existing.length > 0) {
          // Update existing singleton
          const updateFields = Object.keys(regularFields).filter(
            (key) => !['id', 'created_at', 'updated_at'].includes(key)
          );

          if (updateFields.length > 0) {
            // Build update data object for Drizzle
            const updateData: Record<string, any> = {
              updated_at: getCurrentTimestamp(),
              last_modified_by: locals.user!.id
            };

            updateFields.forEach((key) => {
              const normalized = normalizeRelationId(key, regularFields[key]);
              updateData[key] = normalized;
            });

            await tx
              .update(globalTable)
              .set(updateData)
              .where(eq((globalTable as any).id, existing[0].id));
          }
        } else {
          // Create new singleton
          const insertData: Record<string, any> = {
            id: itemId,
            author: locals.user!.id,
            last_modified_by: locals.user!.id,
            created_at: getCurrentTimestamp(),
            updated_at: getCurrentTimestamp()
          };

          // Add regular fields
          Object.keys(regularFields).forEach((key) => {
            if (['id', 'created_at', 'updated_at'].includes(key)) return;

            const normalized = normalizeRelationId(key, regularFields[key]);
            insertData[key] = normalized;
          });

          await tx.insert(globalTable).values(insertData);
        }

        // Handle array fields for flat globals
        for (const [fieldName, arrayItems] of Object.entries(arrayFields)) {
          const fieldDef = globalFields[fieldName];
          if (fieldDef?.type !== 'array' || !fieldDef?.items?.properties) {
            continue;
          }

          // Convert camelCase field name to snake_case for table name
          const snakeCaseFieldName = toSnakeCase(fieldName);
          const relationTableName = `global_${globalSlug}_${snakeCaseFieldName}`;

          // Delete existing items
          const relationTable = schema[relationTableName as keyof typeof schema];
          if (relationTable) {
            await tx.delete(relationTable).where(eq((relationTable as any).global_id, itemId));
          }

          // Insert new items
          for (let i = 0; i < arrayItems.length; i++) {
            const item = arrayItems[i];
            const columns = ['id', 'global_id', 'sort', 'created_at', 'updated_at'];
            const values = [
              generateUUID(),
              itemId,
              i,
              getCurrentTimestamp(),
              getCurrentTimestamp()
            ];

            // Add field properties
            Object.keys(fieldDef.items.properties).forEach((propKey) => {
              columns.push(propKey);
              values.push(item[propKey] || null);
            });

            await tx.run(
              sql`INSERT INTO ${sql.identifier(relationTableName)} (${sql.join(
                columns.map((c) => sql.identifier(c)),
                sql`, `
              )})
                  VALUES (${sql.join(
                    values.map((v) => sql`${v}`),
                    sql`, `
                  )})`
            );
          }
        }
      });

      return { success: true };
    } catch (error) {
      log.error('Error updating flat global', {}, error as Error);
      return {
        success: false,
        error: `Failed to update flat global: ${error instanceof Error ? error.message : String(error)}`
      };
    }
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

    if (!locals.user?.id) {
      return { success: false, error: 'Unauthorized' };
    }

    if (!globalSlug || !data) {
      return { success: false, error: 'Global slug and data are required' };
    }

    // Check if user can update globals
    const acl = createACL(locals.user);
    const canUpdate = await acl.can('update', 'global');

    if (!canUpdate) {
      return {
        success: false,
        error: getPermissionErrorMessage(locals.user, 'update', 'global')
      };
    }

    try {
      // Get global definition from database
      const globalTypeRow = await db.query.globalTypes.findFirst({
        where: eq(schema.globalTypes.slug, globalSlug)
      });

      if (!globalTypeRow || globalTypeRow.data_type !== 'repeatable') {
        return { success: false, error: 'Invalid global type' };
      }

      const globalFields = JSON.parse(globalTypeRow.schema);

      // Separate array fields, file fields, tag fields, and regular fields
      const arrayFields: Record<string, any[]> = {};
      const fileFields: Record<string, any> = {};
      const tagFields: Record<string, any[]> = {};
      const regularFields: Record<string, any> = {};

      Object.entries(data).forEach(([key, value]) => {
        const fieldDef = globalFields[key];
        if (fieldDef?.type === 'array') {
          try {
            arrayFields[key] = Array.isArray(value) ? value : [value];
          } catch (error) {
            log.warn(`Failed to parse array field ${key}`, { value, error });
            arrayFields[key] = [];
          }
        } else if (fieldDef?.type === 'file') {
          // Single file relation handled in its own relation table
          fileFields[key] = value;
        } else if (fieldDef?.type === 'tags') {
          // Parse tags data - could be array or need parsing
          let parsedTags = value;
          if (typeof value === 'string') {
            try {
              parsedTags = JSON.parse(value);
            } catch {
              log.warn(`Failed to parse tags JSON for ${key}`, { value });
              parsedTags = [];
            }
          }
          tagFields[key] = Array.isArray(parsedTags) ? parsedTags : [];
        } else if (key !== 'id' && fieldDef) {
          // Only persist fields that exist in schema
          regularFields[key] = value;
        }
      });

      // For repeatable globals, we need an item ID (from parameter or create new)
      const finalItemId = itemId || generateUUID();

      const globalTable = schema[`global_${globalSlug}` as keyof typeof schema];
      if (!globalTable) {
        return { success: false, error: `Global table for '${globalSlug}' not found` };
      }

      await db.transaction(async (tx: any) => {
        // Check if item exists
        const existing = await tx.run(
          sql`SELECT * FROM ${sql.identifier(`global_${globalSlug}`)} WHERE id = ${finalItemId} LIMIT 1`
        );

        if (existing.rows.length > 0) {
          // Update existing item
          const now = getCurrentTimestamp();
          const schemaKeys = Object.keys(globalFields);
          const payloadMainRaw = Object.fromEntries(
            Object.entries(regularFields).filter(
              ([key]) =>
                schemaKeys.includes(key) &&
                !['author', 'last_modified_by', 'created_at', 'updated_at', 'sort', 'id'].includes(
                  key
                ) &&
                globalFields[key]?.type !== 'array' &&
                globalFields[key]?.type !== 'tags' &&
                globalFields[key]?.type !== 'file'
            )
          );

          // Normalize relation-like fields (e.g., parent_id)
          const payloadMain: Record<string, any> = {};
          for (const [k, v] of Object.entries(payloadMainRaw)) {
            if (k === 'parent_id') {
              let value: any = v;
              if (Array.isArray(value) && value.length > 0) {
                value = value[0]?.id || value[0] || null;
              } else if (typeof value === 'object' && value !== null) {
                value = (value as any).id || null;
              }
              payloadMain[k] = value;
            } else {
              payloadMain[k] = v;
            }
          }

          // Allow updating author if provided; else keep existing
          let authorValue: any = regularFields.author;
          if (Array.isArray(authorValue) && authorValue.length > 0) {
            authorValue = authorValue[0].id || authorValue[0] || null;
          } else if (typeof authorValue === 'object' && authorValue !== null) {
            authorValue = authorValue.id || null;
          }

          const updateData: Record<string, any> = {
            ...payloadMain,
            updated_at: now,
            last_modified_by: locals.user!.id
          };

          if (authorValue) updateData.author = authorValue;
          if (data.sort !== undefined && data.sort !== '' && !isNaN(Number(data.sort))) {
            updateData.sort = Number(data.sort);
          }

          await (tx as any)
            .update(globalTable)
            .set(updateData)
            .where(eq((globalTable as any).id, finalItemId));
        } else {
          // Create new item with core fields
          const now = getCurrentTimestamp();
          const schemaKeys = Object.keys(globalFields);
          const payloadMainRaw = Object.fromEntries(
            Object.entries(regularFields).filter(
              ([key]) =>
                schemaKeys.includes(key) &&
                !['author', 'last_modified_by', 'created_at', 'updated_at', 'sort', 'id'].includes(
                  key
                ) &&
                globalFields[key]?.type !== 'array' &&
                globalFields[key]?.type !== 'tags' &&
                globalFields[key]?.type !== 'file'
            )
          );

          // Normalize relation-like fields (e.g., parent_id)
          const payloadMain: Record<string, any> = {};
          for (const [k, v] of Object.entries(payloadMainRaw)) {
            if (k === 'parent_id') {
              let value: any = v;
              if (Array.isArray(value) && value.length > 0) {
                value = value[0]?.id || value[0] || null;
              } else if (typeof value === 'object' && value !== null) {
                value = (value as any).id || null;
              }
              payloadMain[k] = value;
            } else {
              payloadMain[k] = v;
            }
          }

          // Resolve author if provided; otherwise default to current user
          let authorValue: any = regularFields.author;
          if (Array.isArray(authorValue) && authorValue.length > 0) {
            authorValue = authorValue[0].id || authorValue[0] || locals.user!.id;
          } else if (typeof authorValue === 'object' && authorValue !== null) {
            authorValue = authorValue.id || locals.user!.id;
          }
          if (!authorValue) authorValue = locals.user!.id;

          const insertData: Record<string, any> = {
            id: finalItemId,
            sort: 0,
            author: authorValue,
            last_modified_by: locals.user!.id,
            created_at: now,
            updated_at: now,
            ...payloadMain
          };

          await (tx as any).insert(globalTable).values(insertData);
        }

        // Handle array fields for repeatable globals
        for (const [fieldName, arrayItems] of Object.entries(arrayFields)) {
          const fieldDef = globalFields[fieldName];
          if (fieldDef?.type !== 'array' || !fieldDef?.items?.properties) continue;

          // Convert camelCase field name to snake_case for table name
          const snakeCaseFieldName = toSnakeCase(fieldName);
          const relationTableName = `global_${globalSlug}_${snakeCaseFieldName}`;

          // Delete existing items
          const relationTable = schema[relationTableName as keyof typeof schema];
          if (relationTable) {
            await tx.delete(relationTable).where(eq((relationTable as any).global_id, finalItemId));
          }

          // Insert new items
          for (let i = 0; i < arrayItems.length; i++) {
            const item = arrayItems[i];
            const columns = ['id', 'global_id', 'sort', 'created_at', 'updated_at'];
            const values = [
              generateUUID(),
              finalItemId,
              i,
              getCurrentTimestamp(),
              getCurrentTimestamp()
            ];

            // Add field properties
            Object.keys(fieldDef.items.properties).forEach((propKey) => {
              columns.push(propKey);
              values.push(item[propKey] || null);
            });

            await tx.run(
              sql`INSERT INTO ${sql.identifier(relationTableName)} (${sql.join(
                columns.map((c) => sql.identifier(c)),
                sql`, `
              )})
                  VALUES (${sql.join(
                    values.map((v) => sql`${v}`),
                    sql`, `
                  )})`
            );
          }
        }
      });

      // Handle tag fields for global item - outside transaction to avoid locks
      for (const [fieldName, tags] of Object.entries(tagFields)) {
        try {
          const tagNames = tags
            .map((tag: any) =>
              typeof tag === 'object' ? tag.name || tag.value || String(tag) : String(tag)
            )
            .filter(Boolean);

          // Use existing remote function to handle tags for this global item
          await updateGlobalItemTags({
            globalSlug: globalSlug,
            itemId: finalItemId,
            tags: tagNames
          });
        } catch (error) {
          log.error(`Failed to save tags for field ${fieldName}`, {}, error as Error);
        }
      }

      // Handle single file fields outside transaction to avoid locking main row
      for (const [fieldName, fileValue] of Object.entries(fileFields)) {
        try {
          const snake = toSnakeCase(fieldName);
          const relationTableName = `global_${globalSlug}_${snake}`;
          const relationTable = (schema as any)[relationTableName];
          if (!relationTable) continue;

          let fileId: any = fileValue;
          if (Array.isArray(fileId) && fileId.length > 0) {
            fileId = fileId[0]?.id || fileId[0] || null;
          } else if (typeof fileId === 'object' && fileId !== null) {
            fileId = (fileId as any).id || null;
          }
          // Clear existing
          await (db as any)
            .delete(relationTable)
            .where(eq((relationTable as any).parent_id, finalItemId));
          if (fileId) {
            await (db as any).insert(relationTable).values({
              id: generateUUID(),
              parent_id: finalItemId,
              file_id: fileId,
              sort: 0,
              created_at: getCurrentTimestamp()
            });
          }
        } catch (error) {
          log.error(`Failed to save file field ${fieldName}`, {}, error as Error);
        }
      }

      return { success: true, itemId: finalItemId };
    } catch (error) {
      log.error('Error updating repeatable global', {}, error as Error);
      return { success: false, error: 'Failed to update global' };
    }
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
    const acl = createACL(locals.user);
    const canUpdate = await acl.can('update', 'global');

    if (!canUpdate) {
      return {
        success: false,
        error: getPermissionErrorMessage(locals.user, 'update', 'global')
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

      // For relational globals, we need an item ID (from parameter or create new)
      const finalItemId = itemId || generateUUID();

      await db.transaction(async (tx: any) => {
        // Check if item exists
        const existing = await tx.run(
          sql`SELECT * FROM ${sql.identifier(`global_${globalSlug}`)} WHERE id = ${finalItemId} LIMIT 1`
        );

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
            updateSetters.push(sql`updated_at = ${getCurrentTimestamp()}`);
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
                VALUES (${finalItemId}, 0, ${authorValue}, ${locals.user!.id}, ${getCurrentTimestamp()}, ${getCurrentTimestamp()}${
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

          // Delete existing items
          const relationTable = schema[relationTableName as keyof typeof schema];
          if (relationTable) {
            await tx.delete(relationTable).where(eq((relationTable as any).global_id, finalItemId));
          }

          // Insert new items with full relational support
          for (let i = 0; i < arrayItems.length; i++) {
            const item = arrayItems[i];

            const columns = ['id', 'global_id', 'sort', 'created_at', 'updated_at'];
            const values = [
              item.id || generateUUID(), // Use existing ID if available
              finalItemId,
              item.sort !== undefined ? item.sort : i, // Use item's sort if available, otherwise use index
              getCurrentTimestamp(),
              getCurrentTimestamp()
            ];

            // Add field properties with full object support
            Object.keys(fieldDef.items.properties).forEach((propKey) => {
              columns.push(propKey);
              values.push(item[propKey] || null);
            });

            // Add parent_id for nestable arrays (core field)
            if (fieldDef.nestable && item.parent_id !== undefined) {
              columns.push('parent_id');
              values.push(item.parent_id);
            }

            const updateSetters = Object.keys(fieldDef.items.properties).map(
              (key) => sql`${sql.identifier(key)} = excluded.${sql.identifier(key)}`
            );
            updateSetters.push(sql`${sql.identifier('sort')} = excluded.${sql.identifier('sort')}`);
            updateSetters.push(
              sql`${sql.identifier('updated_at')} = excluded.${sql.identifier('updated_at')}`
            );

            // Add parent_id to conflict resolution for nestable arrays
            if (fieldDef.nestable) {
              updateSetters.push(
                sql`${sql.identifier('parent_id')} = excluded.${sql.identifier('parent_id')}`
              );
            }

            await tx.run(
              sql`INSERT INTO ${sql.identifier(relationTableName)} (${sql.join(
                columns.map((c) => sql.identifier(c)),
                sql`, `
              )})
                  VALUES (${sql.join(
                    values.map((v) => sql`${v}`),
                    sql`, `
                  )})
                  ON CONFLICT(id) DO UPDATE SET ${sql.join(updateSetters, sql`, `)}`
            );
          }
        }
      });

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
    items
  }: {
    globalSlug: string;
    items: Array<{ id: string; tags?: any[]; [key: string]: any }>;
  }) => {
    const { locals } = getRequestEvent();

    if (!locals.user?.id) {
      return { success: false, error: 'Unauthorized' };
    }

    if (!globalSlug || !Array.isArray(items) || items.length === 0) {
      return { success: false, error: 'Global slug and items array are required' };
    }

    // Check if user can update globals
    const acl = createACL(locals.user);
    const canUpdate = await acl.can('update', 'global');

    if (!canUpdate) {
      return {
        success: false,
        error: getPermissionErrorMessage(locals.user, 'update', 'global')
      };
    }

    try {
      // Get global definition from database
      const globalTypeRow = await db.query.globalTypes.findFirst({
        where: eq(schema.globalTypes.slug, globalSlug)
      });

      if (!globalTypeRow || globalTypeRow.data_type !== 'repeatable') {
        return { success: false, error: 'Invalid global type' };
      }

      await db.transaction(async (tx: any) => {
        for (const item of items) {
          const { id, tags, ...regularData } = item;

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
              updateSetters.push(sql`updated_at = ${getCurrentTimestamp()}`);
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
              getCurrentTimestamp(),
              getCurrentTimestamp(),
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

            // Use existing remote function to handle tags for this global item
            await updateGlobalItemTags({
              globalSlug: globalSlug,
              itemId: item.id,
              tags: tagNames
            });
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
