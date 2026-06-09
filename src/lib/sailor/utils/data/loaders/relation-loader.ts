import { db } from 'sailorcms/core/db/index.server';
import { and, eq, sql, type SQL } from 'drizzle-orm';
import * as schema from '$sailor/generated/schema';
import { liveOnly } from 'sailorcms/core/db/soft-delete';
import { log } from 'sailorcms/core/utils/logger';
import { childTableName } from 'sailorcms/core/utils/string';
import { loadFileFields } from './file-loader';
import { loadArrayFields } from './array-loader';

export type RelationStatus = 'published' | 'draft' | 'all';

/**
 * Returns an `eq(table.status, status)` condition, or a no-op for tables
 * without a `status` column or when `status === 'all'`.
 */
function statusOnly(table: any, status: RelationStatus): SQL {
  if (status === 'all') return sql`1 = 1`;
  if (table?.status === undefined) return sql`1 = 1`;
  return eq(table.status, status);
}

/**
 * Callback type for loading nested content data
 * Each content type (block, global, collection) provides its own implementation
 */
export type LoadNestedContentFn = (
  item: any,
  targetSlug: string,
  targetSchema: Record<string, any>,
  loadFullFileObjects: boolean
) => Promise<void>;

/**
 * Load nested content with the correct loader based on content type
 * This allows any content type to load relations to any other content type
 */
async function loadNestedContent(
  item: any,
  targetSlug: string,
  targetSchema: Record<string, any>,
  loadFullFileObjects: boolean,
  contentType: 'block' | 'global' | 'collection',
  status: RelationStatus
): Promise<void> {
  const tablePrefix = `${contentType}_${targetSlug}`;
  const foreignKeyField =
    contentType === 'block'
      ? 'block_id'
      : contentType === 'collection'
        ? 'collection_id'
        : 'global_id';

  // Load file fields
  await loadFileFields(item, targetSchema, tablePrefix, loadFullFileObjects);

  // Load array fields
  await loadArrayFields(
    item,
    targetSchema,
    tablePrefix,
    foreignKeyField,
    loadFullFileObjects,
    status
  );

  // Load one-to-one and one-to-many relations (recursively with correct content type)
  await loadOneToXRelations(item, targetSchema, loadFullFileObjects, status);

  // Load many-to-many relations (recursively with correct content type)
  await loadManyToManyRelations(
    item,
    targetSchema,
    targetSlug,
    foreignKeyField,
    loadFullFileObjects,
    status
  );
}

/**
 * Load one-to-one and one-to-many relation fields
 */
export async function loadOneToXRelations(
  item: any,
  itemProperties: Record<string, any>,
  loadFullFileObjects: boolean = true,
  status: RelationStatus = 'published'
): Promise<void> {
  for (const [fieldName, fieldDef] of Object.entries(itemProperties)) {
    const typedFieldDef = fieldDef as any;

    if (
      typedFieldDef.type === 'relation' &&
      (typedFieldDef.relation?.type === 'one-to-one' ||
        typedFieldDef.relation?.type === 'one-to-many')
    ) {
      const relationValue = item[fieldName];

      // Only process if we have a relation value (ID)
      if (relationValue && typeof relationValue === 'string') {
        try {
          const relation = typedFieldDef.relation;
          let targetTable: any;
          let targetTableName: string;
          let targetSlug: string;

          if (relation.targetGlobal) {
            targetTableName = `global_${relation.targetGlobal}`;
            targetTable = schema[targetTableName as keyof typeof schema];
            targetSlug = relation.targetGlobal;
          } else if (relation.targetCollection) {
            targetTableName = `collection_${relation.targetCollection}`;
            targetTable = schema[targetTableName as keyof typeof schema];
            targetSlug = relation.targetCollection;
          } else {
            console.warn(`Unknown target for relation ${fieldName}:`, relation);
            continue;
          }

          if (!targetTable) {
            console.warn(`Target table '${targetTableName}' not found in schema`);
            continue;
          }

          // Load the related object — skip soft-deleted targets, and (for
          // tables that have a status column) only return rows matching the
          // requested status. Defaults to 'published' so public site loads
          // never pick up drafts via a relation.
          const relatedResult = await db
            .select()
            .from(targetTable)
            .where(
              and(
                eq((targetTable as any).id, relationValue),
                liveOnly(targetTable),
                statusOnly(targetTable, status)
              )
            )
            .limit(1);

          if (relatedResult.length > 0) {
            const relatedObject = relatedResult[0];

            // Get the schema for the related object to load its nested data
            let targetSchema: Record<string, any> = {};
            let targetContentType: 'block' | 'global' | 'collection' = 'global';

            try {
              if (relation.targetGlobal) {
                targetContentType = 'global';
                // Fetch global schema from database
                const globalTypeRow = await db.query.globalTypes.findFirst({
                  where: (globalTypes: any, { eq }: any) =>
                    eq(globalTypes.slug, relation.targetGlobal)
                });
                if (globalTypeRow) {
                  targetSchema = JSON.parse(globalTypeRow.schema);
                }
              } else if (relation.targetCollection) {
                targetContentType = 'collection';
                // Fetch collection schema from database
                const collectionTypeRow = await db.query.collectionTypes.findFirst({
                  where: (collectionTypes: any, { eq }: any) =>
                    eq(collectionTypes.slug, relation.targetCollection)
                });
                if (collectionTypeRow) {
                  targetSchema = JSON.parse(collectionTypeRow.schema);
                }
              }

              // Recursively load nested content data for the related object using the correct loader
              if (Object.keys(targetSchema).length > 0) {
                await loadNestedContent(
                  relatedObject,
                  targetSlug,
                  targetSchema,
                  loadFullFileObjects,
                  targetContentType,
                  status
                );
              }
            } catch (schemaError) {
              // If we can't load the schema, just use the object as-is
              log.warn(`Failed to load schema for ${targetSlug}`, {
                error: schemaError
              });
            }

            // Replace the ID with the full object
            item[fieldName] = relatedObject;
          } else {
            // Related object not found (or filtered out by liveOnly/status)
            item[fieldName] = null;
          }
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error';
          console.error(
            `Failed to load ${typedFieldDef.relation?.type} relation for ${fieldName}:`,
            errorMessage
          );
          // Keep the original ID value on error
        }
      }
    }
  }
}

