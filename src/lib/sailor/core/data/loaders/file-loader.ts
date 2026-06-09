import { db } from '../../db/index.server';
import { sql } from 'drizzle-orm';
import { log } from '../../utils/logger';
import { childTableName } from '../../utils/string';

/**
 * Core file loader for admin UI
 * Loads file IDs for file fields (admin UI loads full objects client-side via FilePicker)
 * All file fields use relation tables (allows changing multiple flag without migration)
 */
export async function loadFileFields(
  item: any,
  fields: Record<string, any>,
  tablePrefix: string
): Promise<void> {
  for (const [fieldName, fieldDef] of Object.entries(fields)) {
    if ((fieldDef as any).type === 'file') {
      const fileConfig = (fieldDef as any).items || (fieldDef as any).file || {};
      const multiple = !!fileConfig.multiple;

      // All file fields use relation tables. For localized collections,
      // junctions FK to the `_locales` row id — the caller stamps `_localeId`
      // on the item; non-localized callers leave it undefined and we fall
      // back to `item.id` (= main row id) unchanged.
      try {
        // Relation tables are snake_cased by the generator — a camelCase field
        // key (coverMobile) maps to collection_x_cover_mobile, not _coverMobile.
        const fileTableName = childTableName(tablePrefix, fieldName);
        const parentId = item._localeId ?? item.id;
        const fileResult = await db.run(
          sql`SELECT file_id FROM ${sql.identifier(fileTableName)}
              WHERE parent_id = ${parentId} AND parent_type IN ('collection', 'global', 'block')
              ORDER BY "sort"`
        );
        const fileIds = fileResult.rows.map((r: any) => r.file_id).filter(Boolean);

        if (multiple) {
          // Return array of IDs
          item[fieldName] = fileIds;
        } else {
          // Return single ID (first one) or empty string
          item[fieldName] = fileIds.length > 0 ? fileIds[0] : '';
        }
      } catch (error) {
        log.warn(`Failed to load file field ${fieldName}`, { error });
        item[fieldName] = multiple ? [] : '';
      }
    }
  }
}
