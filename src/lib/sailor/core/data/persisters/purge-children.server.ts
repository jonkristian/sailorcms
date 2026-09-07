import { sql } from 'drizzle-orm';
import * as schema from '$sailor/generated/schema';
import { db } from '../../db/index.server';

export type EntityKind = 'collection' | 'global' | 'block';

/**
 * Every child table belonging to an entity, deepest first.
 *
 * Four shapes exist and they do not share a key, which is the trap:
 *
 * - `junction_<slug>_<field>` — keyed on `<kind>_id`
 * - `<prefix>_<field>` (array) — keyed on `<kind>_id`, *and* carries its own
 *   `parent_id` for nesting. Keying a sweep on `parent_id` here looks right and
 *   silently misses rows.
 * - `<prefix>_<field>` (file) — keyed on `parent_id` + `parent_type`, where
 *   `parent_id` is the entity
 * - `<prefix>_<field>_<sub>` (nested array or array-row file) — keyed on
 *   `parent_id`, where `parent_id` is a row in the table above, not the entity
 *
 * So the key is derived per table from its actual columns and its depth, never
 * assumed.
 */
function childTablesFor(kind: EntityKind, slug: string): string[] {
  const prefix = `${kind}_${slug}_`;
  const junctionPrefix = `junction_${slug}_`;
  return (
    Object.keys(schema)
      .filter((name) => name.startsWith(prefix) || name.startsWith(junctionPrefix))
      .filter((name) => !name.endsWith('_locales'))
      .filter((name) => {
        const table = (schema as any)[name];
        return table && typeof table === 'object' && 'id' in table;
      })
      // Deepest first, so a nested table can still resolve its parent's rows.
      .sort((a, b) => b.split('_').length - a.split('_').length)
  );
}

function columnsOf(tableName: string): Set<string> {
  const table = (schema as any)[tableName];
  return new Set(Object.keys(table ?? {}));
}

/**
 * Delete everything hanging off an entity: junction edges, array rows, nested
 * array rows, and file links.
 *
 * A purge that skips these leaves the relational footprint behind. Junction
 * orphans are the worst of it — they still read as edges, so counts, filters
 * and reverse panels report items that no longer exist.
 *
 * `entityIds` is a list because a localized entity's children do not all key on
 * the same id: junctions, arrays and file links on a localized collection hang
 * off the `_locales` row, not the main row. Passing only the main id cleaned up
 * nothing for exactly the entities most likely to have children — so pass the
 * main id *and* every locale row id, and collect them before those rows go.
 */
export async function purgeEntityChildren(
  kind: EntityKind,
  slug: string,
  entityIds: string | string[]
): Promise<number> {
  const ids = (Array.isArray(entityIds) ? entityIds : [entityIds]).filter(Boolean);
  if (ids.length === 0) return 0;
  const idList = sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `
  );
  const ownerKey = `${kind}_id`;
  const prefix = `${kind}_${slug}_`;
  let deleted = 0;

  for (const tableName of childTablesFor(kind, slug)) {
    const cols = columnsOf(tableName);
    const depth = tableName.startsWith(prefix)
      ? tableName.slice(prefix.length).split('_').length
      : 1;

    let statement;
    if (cols.has(ownerKey)) {
      statement = sql`DELETE FROM ${sql.identifier(tableName)} WHERE ${sql.identifier(ownerKey)} IN (${idList})`;
    } else if (depth <= 1 && cols.has('parent_id') && cols.has('parent_type')) {
      statement = sql`DELETE FROM ${sql.identifier(tableName)}
                      WHERE parent_id IN (${idList}) AND parent_type = ${kind}`;
    } else if (cols.has('parent_id')) {
      // Nested: its parent is a row in the table one level up, which still
      // exists because we delete deepest first.
      const parentTable = tableName.slice(0, tableName.lastIndexOf('_'));
      if (!(schema as any)[parentTable] || !columnsOf(parentTable).has(ownerKey)) continue;
      statement = sql`DELETE FROM ${sql.identifier(tableName)}
                      WHERE parent_id IN (
                        SELECT id FROM ${sql.identifier(parentTable)}
                        WHERE ${sql.identifier(ownerKey)} IN (${idList})
                      )`;
    } else {
      continue;
    }

    const result: any = await db.run(statement);
    deleted += Number(result?.rowsAffected ?? result?.changes ?? 0);
  }

  return deleted;
}
