import { sql } from 'drizzle-orm';
import * as schema from '$sailor/generated/schema';
import { generateUUID } from 'sailorcms/core/utils/common';
import { getCurrentTimestampSeconds } from 'sailorcms/core/utils/date';
import { toSnakeCase } from 'sailorcms/core/utils/string';

export type ArrayRowParentType = 'global' | 'collection' | 'block';

/**
 * Files declared inside an array's `items.properties` live in their own
 * `${arrayTable}_${propKey}` relation tables (parent_id = arrayItemId), not as
 * columns on the array table. The schema generator emits these relation tables
 * for every entity type (globals/collections/blocks) — save and load paths must
 * read/write through them to stay consistent with the normalized layout.
 *
 * Using these helpers (instead of re-implementing per save site) keeps the
 * contract in one place; the same gap previously bit globals + collections in
 * different ways.
 */

const collectFileIds = (raw: unknown): string[] => {
  const ids: string[] = [];
  const push = (v: unknown): void => {
    if (!v) return;
    if (typeof v === 'string') ids.push(v);
    else if (typeof v === 'object' && (v as any).id) ids.push((v as any).id);
  };
  if (Array.isArray(raw)) raw.forEach(push);
  else push(raw);
  return ids;
};

/**
 * Replace file-relation rows for a single array row.
 * Deletes any existing rows for `arrayItemId`, then inserts new ones from `rowData`.
 */
export async function syncArrayRowFiles(
  tx: any,
  arrayTableName: string,
  arrayItemId: string,
  itemsProperties: Record<string, any>,
  rowData: Record<string, any>,
  parentType: ArrayRowParentType
): Promise<void> {
  for (const [propKey, propDef] of Object.entries(itemsProperties)) {
    if ((propDef as any).type !== 'file') continue;

    const fileTableName = `${arrayTableName}_${toSnakeCase(propKey)}`;
    if (!(schema as any)[fileTableName]) continue;

    await tx.run(sql`
      DELETE FROM ${sql.identifier(fileTableName)}
      WHERE parent_id = ${arrayItemId}
    `);

    const ids = collectFileIds(rowData[propKey]);
    for (let i = 0; i < ids.length; i++) {
      await tx.run(sql`
        INSERT INTO ${sql.identifier(fileTableName)}
        (id, parent_id, parent_type, file_id, sort, created_at)
        VALUES (${generateUUID()}, ${arrayItemId}, ${parentType}, ${ids[i]}, ${i}, ${getCurrentTimestampSeconds()})
      `);
    }
  }
}

/**
 * Cascade delete: clear file-relation rows for a single array row that's about
 * to be removed. Call before deleting the parent array row.
 */
export async function clearArrayRowFiles(
  tx: any,
  arrayTableName: string,
  arrayItemId: string,
  itemsProperties: Record<string, any>
): Promise<void> {
  for (const [propKey, propDef] of Object.entries(itemsProperties)) {
    if ((propDef as any).type !== 'file') continue;
    const fileTableName = `${arrayTableName}_${toSnakeCase(propKey)}`;
    if (!(schema as any)[fileTableName]) continue;
    await tx.run(sql`
      DELETE FROM ${sql.identifier(fileTableName)}
      WHERE parent_id = ${arrayItemId}
    `);
  }
}

/**
 * Cascade delete for a "clear all rows" save flow (collections-style):
 * clears file-relation rows for every array row currently linked to
 * `parentItemId` via `foreignKeyField`. Call before deleting the array rows.
 */
export async function clearArrayRowFilesByParent(
  tx: any,
  arrayTableName: string,
  parentItemId: string,
  foreignKeyField: 'global_id' | 'collection_id' | 'block_id' | 'parent_id',
  itemsProperties: Record<string, any>
): Promise<void> {
  for (const [propKey, propDef] of Object.entries(itemsProperties)) {
    if ((propDef as any).type !== 'file') continue;
    const fileTableName = `${arrayTableName}_${toSnakeCase(propKey)}`;
    if (!(schema as any)[fileTableName]) continue;
    await tx.run(sql`
      DELETE FROM ${sql.identifier(fileTableName)}
      WHERE parent_id IN (
        SELECT id FROM ${sql.identifier(arrayTableName)}
        WHERE ${sql.identifier(foreignKeyField)} = ${parentItemId}
      )
    `);
  }
}
