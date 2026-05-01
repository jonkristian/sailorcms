// SvelteKit remote functions for individual collection items
import { command, getRequestEvent } from '$app/server';
import { db } from '$sailor/core/db/index.server';
import { log } from '$sailor/core/utils/logger';
import { eq, sql } from 'drizzle-orm';
import * as schema from '$sailor/generated/schema';
import { generateUUID, slugify } from '$lib/sailor/core/utils/common';
import { ensureUniqueSlug } from '$sailor/core/utils/slug';
import { TagService } from '$sailor/core/services/tag.server';
import { SearchIndexService } from '$sailor/core/services/search-index.server';
import { RevisionsService, resolveRevisionsKeep } from '$sailor/core/services/revisions.server';
import { toSnakeCase } from '$sailor/core/utils/string';
import { getCurrentTimestampSeconds } from '$sailor/core/utils/date';

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

      // Block-scoped tag writes — collected during the tx, flushed after commit
      // so TagService doesn't run inside the write transaction.
      const pendingBlockTags: Array<{ blockType: string; blockId: string; tagNames: string[] }> =
        [];

      const collectionTable = schema[`collection_${collectionSlug}` as keyof typeof schema];
      if (!collectionTable) {
        return { success: false, error: `Collection table for '${collectionSlug}' not found` };
      }

      const result = await db.transaction(async (tx: any) => {
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

          if (payloadMain.slug) {
            payloadMain.slug = await ensureUniqueSlug({
              table: collectionTable as any,
              slug: slugify(String(payloadMain.slug)),
              excludeId: itemId,
              tx
            });
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

          if (payloadMain.slug) {
            payloadMain.slug = await ensureUniqueSlug({
              table: collectionTable as any,
              slug: slugify(String(payloadMain.slug)),
              excludeId: itemId,
              tx
            });
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
                const nowSec = getCurrentTimestampSeconds();
                const values = [item.id || generateUUID(), itemId, index, nowSec, nowSec];

                // Add schema-defined properties from array item
                Object.keys(fieldDef.items.properties).forEach((propKey) => {
                  columns.push(propKey);
                  values.push((item as any)[propKey] ?? null);
                });

                // Optionally include parent_id when array is nestable and defined in schema.
                // Coerce self-references to null — a row pointing at itself becomes
                // unreachable from the tree builder.
                if (
                  fieldDef.nestable &&
                  fieldDef.items?.properties?.parent_id !== undefined &&
                  (item as any).parent_id !== undefined
                ) {
                  const rawParentId = (item as any).parent_id;
                  const safeParentId =
                    rawParentId && rawParentId === (values[0] as any) ? null : rawParentId;
                  columns.push('parent_id');
                  values.push(safeParentId);
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
                VALUES (${generateUUID()}, ${itemId}, 'collection', ${fileId}, ${i}, ${getCurrentTimestampSeconds()})
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
                VALUES (${generateUUID()}, ${itemId}, ${targetId}, ${getCurrentTimestampSeconds()}, ${getCurrentTimestampSeconds()})
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

            // Fields auto-managed by the save code itself — never merge from content
            const SYSTEM_COLUMNS = new Set([
              'id',
              'collection_id',
              'sort',
              'created_at',
              'updated_at'
            ]);

            // Only include fields that map to actual columns on the block table.
            // Exclude 'array', 'file', 'many-to-many relation' (stored in separate
            // tables) and 'tags' (stored via the `taggables` join table — written
            // separately below via TagService).
            const blockTagFields: Record<string, any[]> = {};
            const allowedContentEntries = Object.entries(block.content || {}).filter(
              ([key, value]) => {
                if (SYSTEM_COLUMNS.has(key)) return false;
                const fieldDef = blockType.fields?.[key];
                if (!fieldDef) return false;
                if (fieldDef.type === 'array') return false;
                if (fieldDef.type === 'file') return false;
                if (fieldDef.type === 'relation' && fieldDef.relation?.type === 'many-to-many')
                  return false;
                if (fieldDef.type === 'tags') {
                  try {
                    const raw = typeof value === 'string' ? JSON.parse(value) : value;
                    blockTagFields[key] = Array.isArray(raw) ? raw : [];
                  } catch {
                    blockTagFields[key] = Array.isArray(value) ? value : [];
                  }
                  return false;
                }
                return true;
              }
            );
            const filteredContent: Record<string, any> = Object.fromEntries(allowedContentEntries);

            // Fill in defaults for required columns the user hasn't touched yet,
            // so SQLite NOT NULL constraints don't reject partially-filled blocks
            for (const [fieldName, fieldDef] of Object.entries(blockType.fields || {})) {
              const f = fieldDef as any;
              if (SYSTEM_COLUMNS.has(fieldName)) continue;
              if (filteredContent[fieldName] !== undefined) continue;
              if (!f?.required) continue;
              if (f?.type === 'array' || f?.type === 'file') continue;
              if (f?.type === 'relation' && f?.relation?.type === 'many-to-many') continue;
              if (f?.type === 'boolean') filteredContent[fieldName] = false;
              else if (f?.type === 'number' || f?.type === 'integer')
                filteredContent[fieldName] = 0;
              else filteredContent[fieldName] = '';
            }

            // System columns must come after the content spread so they can't be shadowed.
            // Timestamps as seconds because the INSERT below uses raw `sql` template
            // with `Object.values(blockData)`, which has no column awareness — Date
            // values would bind as ms and read back as far-future timestamps.
            const blockNowSec = getCurrentTimestampSeconds();
            const blockData = {
              ...filteredContent,
              id: block.id || generateUUID(),
              collection_id: itemId,
              sort: block.sort ?? 0,
              created_at: blockNowSec,
              updated_at: blockNowSec
            };

            // Queue any tag fields for post-tx TagService writes.
            for (const [, tags] of Object.entries(blockTagFields)) {
              const tagNames = (Array.isArray(tags) ? tags : [])
                .map((t: any) =>
                  typeof t === 'object' && t !== null
                    ? t.name || t.value || undefined
                    : typeof t === 'string'
                      ? t
                      : undefined
                )
                .filter(Boolean) as string[];
              pendingBlockTags.push({
                blockType: block.blockType,
                blockId: blockData.id,
                tagNames
              });
            }

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
                    VALUES (${generateUUID()}, ${blockData.id}, ${targetId}, ${getCurrentTimestampSeconds()}, ${getCurrentTimestampSeconds()})
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
                    VALUES (${generateUUID()}, ${blockData.id}, 'block', ${fileId}, ${i}, ${getCurrentTimestampSeconds()})
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

      // Same for block-level tag fields (e.g. `faq` block with a `tags` filter).
      for (const { blockType, blockId, tagNames } of pendingBlockTags) {
        await TagService.tagEntity(`block_${blockType}`, blockId, tagNames);
      }

      // Keep search_index current. Runs after the transaction + tags so the
      // reindex reads fully-committed state. Non-throwing — index failures
      // must not break saves.
      await SearchIndexService.onSaveSafe('collection', collectionSlug, result.itemId);

      // Snapshot a revision when the template opts in. Failures here must never
      // break the save — log and continue.
      const revisionKeep = resolveRevisionsKeep(collectionOptions.revisions);
      if (revisionKeep !== null) {
        try {
          await RevisionsService.create({
            entityType: `collection:${collectionSlug}`,
            entityId: result.itemId,
            data: formData,
            userId: locals.user?.id ?? null,
            keep: revisionKeep
          });
        } catch (err) {
          log.error(
            'Failed to create revision',
            { collectionSlug, itemId: result.itemId },
            err as Error
          );
        }
      }

      // Return the persisted row so the client can re-hydrate without a full
      // route reload. Tags are loaded separately on the client.
      const [savedRow] = await db
        .select()
        .from(collectionTable)
        .where(eq((collectionTable as any).id, result.itemId))
        .limit(1);
      const savedTags = await TagService.getTagsForEntity(
        `collection_${collectionSlug}`,
        result.itemId
      );

      return {
        success: true,
        message: 'Item saved successfully',
        itemId: result.itemId,
        item: savedRow,
        tags: savedTags
      };
    } catch (error) {
      log.error('Failed to save collection item', {}, error as Error);

      // Walk the error chain — libsql/drizzle put the human SQLite reason on `cause`
      const parts: string[] = [];
      const seen = new Set<any>();
      let current: any = error;
      while (current && !seen.has(current)) {
        seen.add(current);
        if (current.message) parts.push(String(current.message));
        if (current.code) parts.push(String(current.code));
        current = current.cause;
      }
      const blob = parts.join(' ');

      let friendly: string;
      const uniqueAny = blob.match(/UNIQUE constraint failed:\s*([^\s\n,]+)/i);
      const notNull = blob.match(/NOT NULL constraint failed:\s*([^\s\n,]+)/i);
      if (uniqueAny) {
        friendly = `Duplicate value for ${uniqueAny[1]}.`;
      } else if (notNull) {
        friendly = `Required field missing: ${notNull[1]}.`;
      } else if (/FOREIGN KEY constraint failed/i.test(blob)) {
        friendly = 'Referenced item no longer exists.';
      } else {
        friendly = error instanceof Error ? error.message : 'Failed to save item';
      }

      return { success: false, error: friendly };
    }
  }
);
