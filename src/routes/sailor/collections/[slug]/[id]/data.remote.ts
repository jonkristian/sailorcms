// SvelteKit remote functions for individual collection items
import { command, getRequestEvent } from '$app/server';
import { db } from '$sailor/core/db/index.server';
import { log } from '$sailor/core/utils/logger';
import { eq, sql } from 'drizzle-orm';
import * as schema from '$sailor/generated/schema';
import { generateUUID } from '$lib/sailor/core/utils/common';
import { TagService } from '$sailor/core/services/tag.server';
import { toSnakeCase } from '$sailor/core/utils/string';

/**
 * Save collection item (create or update)
 */
export const saveCollectionItem = command(
  'unchecked',
  async ({
    collectionSlug,
    itemId,
    formData
  }: {
    collectionSlug: string;
    itemId: string;
    formData: Record<string, any>;
  }) => {
    const { locals } = getRequestEvent();

    if (!collectionSlug || !itemId || !formData) {
      return { success: false, error: 'Collection slug, item ID, and form data are required' };
    }

    try {
      // Import server-side functions
      const { saveNestedArrayFields } = await import('$sailor/core/content/blocks.server');
      const { sanitizeId } = await import('$lib/sailor/core/utils/common');

      // Get collection type and schema
      const collectionType = await db.query.collectionTypes.findFirst({
        where: (collectionTypes: any, { eq }: any) => eq(collectionTypes.slug, collectionSlug)
      });

      if (!collectionType) {
        return { success: false, error: 'Collection not found' };
      }

      const collectionSchema = JSON.parse(collectionType.schema);
      const collectionOptions = collectionType.options ? JSON.parse(collectionType.options) : {};
      let collectionFields = collectionSchema.properties || collectionSchema;

      // Add SEO fields if SEO is enabled
      if (collectionOptions.seo) {
        const { SEO_FIELDS } = await import('$sailor/core/types');
        collectionFields = {
          ...collectionFields,
          ...SEO_FIELDS
        };
      }

      // Get all block types for block processing
      const allBlockTypes = await db.query.blockTypes.findMany();
      const availableBlocks: Record<string, any> = {};
      for (const blockType of allBlockTypes) {
        availableBlocks[blockType.slug] = {
          name: blockType.name,
          slug: blockType.slug,
          description: blockType.description,
          fields: JSON.parse(blockType.schema)
        };
      }

      // Separate fields by type
      const regularFields: Record<string, any> = {};
      const arrayFields: Record<string, any[]> = {};
      const relationFields: Record<string, any[]> = {};
      const tagFields: Record<string, any[]> = {};
      const fileFields: Record<string, any> = {};

      Object.entries(formData).forEach(([key, value]) => {
        // Skip blocks - they're handled separately
        if (key === 'blocks') return;

        const fieldDef = collectionFields[key];

        if (fieldDef?.type === 'array') {
          arrayFields[key] = value as any[];
        } else if (fieldDef?.type === 'file') {
          // All file fields use relation tables (allows changing multiple flag without migration)
          fileFields[key] = value;
        } else if (fieldDef?.type === 'relation') {
          // Distinguish between single FK on main table vs many-to-many via junction
          const relType = fieldDef?.relation?.type;
          if (relType === 'one-to-one' || relType === 'one-to-many') {
            // Store foreign key on main table column (normalize to scalar id)
            let v: any = value;
            try {
              v = typeof v === 'string' && v.startsWith('{') ? JSON.parse(v) : v;
            } catch {}
            if (Array.isArray(v) && v.length > 0) v = v[0]?.id || v[0] || null;
            else if (typeof v === 'object' && v !== null) v = v.id || null;
            regularFields[key] = v ?? null;
          } else {
            // Many-to-many relations may come as JSON string of ids/objects
            try {
              const raw = typeof value === 'string' ? JSON.parse(value) : value;
              relationFields[key] = Array.isArray(raw) ? raw : [];
            } catch {
              relationFields[key] = Array.isArray(value) ? value : [];
            }
          }
        } else if (fieldDef?.type === 'tags') {
          // Tags may come as array of objects, array of strings, or JSON string
          try {
            const raw = typeof value === 'string' ? JSON.parse(value) : value;
            const arr = Array.isArray(raw) ? raw : [];
            tagFields[key] = arr;
          } catch {
            tagFields[key] = Array.isArray(value) ? value : [];
          }
        } else if (fieldDef?.type === 'boolean') {
          // Special handling for noindex field - store as string since DB column is TEXT
          if (key === 'noindex') {
            // Handle various boolean representations
            const boolValue =
              value === true || value === 'true' || value === '1' || value === 1 || value === '1.0';
            regularFields[key] = boolValue ? 'true' : 'false';
          } else {
            regularFields[key] = Boolean(value);
          }
        } else {
          // Apply normalization for core relation field parent_id
          if (key === 'parent_id') {
            let v: any = value;
            if (Array.isArray(v) && v.length > 0) v = v[0]?.id || v[0] || null;
            else if (typeof v === 'object' && v !== null) v = v.id || null;
            regularFields[key] = sanitizeId(v);
          } else {
            regularFields[key] = value;
          }
        }
      });

      // Normalize author if provided; fallback handled during create
      if (regularFields.author !== undefined) {
        let a: any = regularFields.author;
        if (Array.isArray(a) && a.length > 0) a = a[0]?.id || a[0] || null;
        else if (typeof a === 'object' && a !== null) a = a.id || null;
        regularFields.author = a;
      }

      // TODO: Add validation logic that doesn't prevent saving valid blocks

      const result = await db.transaction(async (tx: any) => {
        // Get the collection table for the transaction
        const collectionTable = schema[`collection_${collectionSlug}` as keyof typeof schema];
        if (!collectionTable) {
          throw new Error(`Collection table for '${collectionSlug}' not found`);
        }

        // Check if item exists and user has access to it
        const existing = await tx
          .select({
            id: (collectionTable as any).id,
            status: (collectionTable as any).status,
            author: (collectionTable as any).author
          })
          .from(collectionTable)
          .where(eq((collectionTable as any).id, itemId))
          .limit(1);

        if (existing.length > 0) {
          // Check if user can update this item
          const canUpdate = await locals.security.hasPermission('update', 'content');

          if (!canUpdate) {
            throw new Error('You do not have permission to update this content');
          }

          // Update existing item using core-first + sanitized payload spread
          const schemaKeys = Object.keys(collectionFields);
          const payloadMainRaw = Object.fromEntries(
            Object.entries(regularFields).filter(
              ([key]) =>
                schemaKeys.includes(key) &&
                !['id', 'created_at', 'updated_at', 'last_modified_by', 'sort'].includes(key)
            )
          );

          const payloadMain: Record<string, any> = {};
          for (const [k, v] of Object.entries(payloadMainRaw)) {
            if (k === 'parent_id') {
              let vv: any = v;
              if (Array.isArray(vv) && vv.length > 0) vv = vv[0]?.id || vv[0] || null;
              else if (typeof vv === 'object' && vv !== null) vv = (vv as any).id || null;
              payloadMain[k] = vv;
            } else {
              payloadMain[k] = v;
            }
          }

          const updateData: Record<string, any> = {
            ...payloadMain,
            updated_at: new Date(),
            last_modified_by: locals.user?.id || null
          };

          // Allow author update if provided
          if (regularFields.author !== undefined) updateData.author = regularFields.author;

          await (tx as any)
            .update(collectionTable)
            .set(updateData)
            .where(eq((collectionTable as any).id, itemId));
        } else {
          // Create new item
          const canCreate = await locals.security.hasPermission('create', 'content');

          if (!canCreate) {
            throw new Error('You do not have permission to create content');
          }

          // Build base core fields
          const now = new Date();
          let author = regularFields.author;
          if (!author && locals.user?.id) author = locals.user.id;

          const schemaKeys = Object.keys(collectionFields);
          const payloadMainRaw = Object.fromEntries(
            Object.entries(regularFields).filter(
              ([key]) =>
                schemaKeys.includes(key) &&
                !['id', 'created_at', 'updated_at', 'last_modified_by', 'sort', 'author'].includes(
                  key
                )
            )
          );

          const payloadMain: Record<string, any> = {};
          for (const [k, v] of Object.entries(payloadMainRaw)) {
            if (k === 'parent_id') {
              let vv: any = v;
              if (Array.isArray(vv) && vv.length > 0) vv = vv[0]?.id || vv[0] || null;
              else if (typeof vv === 'object' && vv !== null) vv = (vv as any).id || null;
              payloadMain[k] = vv;
            } else {
              payloadMain[k] = v;
            }
          }

          const createData: Record<string, any> = {
            id: itemId,
            author: author || null,
            last_modified_by: locals.user?.id || null,
            created_at: now,
            updated_at: now,
            ...payloadMain
          };

          await (tx as any).insert(collectionTable).values(createData);
        }

        // Handle array fields if any
        if (Object.keys(arrayFields).length > 0) {
          // Clear existing array data for this item
          for (const arrayFieldName of Object.keys(arrayFields)) {
            const fieldDef = collectionFields[arrayFieldName];
            if (fieldDef?.type === 'array' && fieldDef.items?.type === 'object') {
              const relationTableName = `collection_${collectionSlug}_${arrayFieldName}`;
              const relationTable = schema[relationTableName as keyof typeof schema];
              if (relationTable) {
                await tx.run(sql`
                  DELETE FROM ${sql.identifier(relationTableName)}
                  WHERE collection_id = ${itemId}
                `);
              }
            }
          }

          // Save new array data
          for (const [arrayFieldName, arrayItems] of Object.entries(arrayFields)) {
            const fieldDef = collectionFields[arrayFieldName];
            if (fieldDef?.type === 'array' && fieldDef.items?.type === 'object') {
              const relationTableName = `collection_${collectionSlug}_${arrayFieldName}`;

              for (let index = 0; index < arrayItems.length; index++) {
                const item = arrayItems[index];

                // Build columns/values explicitly to avoid inserting unknown keys
                const columns = ['id', 'collection_id', 'sort', 'created_at', 'updated_at'];
                const values = [item.id || generateUUID(), itemId, index, new Date(), new Date()];

                // Add schema-defined properties from array item
                Object.keys(fieldDef.items.properties).forEach((propKey) => {
                  columns.push(propKey);
                  values.push((item as any)[propKey] ?? null);
                });

                // Optionally include parent_id when array is nestable and defined in schema
                if (
                  fieldDef.nestable &&
                  fieldDef.items?.properties?.parent_id !== undefined &&
                  (item as any).parent_id !== undefined
                ) {
                  columns.push('parent_id');
                  values.push((item as any).parent_id);
                }

                const relationTable = schema[relationTableName as keyof typeof schema];
                if (relationTable) {
                  await tx.run(sql`
                    INSERT OR REPLACE INTO ${sql.identifier(relationTableName)}
                    (${sql.join(
                      columns.map((c) => sql.identifier(c)),
                      sql`, `
                    )})
                    VALUES (${sql.join(
                      values.map((v) => sql`${v}`),
                      sql`, `
                    )})`);
                }
              }
            }
          }
        }

        // Handle file fields (relation tables - same pattern as blocks)
        if (Object.keys(fileFields).length > 0) {
          for (const [fieldName, fieldValue] of Object.entries(fileFields)) {
            const fileTableName = `collection_${collectionSlug}_${fieldName}`;
            const fileTable = schema[fileTableName as keyof typeof schema];
            if (!fileTable) continue;

            // Clear existing file relations for this collection item/field
            await tx.run(sql`
              DELETE FROM ${sql.identifier(fileTableName)}
              WHERE parent_id = ${itemId} AND parent_type = 'collection'
            `);

            if (!fieldValue) continue;

            // Handle both single and multiple files (wrap single in array like blocks do)
            const rawValues: any[] = Array.isArray(fieldValue) ? fieldValue : [fieldValue];
            const fileIds: (string | null)[] = rawValues.map((val) => {
              if (val && typeof val === 'object') {
                return (val as any).id ?? null;
              }
              return (val as any) ?? null;
            });

            // Insert new file relations
            for (let i = 0; i < fileIds.length; i++) {
              const fileId = fileIds[i];
              if (!fileId) continue;
              await tx.run(sql`
                INSERT INTO ${sql.identifier(fileTableName)}
                (${sql.join(
                  [
                    sql.identifier('id'),
                    sql.identifier('parent_id'),
                    sql.identifier('parent_type'),
                    sql.identifier('file_id'),
                    sql.identifier('sort'),
                    sql.identifier('created_at')
                  ],
                  sql`, `
                )})
                VALUES (${generateUUID()}, ${itemId}, 'collection', ${fileId}, ${i}, ${new Date()})
              `);
            }
          }
        }

        // Handle relation fields for collection (junction tables)
        if (Object.keys(relationFields).length > 0) {
          for (const [fieldName, relationItems] of Object.entries(relationFields)) {
            const fieldDef = collectionFields[fieldName];
            if (fieldDef?.type !== 'relation') continue;

            // Try multiple naming patterns for junction tables
            let junctionTableName =
              fieldDef.relation?.through || `junction_${collectionSlug}_${toSnakeCase(fieldName)}`;
            let junctionTable = schema[junctionTableName as keyof typeof schema];

            // If the standard naming doesn't work, try alternative naming patterns
            if (!junctionTable && !fieldDef.relation?.through) {
              // Try with just the field name (singular)
              junctionTableName = `junction_${collectionSlug}_${fieldName}`;
              junctionTable = schema[junctionTableName as keyof typeof schema];
            }

            if (!junctionTable) continue;

            // Clear existing relations
            await tx.run(sql`
              DELETE FROM ${sql.identifier(junctionTableName)}
              WHERE collection_id = ${itemId}
            `);

            // Insert new relations
            for (const item of relationItems as any[]) {
              const targetId =
                typeof item === 'string' ? item : item && item.id ? item.id : undefined;
              if (!targetId) continue;

              await tx.run(sql`
                INSERT INTO ${sql.identifier(junctionTableName)}
                (${sql.join(
                  [
                    sql.identifier('id'),
                    sql.identifier('collection_id'),
                    sql.identifier('target_id'),
                    sql.identifier('created_at'),
                    sql.identifier('updated_at')
                  ],
                  sql`, `
                )})
                VALUES (${generateUUID()}, ${itemId}, ${targetId}, ${new Date()}, ${new Date()})
              `);
            }
          }
        }

        // Handle blocks if any
        if (formData.blocks && Array.isArray(formData.blocks)) {
          // Clear existing blocks for this collection item
          for (const blockTypeSlug of Object.keys(availableBlocks)) {
            const blockTable = schema[`block_${blockTypeSlug}` as keyof typeof schema];
            if (blockTable) {
              // First clear file relation tables (all file fields use relation tables)
              const fileFields = Object.entries(
                availableBlocks[blockTypeSlug]?.fields || {}
              ).filter(([, fieldDef]: [string, any]) => (fieldDef as any)?.type === 'file');

              for (const [fieldName] of fileFields) {
                const fileTableName = `block_${blockTypeSlug}_${fieldName}`;
                const fileTable = schema[fileTableName as keyof typeof schema];
                if (fileTable) {
                  await tx.run(sql`
                    DELETE FROM ${sql.identifier(fileTableName)}
                    WHERE parent_type = 'block' AND parent_id IN (
                      SELECT id FROM ${sql.identifier(`block_${blockTypeSlug}`)}
                      WHERE collection_id = ${itemId}
                    )
                  `);
                }
              }

              await tx.run(sql`
                DELETE FROM ${sql.identifier(`block_${blockTypeSlug}`)}
                WHERE collection_id = ${itemId}
              `);
            }
          }

          // Save new blocks
          for (const block of formData.blocks) {
            const blockType = availableBlocks[block.blockType];
            if (!blockType) continue;

            // Only include fields that map to actual columns on the block table
            // Exclude 'array', 'file', and 'many-to-many relation' fields (all stored in separate tables)
            const allowedContentEntries = Object.entries(block.content || {}).filter(([key]) => {
              const fieldDef = blockType.fields?.[key];
              if (!fieldDef) return false;
              if (fieldDef.type === 'array') return false;
              if (fieldDef.type === 'file') return false; // All file fields use relation tables
              if (fieldDef.type === 'relation' && fieldDef.relation?.type === 'many-to-many')
                return false;
              return true;
            });
            const filteredContent = Object.fromEntries(allowedContentEntries);

            // Validation is now done before transaction starts

            const blockData = {
              id: block.id || generateUUID(),
              collection_id: itemId,
              sort: block.sort || 0,
              ...filteredContent,
              created_at: new Date(),
              updated_at: new Date()
            };

            const blockTable = schema[`block_${block.blockType}` as keyof typeof schema];
            if (blockTable) {
              await tx.run(sql`
                INSERT OR REPLACE INTO ${sql.identifier(`block_${block.blockType}`)}
                (${sql.join(
                  Object.keys(blockData).map((key) => sql.identifier(key)),
                  sql`, `
                )})
                VALUES (${sql.join(
                  Object.values(blockData).map((val) => sql`${val}`),
                  sql`, `
                )})`);

              // Handle nested array fields in blocks
              const blockArrayFields: Record<string, any[]> = {};
              Object.entries(block.content).forEach(([key, value]) => {
                const fieldDef = blockType.fields[key];
                if (fieldDef?.type === 'array') {
                  blockArrayFields[key] = value as any[];
                }
              });

              if (Object.keys(blockArrayFields).length > 0) {
                await saveNestedArrayFields(
                  tx,
                  { id: blockData.id, blockType: block.blockType },
                  blockType.fields,
                  blockArrayFields
                );
              }

              // Handle many-to-many relation fields for this block
              const relationFields = Object.entries(blockType.fields || {}).filter(
                ([, fieldDef]: [string, any]) =>
                  fieldDef?.type === 'relation' && fieldDef?.relation?.type === 'many-to-many'
              );

              for (const [fieldName] of relationFields as [string, any][]) {
                // Try multiple naming patterns for junction tables
                let junctionTableName = `junction_${block.blockType}_${toSnakeCase(fieldName)}`;
                let junctionTable = schema[junctionTableName as keyof typeof schema];

                // If the standard naming doesn't work, try alternative naming patterns
                if (!junctionTable) {
                  // Try with just the field name (singular)
                  junctionTableName = `junction_${block.blockType}_${fieldName}`;
                  junctionTable = schema[junctionTableName as keyof typeof schema];
                }

                if (!junctionTable) continue;

                // Clear existing relation entries for this block/field
                await tx.run(sql`
                  DELETE FROM ${sql.identifier(junctionTableName)}
                  WHERE block_id = ${blockData.id}
                `);

                const fieldValue = (block.content || {})[fieldName];
                if (!fieldValue || !Array.isArray(fieldValue)) continue;

                // Insert new junction table entries
                for (const relatedId of fieldValue) {
                  const targetId = typeof relatedId === 'object' ? relatedId.id : relatedId;
                  if (!targetId) continue;

                  await tx.run(sql`
                    INSERT INTO ${sql.identifier(junctionTableName)}
                    (id, block_id, target_id, created_at, updated_at)
                    VALUES (${generateUUID()}, ${blockData.id}, ${targetId}, ${new Date()}, ${new Date()})
                  `);
                }
              }

              // Handle all file fields for this block (all use relation tables)
              const fileFields = Object.entries(blockType.fields || {}).filter(
                ([, fieldDef]: [string, any]) => fieldDef?.type === 'file'
              );

              for (const [fieldName] of fileFields as [string, any][]) {
                const fileTableName = `block_${block.blockType}_${fieldName}`;
                const fileTable = schema[fileTableName as keyof typeof schema];
                if (!fileTable) continue;

                // Clear existing file relations for this block/field
                await tx.run(sql`
                  DELETE FROM ${sql.identifier(fileTableName)}
                  WHERE parent_id = ${blockData.id} AND parent_type = 'block'
                `);

                const fieldValue = (block.content || {})[fieldName];
                if (!fieldValue) continue;

                // Handle both single and multiple - wrap single in array
                const rawValues: any[] = Array.isArray(fieldValue) ? fieldValue : [fieldValue];
                const fileIds: (string | null)[] = rawValues.map((val) => {
                  if (val && typeof val === 'object') {
                    return (val as any).id ?? null;
                  }
                  return (val as any) ?? null;
                });

                for (let i = 0; i < fileIds.length; i++) {
                  const fileId = fileIds[i];
                  if (!fileId) continue;
                  await tx.run(sql`
                    INSERT INTO ${sql.identifier(fileTableName)}
                    (${sql.join(
                      [
                        sql.identifier('id'),
                        sql.identifier('parent_id'),
                        sql.identifier('parent_type'),
                        sql.identifier('file_id'),
                        sql.identifier('sort'),
                        sql.identifier('created_at')
                      ],
                      sql`, `
                    )})
                    VALUES (${generateUUID()}, ${blockData.id}, 'block', ${fileId}, ${i}, ${new Date()})
                  `);
                }
              }
            }
          }
        }

        return { itemId };
      });

      // Perform tag updates AFTER transaction to avoid write locks and cross-connection issues
      if (Object.keys(tagFields).length > 0) {
        const taggableType = `collection_${collectionSlug}`;
        for (const [, tags] of Object.entries(tagFields)) {
          const tagNames = Array.isArray(tags)
            ? ((tags as any[])
                .map((t: any) =>
                  typeof t === 'object' && t !== null
                    ? t.name || t.value || undefined
                    : typeof t === 'string'
                      ? t
                      : undefined
                )
                .filter(Boolean) as string[])
            : [];
          await TagService.tagEntity(taggableType, itemId, tagNames);
        }
      }

      return { success: true, message: 'Item saved successfully', itemId: result.itemId };
    } catch (error) {
      log.error('Failed to save collection item', {}, error as Error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save item'
      };
    }
  }
);
