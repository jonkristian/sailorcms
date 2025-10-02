import * as schema from '../../generated/schema';
import { sql, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';

// Re-export block field loading for admin UI - uses core loaders, not utils
export { loadBlockFields } from '../data/loaders/blocks';

/**
 * Save nested array fields for blocks - handles both saving and deleting array items
 * This function is used during form submissions to update array data in blocks
 * This is CORE CMS functionality, not part of the public developer API
 */
export async function saveNestedArrayFields(
  tx: any,
  block: any,
  blockFields: Record<string, any>,
  arrayFields: Record<string, any[]>,
  parentId?: string,
  parentIdField: string = 'block_id',
  currentTablePath?: string
): Promise<void> {
  for (const [arrayFieldName, arrayItems] of Object.entries(arrayFields)) {
    const arrayFieldDef = blockFields[arrayFieldName];
    if (!arrayFieldDef?.items?.properties) continue;

    const relationTableName = currentTablePath
      ? `${currentTablePath}_${arrayFieldName}` // For nested arrays, append to current path
      : `block_${block.blockType}_${arrayFieldName}`; // For first level arrays

    const currentParentId = parentId || block.id;
    const clientItemIds = arrayItems.map((item: any) => item.id).filter(Boolean);

    // 1. Delete items that are in the DB but not in the client-side list
    if (clientItemIds.length > 0) {
      // Use inArray from drizzle-orm for proper NOT IN handling
      const { notInArray, eq } = await import('drizzle-orm');
      const relationTable = schema[relationTableName as keyof typeof schema];
      if (relationTable) {
        await tx
          .delete(relationTable)
          .where(
            and(
              eq((relationTable as any)[parentIdField], currentParentId),
              notInArray((relationTable as any).id, clientItemIds)
            )
          );
      }
    } else {
      // If the client sends an empty list, delete all items for this parent
      const relationTable = schema[relationTableName as keyof typeof schema];
      if (relationTable) {
        await tx.run(sql`
          DELETE FROM ${sql.identifier(relationTableName)}
          WHERE ${sql.identifier(parentIdField)} = ${currentParentId}`);
      }
    }

    // 2. Insert/update items from the client-side list
    for (let index = 0; index < arrayItems.length; index++) {
      const item = arrayItems[index];
      const itemId = item.id || randomUUID();

      // Extract nested array fields and file fields before upsert
      const nestedArrayFields: Record<string, any[]> = {};
      const fileFields: Record<string, any> = {};
      const regularFields: Record<string, any> = {};

      for (const [key, value] of Object.entries(item)) {
        if (key === 'id') continue;
        const fieldDef = arrayFieldDef.items.properties[key];
        if (fieldDef?.type === 'array') {
          nestedArrayFields[key] = value as any[];
        } else if (fieldDef?.type === 'file') {
          fileFields[key] = value;
        } else {
          regularFields[key] = value;
        }
      }

      // Upsert the main item
      const itemData = {
        id: itemId,
        [parentIdField]: currentParentId,
        sort: index,
        ...regularFields,
        created_at: Date.now(),
        updated_at: Date.now()
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

      // Handle file fields for this item
      for (const [fieldName, fieldValue] of Object.entries(fileFields)) {
        const fileTableName = `${relationTableName}_${fieldName}`;
        const fileTable = schema[fileTableName as keyof typeof schema];
        if (!fileTable) continue;

        // Clear existing file relations for this item/field
        await tx.run(sql`
          DELETE FROM ${sql.identifier(fileTableName)}
          WHERE parent_id = ${itemId} AND parent_type = 'block'
        `);

        if (!fieldValue) continue;

        const fileIds: string[] = Array.isArray(fieldValue) ? fieldValue : [fieldValue];

        for (let i = 0; i < fileIds.length; i++) {
          const fileId = fileIds[i];
          if (!fileId) continue;
          await tx.run(sql`
            INSERT INTO ${sql.identifier(fileTableName)}
            (${sql.join(
              ['id', 'parent_id', 'parent_type', 'file_id', 'sort', 'created_at'].map((key) =>
                sql.identifier(key)
              ),
              sql`, `
            )})
            VALUES (${sql.join(
              [randomUUID(), itemId, 'block', fileId, i, Date.now()].map((val) => sql`${val}`),
              sql`, `
            )})`);
        }
      }

      // Handle nested arrays recursively
      if (Object.keys(nestedArrayFields).length > 0) {
        // For nested arrays, use 'parent_id' for consistent naming
        await saveNestedArrayFields(
          tx,
          block,
          arrayFieldDef.items.properties,
          nestedArrayFields,
          itemId,
          'parent_id',
          relationTableName
        );
      }
    }
  }
}
