import { db } from '../../../core/db/index.server';
import { eq, asc, and, sql } from 'drizzle-orm';
import { files } from '../../../generated/schema';
import * as schema from '../../../generated/schema';
import { log } from '../../../core/utils/logger';
import { toSnakeCase } from '../../../core/utils/string';

/**
 * Load file fields for an item
 * @param item - The item to load files for
 * @param itemProperties - Field definitions from schema
 * @param fileTablePrefix - Table prefix (e.g., 'block_hero', 'global_categories', 'collection_posts')
 * @param loadFullFileObjects - Whether to load full file objects or just IDs
 */
export async function loadFileFields(
  item: any,
  itemProperties: Record<string, any>,
  fileTablePrefix: string,
  loadFullFileObjects: boolean = true
): Promise<void> {
  for (const [fieldName, fieldDef] of Object.entries(itemProperties)) {
    const typedFieldDef = fieldDef as any;

    if (typedFieldDef.type === 'file') {
      const snakeCaseFieldName = toSnakeCase(fieldName);

      // Check both camelCase and snake_case for the current value
      let currentValue = item[fieldName] !== undefined && item[fieldName] !== null
        ? item[fieldName]
        : item[snakeCaseFieldName];

      // Step 1: If no value yet, try to load file IDs from relation table
      if (currentValue === undefined || currentValue === null) {
        const fileTableName = `${fileTablePrefix}_${snakeCaseFieldName}`;

        try {
          // Try to get the table from schema first
          const relationTable = (schema as any)[fileTableName];
          let fileRelationResult;

          if (relationTable) {
            // Use Drizzle query builder if table exists in schema
            fileRelationResult = await db
              .select({ file_id: relationTable.file_id })
              .from(relationTable)
              .where(
                and(
                  eq(relationTable.parent_id, item.id),
                  sql`(${relationTable.parent_type} IN ('block','global','collection') OR ${relationTable.parent_type} IS NULL OR ${relationTable.parent_type} = '')`
                )
              )
              .orderBy(asc(relationTable.sort));
          } else {
            // Fallback to raw SQL for dynamic tables
            fileRelationResult = await db.run(
              sql`SELECT file_id FROM ${sql.identifier(fileTableName)}
                  WHERE parent_id = ${item.id} AND (parent_type IN ('block','global','collection') OR parent_type IS NULL OR parent_type = '')
                  ORDER BY "sort"`
            );
          }

          // Handle different result formats
          const results = relationTable ? fileRelationResult : fileRelationResult.rows;

          if (results && results.length > 0) {
            // Support both field.items (preferred) and field.file (legacy)
            const fileConfig = typedFieldDef.items || typedFieldDef.file || {};
            const multiple = !!fileConfig.multiple;
            if (multiple) {
              // Preserve order when multiple
              currentValue = results.map((r: any) => r.file_id).filter(Boolean);
              item[fieldName] = currentValue;
            } else {
              // Single file id
              currentValue = results[0].file_id;
              item[fieldName] = currentValue;
            }
          } else {
            item[fieldName] = null;
          }
        } catch (err) {
          // File relation table doesn't exist or other error
          item[fieldName] = null;
        }
      }

      // Step 2: If loadFullFileObjects is true and we have file IDs, convert to full objects
      if (loadFullFileObjects && currentValue !== undefined && currentValue !== null) {
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
      }
    }
  }
}
