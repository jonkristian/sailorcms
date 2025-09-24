// SvelteKit remote functions for individual collection items
import { command, getRequestEvent } from '$app/server';
import { db } from '$sailor/core/db/index.server';
import { log } from '$sailor/core/utils/logger';
import { eq, sql } from 'drizzle-orm';
import * as schema from '$sailor/generated/schema';
import { createACL, getPermissionErrorMessage } from '$sailor/core/rbac/acl';
import { generateUUID } from '$lib/sailor/core/utils/common';
import { TagService } from '$sailor/core/services/tag.server';

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

      Object.entries(formData).forEach(([key, value]) => {
        // Skip blocks - they're handled separately
        if (key === 'blocks') return;

        const fieldDef = collectionFields[key];

        if (fieldDef?.type === 'array') {
          arrayFields[key] = value as any[];
        } else if (fieldDef?.type === 'relation') {
          // Relations may come as JSON string of objects or ids
          try {
            const raw = typeof value === 'string' ? JSON.parse(value) : value;
            relationFields[key] = Array.isArray(raw) ? raw : [];
          } catch {
            relationFields[key] = Array.isArray(value) ? value : [];
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
          // Apply sanitization for parent_id to prevent orphaned records
          if (key === 'parent_id') {
            regularFields[key] = sanitizeId(value);
          } else {
            regularFields[key] = value;
          }
        }
      });

      // Auto-populate author field for new content if not provided
      if (!regularFields.author && locals.user?.id) {
        regularFields.author = locals.user.id;
      }

      // Auto-assign author if current author is 'Unknown' or null/empty and we have a user
      if (
        locals.user?.id &&
        (!regularFields.author || regularFields.author === 'Unknown' || regularFields.author === '')
      ) {
        regularFields.author = locals.user.id;
      }

      // Always set last_modified_by to current user
      if (locals.user?.id) {
        regularFields.last_modified_by = locals.user.id;
      }

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
          const acl = createACL(locals.user);
          const canUpdate = await acl.can('update', 'collection', existing[0]);

          if (!canUpdate) {
            const errorMessage = getPermissionErrorMessage(
              locals.user!,
              'update',
              'collection',
              existing[0]
            );
            throw new Error(errorMessage);
          }

          // Update existing item
          const updateData = {
            ...regularFields,
            updated_at: new Date()
          };

          await tx
            .update(collectionTable)
            .set(updateData)
            .where(eq((collectionTable as any).id, itemId));
        } else {
          // Create new item
          const acl = createACL(locals.user);
          const canCreate = await acl.can('create', 'collection', { collection: collectionSlug });

          if (!canCreate) {
            const errorMessage = getPermissionErrorMessage(locals.user!, 'create', 'collection', {
              collection: collectionSlug
            });
            throw new Error(errorMessage);
          }

          const createData = {
            id: itemId,
            ...regularFields,
            created_at: new Date(),
            updated_at: new Date()
          };

          await tx.insert(collectionTable).values(createData);
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
                const itemData = {
                  id: item.id || generateUUID(),
                  collection_id: itemId,
                  sort: index,
                  ...item,
                  created_at: new Date(),
                  updated_at: new Date()
                };

                const relationTable = schema[relationTableName as keyof typeof schema];
                if (relationTable) {
                  await tx.run(sql`
                    INSERT OR REPLACE INTO ${sql.identifier(relationTableName)}
                    (${sql.join(
                    Object.keys(itemData).map((key) => sql.identifier(key)),
                    sql`, `
                  )})
                    VALUES (${sql.join(
                    Object.values(itemData).map((val) => sql`${val}`),
                    sql`, `
                  )})`);
                }
              }
            }
          }
        }

        // Handle relation fields for collection (junction tables)
        if (Object.keys(relationFields).length > 0) {
          for (const [fieldName, relationItems] of Object.entries(relationFields)) {
            const fieldDef = collectionFields[fieldName];
            if (fieldDef?.type !== 'relation') continue;

            const junctionTableName =
              fieldDef.relation?.through || `junction_${collectionSlug}_${fieldName}`;
            const junctionTable = schema[junctionTableName as keyof typeof schema];

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
              // First clear file relation tables for this block type
              const fileFields = Object.entries(
                availableBlocks[blockTypeSlug]?.fields || {}
              ).filter(([, fieldDef]: [string, any]) => (fieldDef as any)?.type === 'file');

              for (const [fieldName] of fileFields) {
                const fileTableName = `block_${blockTypeSlug}_${fieldName}`;
                const fileTable = schema[fileTableName as keyof typeof schema];
                if (fileTable) {
                  await tx.run(sql`
                    DELETE FROM ${sql.identifier(fileTableName)}
                    WHERE block_id IN (
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
            // Exclude 'file' fields (stored in relation tables) and 'array' fields (handled below)
            const allowedContentEntries = Object.entries(block.content || {}).filter(([key]) => {
              const fieldDef = blockType.fields?.[key];
              return fieldDef && fieldDef.type !== 'file' && fieldDef.type !== 'array';
            });
            const filteredContent = Object.fromEntries(allowedContentEntries);

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

              // Handle file fields for this block
              const fileFields = Object.entries(blockType.fields || {}).filter(
                ([, fieldDef]: [string, any]) => fieldDef?.type === 'file'
              );

              for (const [fieldName, fieldDef] of fileFields as [string, any][]) {
                const fileTableName = `block_${block.blockType}_${fieldName}`;
                const fileTable = schema[fileTableName as keyof typeof schema];
                if (!fileTable) continue;

                // Clear existing file relations for this block/field
                await tx.run(sql`
                  DELETE FROM ${sql.identifier(fileTableName)}
                  WHERE block_id = ${blockData.id}
                `);

                const fieldValue = (block.content || {})[fieldName];
                if (!fieldValue) continue;

                const fileIds: string[] = Array.isArray(fieldValue) ? fieldValue : [fieldValue];

                for (let i = 0; i < fileIds.length; i++) {
                  const fileId = fileIds[i];
                  if (!fileId) continue;
                  await tx.run(sql`
                    INSERT INTO ${sql.identifier(fileTableName)}
                    (${sql.join(
                    [
                      sql.identifier('id'),
                      sql.identifier('block_id'),
                      sql.identifier('file_id'),
                      sql.identifier('sort'),
                      sql.identifier('created_at')
                    ],
                    sql`, `
                  )})
                    VALUES (${generateUUID()}, ${blockData.id}, ${fileId}, ${i}, ${new Date()})
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
