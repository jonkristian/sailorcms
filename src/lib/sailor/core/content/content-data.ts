import { db } from '../db/index.server';
import { sql, eq, asc } from 'drizzle-orm';
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
                        .where(eq((relationTable as any).parent_id, arrayItem.id))
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
