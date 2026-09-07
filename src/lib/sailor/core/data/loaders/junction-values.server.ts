import { db } from '../../db/index.server';
import * as schema from '$sailor/generated/schema';
import { sql } from 'drizzle-orm';
import { childTableName } from '../../utils/string';

export type JunctionValue = { id: string; title: string };

/**
 * Read a many-to-many field's current value for the admin editors, for any
 * number of owners at once.
 *
 * Ordered by the junction's own `sort`, and re-projected onto that order —
 * `IN (...)` returns rows however the planner likes. The round-trip matters:
 * saving rewrites `sort` from the order the picker hands back, so loading
 * unordered would let an untouched save scramble the sequence.
 *
 * `ownerIds` must be the ids the *writer* anchors on. For globals that is the
 * main row id even when the global is localized — `persistGlobalRelations`
 * uses `finalItemId`, not the `_locales` row id, which is the opposite of what
 * array and file child tables do.
 *
 * Two queries regardless of owner count, so list views don't turn into an N+1.
 */
export async function loadJunctionValuesForOwners(
  ownerSlug: string,
  ownerKey: 'global_id' | 'collection_id' | 'block_id',
  ownerIds: string[],
  fieldName: string,
  fieldDef: any
): Promise<Map<string, JunctionValue[]>> {
  const empty = new Map<string, JunctionValue[]>();
  const relation = fieldDef?.relation;
  if (relation?.type !== 'many-to-many' || ownerIds.length === 0) return empty;

  const junctionTableName = relation.through || childTableName(`junction_${ownerSlug}`, fieldName);
  if (!(schema as any)[junctionTableName]) return empty;

  const targetTable = relation.targetGlobal
    ? `global_${relation.targetGlobal}`
    : relation.targetCollection
      ? `collection_${relation.targetCollection}`
      : null;
  if (!targetTable || !(schema as any)[targetTable]) return empty;

  try {
    const edges = await db.run(
      sql`SELECT ${sql.identifier(ownerKey)} AS owner_id, target_id
          FROM ${sql.identifier(junctionTableName)}
          WHERE ${sql.identifier(ownerKey)} IN (${sql.join(
            ownerIds.map((id) => sql`${id}`),
            sql`, `
          )})
          ORDER BY ${sql.identifier(ownerKey)}, "sort"`
    );
    const edgeRows = (edges.rows || []) as Array<{ owner_id: string; target_id: string }>;
    if (edgeRows.length === 0) return empty;

    const targets = await db.run(
      sql`SELECT id, title FROM ${sql.identifier(targetTable)} WHERE id IN (${sql.join(
        [...new Set(edgeRows.map((row) => row.target_id))].map((id) => sql`${id}`),
        sql`, `
      )})`
    );
    const byId = new Map(
      ((targets.rows || []) as Array<{ id: string; title: string }>).map((row) => [
        row.id,
        { id: row.id, title: row.title }
      ])
    );

    const result = new Map<string, JunctionValue[]>();
    for (const row of edgeRows) {
      const target = byId.get(row.target_id);
      if (!target) continue;
      const bucket = result.get(row.owner_id);
      if (bucket) bucket.push(target);
      else result.set(row.owner_id, [target]);
    }
    return result;
  } catch {
    return empty;
  }
}

/** Single-owner convenience over {@link loadJunctionValuesForOwners}. */
export async function loadJunctionValues(
  ownerSlug: string,
  ownerKey: 'global_id' | 'collection_id' | 'block_id',
  ownerId: string,
  fieldName: string,
  fieldDef: any
): Promise<JunctionValue[]> {
  const byOwner = await loadJunctionValuesForOwners(
    ownerSlug,
    ownerKey,
    [ownerId],
    fieldName,
    fieldDef
  );
  return byOwner.get(ownerId) ?? [];
}