/**
 * Load many-to-many relation fields
 */
export async function loadManyToManyRelations(
  item: any,
  itemProperties: Record<string, any>,
  junctionTablePrefix: string,
  foreignKeyField: string,
  loadFullFileObjects: boolean = true,
  status: RelationStatus = 'published'
): Promise<void> {
  for (const [fieldName, fieldDef] of Object.entries(itemProperties)) {
    const typedFieldDef = fieldDef as any;

    if (typedFieldDef.type === 'relation' && typedFieldDef.relation?.type === 'many-to-many') {
      try {
        const junctionTableName = childTableName(`junction_${junctionTablePrefix}`, fieldName);
        const junctionTable = schema[junctionTableName as keyof typeof schema];

        if (!junctionTable) {
          console.warn(`Junction table '${junctionTableName}' not found in schema`);
          item[fieldName] = [];
          continue;
        }

        // Get the target table name
        const relation = typedFieldDef.relation;
        let targetTable: any;
        let targetTableName: string;
        let targetSlug: string;

        if (relation.targetGlobal) {
          targetTableName = `global_${relation.targetGlobal}`;
          targetTable = schema[targetTableName as keyof typeof schema];
          targetSlug = relation.targetGlobal;
        } else if (relation.targetCollection) {
          targetTableName = `collection_${relation.targetCollection}`;
          targetTable = schema[targetTableName as keyof typeof schema];
          targetSlug = relation.targetCollection;
        } else {
          console.warn(`Unknown target for relation ${fieldName}:`, relation);
          item[fieldName] = [];
          continue;
        }

        if (!targetTable) {
          console.warn(`Target table '${targetTableName}' not found in schema`);
          item[fieldName] = [];
          continue;
        }

        // Join junction table with target table to get full objects.
        // Filter target rows by liveOnly + status so soft-deleted or unpublished
        // entries don't leak through a relation. Junction rows themselves don't
        // carry deleted_at/status, so the filters apply to the target table.
        //
        // For localized collections, junctions FK to the _locales row id.
        // The `_localeId` convention lets non-localized callers pass `undefined`
        // and fall through to `item.id` (= main row id) unchanged.
        const parentId = item._localeId ?? item.id;
        const relationResult = await db
          .select()
          .from(targetTable)
          .innerJoin(junctionTable, eq((targetTable as any).id, (junctionTable as any).target_id))
          .where(
            and(
              eq((junctionTable as any)[foreignKeyField], parentId),
              liveOnly(targetTable),
              statusOnly(targetTable, status)
            )
          );

        // Extract the target objects and recursively load their nested data
        const relatedObjects = await Promise.all(
          relationResult.map(async (row: any) => {
            // The target table data is in a nested object named after the table
            const relatedObject = row[targetTableName] || row;

            // Get the actual schema definition for the target content type
            let targetSchema: Record<string, any> = {};
            let targetContentType: 'block' | 'global' | 'collection' = 'global';

            try {
              if (relation.targetGlobal) {
                targetContentType = 'global';
                // Fetch global schema from database
                const globalTypeRow = await db.query.globalTypes.findFirst({
                  where: (globalTypes: any, { eq }: any) =>
                    eq(globalTypes.slug, relation.targetGlobal)
                });
                if (globalTypeRow) {
                  targetSchema = JSON.parse(globalTypeRow.schema);
                }
              } else if (relation.targetCollection) {
                targetContentType = 'collection';
                // Fetch collection schema from database
                const collectionTypeRow = await db.query.collectionTypes.findFirst({
                  where: (collectionTypes: any, { eq }: any) =>
                    eq(collectionTypes.slug, relation.targetCollection)
                });
                if (collectionTypeRow) {
                  targetSchema = JSON.parse(collectionTypeRow.schema);
                }
              }

              // Load nested content data for the related object using the correct loader
              if (Object.keys(targetSchema).length > 0) {
                await loadNestedContent(
                  relatedObject,
                  targetSlug,
                  targetSchema,
                  loadFullFileObjects,
                  targetContentType,
                  status
                );
              }
            } catch (schemaError) {
              // If we can't load the schema, just return the object as-is
              log.warn(`Failed to load schema for ${targetSlug}`, {
                error: schemaError
              });
            }

            return relatedObject;
          })
        );

        item[fieldName] = relatedObjects;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        console.error(`Failed to load many-to-many relation for ${fieldName}:`, errorMessage);
        item[fieldName] = [];
      }
    }
  }
}
