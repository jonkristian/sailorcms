import { db } from '../../../core/db/index.server';
import { sql } from 'drizzle-orm';
import { log } from '../../../core/utils/logger';
import { loadFileFields } from './file-loader';
import { toSnakeCase } from '../../../core/utils/string';

/**
 * Load array fields (repeatable components) for an item
 * @param item - The item to load arrays for
 * @param itemProperties - Field definitions from schema
 * @param arrayTablePrefix - Table prefix for arrays (e.g., 'block_hero', 'global_categories')
 * @param foreignKeyField - The foreign key field name (e.g., 'block_id', 'global_id', 'collection_id')
 * @param loadFullFileObjects - Whether to load full file objects in nested items
 */
export async function loadArrayFields(
  item: any,
  itemProperties: Record<string, any>,
  arrayTablePrefix: string,
  foreignKeyField: string,
  loadFullFileObjects: boolean = true
): Promise<void> {
  for (const [fieldName, fieldDef] of Object.entries(itemProperties)) {
    const typedFieldDef = fieldDef as any;

    if (typedFieldDef.type === 'array' && typedFieldDef.items?.type === 'object') {
      const snakeCaseFieldName = toSnakeCase(fieldName);
      const arrayTableName = `${arrayTablePrefix}_${snakeCaseFieldName}`;

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
                // Recursively load nested arrays
                await loadArrayFields(
                  arrayItem,
                  typedFieldDef.items.properties,
                  arrayTableName,
                  'parent_id', // Nested arrays use parent_id
                  loadFullFileObjects
                );

                // Load file fields for this array item
                await loadFileFields(
                  arrayItem,
                  typedFieldDef.items.properties,
                  arrayTableName,
                  loadFullFileObjects
                );
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
          error: err
        });
        item[fieldName] = [];
      }
    }
  }
}
