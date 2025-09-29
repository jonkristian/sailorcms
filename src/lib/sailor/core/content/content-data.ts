import { db } from '../db/index.server';
import { sql, eq, asc, and } from 'drizzle-orm';
import { files } from '../../generated/schema';
import * as schema from '../../generated/schema';
import { toSnakeCase } from '../utils/string';
import { log } from '../utils/logger';

type ContentType = 'block' | 'global';

interface LoadContentOptions {
  contentType: ContentType;
  slug: string;
  parentTableName?: string;
  loadFullFileObjects?: boolean;
}

/**
 * Unified content data loader for blocks and globals
 * This eliminates code duplication between loadBlockData and loadGlobalData
 */
export async function loadContentData(
  item: any,
  itemProperties: Record<string, any>,
  options: LoadContentOptions
): Promise<void> {
  const { contentType, slug, parentTableName, loadFullFileObjects = true } = options;


  // Handle file fields first
  for (const [fieldName, fieldDef] of Object.entries(itemProperties)) {
    const typedFieldDef = fieldDef as any;

    if (typedFieldDef.type === 'file') {
      if (loadFullFileObjects && item[fieldName] !== undefined && item[fieldName] !== null) {
        const currentValue = item[fieldName];

        if (typeof currentValue === 'string') {
          // Single file ID - load full file object
          try {
            const fileResult = await db
              .select()
              .from(files)
              .where(eq(files.id, currentValue))
              .limit(1);
            const fileObject = fileResult[0] || null;
            item[fieldName] = fileObject;
          } catch (err) {
            log.warn(`Failed to load file ${currentValue}`, { fileId: currentValue, error: err });
            item[fieldName] = null;
          }
        } else if (
          Array.isArray(currentValue) &&
          currentValue.every((id) => typeof id === 'string')
        ) {
          // Array of file IDs - load full file objects
          try {
            const fileObjects = await Promise.all(
              currentValue.map(async (fileId: string) => {
                const fileResult = await db
                  .select()
                  .from(files)
                  .where(eq(files.id, fileId))
                  .limit(1);
                return fileResult[0] || null;
              })
            );
            item[fieldName] = fileObjects.filter((f) => f !== null);
          } catch (err) {
            log.warn(`Failed to load files ${currentValue}`, { fileIds: currentValue, error: err });
            item[fieldName] = [];
          }
        }
      } else {
        // File field is empty in main table - try to load from relation table
        const snakeCaseFieldName = toSnakeCase(fieldName);
        const fileTableName = parentTableName
          ? `${parentTableName}_${snakeCaseFieldName}` // Nested arrays
          : contentType === 'block'
            ? `block_${slug}_${snakeCaseFieldName}` // Blocks: block_slug_fieldname
            : `${contentType}_${slug}_${snakeCaseFieldName}`; // Globals: global_slug_fieldname


        try {
          const fileRelationResult = await db.run(
            sql`SELECT file_id FROM ${sql.identifier(fileTableName)}
                WHERE parent_id = ${item.id} AND (parent_type = ${contentType} OR parent_type IS NULL OR parent_type = '')
                ORDER BY "sort" LIMIT 1`
          );

          if (fileRelationResult.rows.length > 0) {
            const fileId = fileRelationResult.rows[0].file_id;

            if (loadFullFileObjects) {
              // Load full file object
              const fileResult = await db.select().from(files).where(eq(files.id, fileId)).limit(1);
              item[fieldName] = fileResult[0] || null;
            } else {
              // Just store the file ID
              item[fieldName] = fileId;
            }
          } else {
            item[fieldName] = null;
          }
        } catch (err) {
          // File relation table doesn't exist or other error - set to null
          item[fieldName] = null;
        }
      }
    }
  }

  // Handle array fields (repeatable components)
  for (const [fieldName, fieldDef] of Object.entries(itemProperties)) {
    const typedFieldDef = fieldDef as any;

    if (typedFieldDef.type === 'array' && typedFieldDef.items?.type === 'object') {
      // Table naming based on content type
      const arrayTableName = parentTableName
        ? `${parentTableName}_${toSnakeCase(fieldName)}` // Nested arrays
        : contentType === 'block'
          ? `block_${slug}_${toSnakeCase(fieldName)}` // Blocks: block_slug_fieldname
          : `${contentType}_${slug}_${toSnakeCase(fieldName)}`; // Globals: global_slug_fieldname

      // Foreign key field based on content type and nesting
      const foreignKeyField = parentTableName
        ? 'parent_id' // Nested arrays use parent_id
        : contentType === 'block'
          ? 'block_id' // Blocks use block_id
          : 'global_id'; // Globals use global_id

      try {
        const arrayResult = await db.run(
          sql`SELECT * FROM ${sql.identifier(arrayTableName)} WHERE ${sql.identifier(foreignKeyField)} = ${item.id} ORDER BY "sort"`
        );

        if (arrayResult.rows.length > 0) {
          // Process each array item and recursively load its data
          const arrayItems = await Promise.all(
            arrayResult.rows.map(async (row: any) => {
              const arrayItem = { ...row };

              // Recursively load nested arrays and files for each array item
              if (typedFieldDef.items?.properties) {
                await loadContentData(arrayItem, typedFieldDef.items.properties, {
                  contentType,
                  slug,
                  parentTableName: arrayTableName, // This becomes the parent table for nested arrays
                  loadFullFileObjects
                });
              }

              // Load file fields from relation tables for this array item
              for (const [itemFieldName, itemFieldDef] of Object.entries(
                typedFieldDef.items?.properties || {}
              )) {
                const itemTypedFieldDef = itemFieldDef as any;
                if (itemTypedFieldDef.type === 'file') {
                  const fileTableName = `${arrayTableName}_${itemFieldName}`;
                  try {
                    const relationTable = schema[fileTableName as keyof typeof schema];
                    if (relationTable) {
                      const fileResult = await db
                        .select()
                        .from(files)
                        .innerJoin(relationTable, eq(files.id, (relationTable as any).file_id))
                        .where(and(
                          eq((relationTable as any).parent_id, arrayItem.id),
                          eq((relationTable as any).parent_type, contentType)
                        ))
                        .orderBy(asc((relationTable as any).sort));

                      if (fileResult.length > 0) {
                        if (itemTypedFieldDef.multiple) {
                          arrayItem[itemFieldName] = fileResult.map((row: any) => row.files);
                        } else {
                          arrayItem[itemFieldName] = fileResult[0].files;
                        }
                      } else {
                        arrayItem[itemFieldName] = itemTypedFieldDef.multiple ? [] : null;
                      }
                    } else {
                      arrayItem[itemFieldName] = itemTypedFieldDef.multiple ? [] : null;
                    }
                  } catch (err) {
                    log.warn(
                      `Failed to load file field '${itemFieldName}' from table '${fileTableName}'`,
                      {
                        fieldName: itemFieldName,
                        fileTableName,
                        parentId: arrayItem.id,
                        error: err
                      }
                    );
                    arrayItem[itemFieldName] = itemTypedFieldDef.multiple ? [] : null;
                  }
                }
              }

              return arrayItem;
            })
          );

          item[fieldName] = arrayItems;
        } else {
          item[fieldName] = [];
        }
      } catch (err) {
        log.warn(`Failed to load array field '${fieldName}' from table '${arrayTableName}'`, {
          fieldName,
          arrayTableName,
          contentType,
          slug,
          error: err
        });
        item[fieldName] = [];
      }
    }
  }

  // Handle many-to-many relation fields
  for (const [fieldName, fieldDef] of Object.entries(itemProperties)) {
    const typedFieldDef = fieldDef as any;

    if (typedFieldDef.type === 'relation' && typedFieldDef.relation?.type === 'many-to-many') {
      try {
        const junctionTableName = contentType === 'block'
          ? `junction_${slug}_${fieldName}` // Blocks: junction_blockslug_fieldname
          : `junction_${slug}_${fieldName}`; // Globals: junction_globalslug_fieldname

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

        if (relation.targetGlobal) {
          targetTableName = `global_${relation.targetGlobal}`;
          targetTable = schema[targetTableName as keyof typeof schema];
        } else if (relation.targetCollection) {
          targetTableName = `collection_${relation.targetCollection}`;
          targetTable = schema[targetTableName as keyof typeof schema];
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

        // Determine the foreign key field in junction table
        const foreignKeyField = contentType === 'block' ? 'block_id' : 'global_id';

        // Join junction table with target table to get full objects
        const relationResult = await db
          .select()
          .from(targetTable)
          .innerJoin(junctionTable, eq((targetTable as any).id, (junctionTable as any).target_id))
          .where(eq((junctionTable as any)[foreignKeyField], item.id));

        // Extract the target objects and recursively load their nested data
        const relatedObjects = await Promise.all(
          relationResult.map(async (row: any) => {
            // The target table data is in a nested object named after the table
            const relatedObject = row[targetTableName] || row;

            // Recursively load nested data for the related object
            // We need to determine the target content type and slug
            let targetContentType: ContentType;
            let targetSlug: string;

            if (relation.targetGlobal) {
              targetContentType = 'global';
              targetSlug = relation.targetGlobal;
            } else if (relation.targetCollection) {
              targetContentType = 'global'; // Collections use 'global' pattern for content loading
              targetSlug = relation.targetCollection;
            } else {
              return relatedObject; // Return as-is if we can't determine type
            }

            // Get the actual schema definition for the target content type
            let targetSchema: Record<string, any> = {};

            try {
              if (relation.targetGlobal) {
                // Fetch global schema from database
                const globalTypeRow = await db.query.globalTypes.findFirst({
                  where: (globalTypes: any, { eq }: any) => eq(globalTypes.slug, relation.targetGlobal)
                });
                if (globalTypeRow) {
                  targetSchema = JSON.parse(globalTypeRow.schema);
                }
              } else if (relation.targetCollection) {
                // Fetch collection schema from database
                const collectionTypeRow = await db.query.collectionTypes.findFirst({
                  where: (collectionTypes: any, { eq }: any) => eq(collectionTypes.slug, relation.targetCollection)
                });
                if (collectionTypeRow) {
                  targetSchema = JSON.parse(collectionTypeRow.schema);
                }
              }

              // Load nested content data for the related object using its actual schema
              if (Object.keys(targetSchema).length > 0) {
                await loadContentData(relatedObject, targetSchema, {
                  contentType: targetContentType,
                  slug: targetSlug,
                  loadFullFileObjects
                });
              }
            } catch (schemaError) {
              // If we can't load the schema, just return the object as-is
              log.warn(`Failed to load schema for ${targetContentType} ${targetSlug}`, { error: schemaError });
            }

            return relatedObject;
          })
        );

        item[fieldName] = relatedObjects;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        console.error(
          `Failed to load many-to-many relation for ${fieldName} in ${contentType} ${slug}:`,
          errorMessage
        );
        item[fieldName] = [];
      }
    }
  }
}

// Convenience wrapper functions to maintain existing API
export async function loadBlockData(
  item: any,
  blockSlug: string,
  itemProperties: Record<string, any>,
  parentTableName?: string,
  loadFullFileObjects: boolean = true
): Promise<void> {
  return loadContentData(item, itemProperties, {
    contentType: 'block',
    slug: blockSlug,
    parentTableName,
    loadFullFileObjects
  });
}

export async function loadGlobalData(
  item: any,
  globalSlug: string,
  itemProperties: Record<string, any>,
  loadFullFileObjects: boolean = true
): Promise<void> {
  return loadContentData(item, itemProperties, {
    contentType: 'global',
    slug: globalSlug,
    loadFullFileObjects
  });
}
