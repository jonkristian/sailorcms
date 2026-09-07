import { db } from 'sailorcms/core/db/index.server';
import { and, asc, eq, inArray, type SQL, sql } from 'drizzle-orm';
import * as schema from '$sailor/generated/schema';
import { forwardRelations } from '$sailor/generated/relations';
import { liveOnly } from 'sailorcms/core/db/soft-delete';
import { log } from 'sailorcms/core/utils/logger';
import type { RelationStatus } from './relation-loader';

function statusOnly(table: any, status: RelationStatus): SQL {
  if (status === 'all') return sql`1 = 1`;
  if (table?.status === undefined) return sql`1 = 1`;
  return eq(table.status, status);
}

/**
 * Resolve `reverse` fields — a read of an existing relation from the side that
 * does not declare it.
 *
 * The forward side owns the junction; this walks the same rows in the other
 * direction, so there is exactly one edge set. Ordering comes from
 * `inverse_sort` (the target's order of its owners) rather than `sort`, which
 * belongs to the owner and means something different. Until a reverse-side
 * editor writes it, every row ties at 0 and the owner's own `sort` decides,
 * which is the pre-existing behaviour.
 *
 * Deliberately not recursive: a reverse field is never followed from inside
 * another one. Two entities each declaring a reverse view of the other is a
 * cycle, and unlike the forward loader there is no depth worth spending here —
 * the panel wants the related rows, not their relations.
 */
/**
 * `limit` is a read-side cap, and applying it to an editable field would lose
 * data: the editor submits exactly what it was handed, and the writer detaches
 * every edge missing from that list. A `limit: 10` on a 50-edge item would
 * delete the other 40 the first time someone opened it and pressed Save.
 */
function readLimit(spec: any): number | undefined {
  if (!spec?.limit) return undefined;
  return spec.editable === false ? spec.limit : undefined;
}

export async function loadReverseRelations(
  item: any,
  itemProperties: Record<string, any>,
  status: RelationStatus = 'published'
): Promise<void> {
  for (const [fieldName, fieldDef] of Object.entries(itemProperties)) {
    const def = fieldDef as any;
    if (def?.type !== 'reverse') continue;

    const spec = def.reverse ?? {};
    const fromType = spec.fromCollection
      ? 'collection'
      : spec.fromGlobal
        ? 'global'
        : spec.fromBlock
          ? 'block'
          : null;
    const fromSlug = spec.fromCollection || spec.fromGlobal || spec.fromBlock;

    // The generator validates these pairs, so a miss here means the templates
    // changed without a regenerate.
    const relation =
      fromType && fromSlug && spec.field
        ? forwardRelations[`${fromType}:${fromSlug}:${spec.field}`]
        : undefined;

    if (!relation) {
      log.warn(
        `Reverse field '${fieldName}' does not resolve to a known relation. Run 'npx sailor db:update'.`
      );
      item[fieldName] = [];
      continue;
    }

    const junction = (schema as any)[relation.junction];
    const ownerTableName = `${relation.ownerType}_${relation.ownerSlug}`;
    const ownerTable = (schema as any)[ownerTableName];

    if (!junction || !ownerTable) {
      log.warn(
        `Reverse field '${fieldName}': '${relation.junction}' or '${ownerTableName}' missing from schema. Run 'npx sailor db:update'.`
      );
      item[fieldName] = [];
      continue;
    }

    try {
      // For a localized owner the junction's owner column holds the `_locales`
      // row id, so this join would miss. Reverse views of localized owners are
      // not supported yet; the forward direction is unaffected.
      const query = db
        .select()
        .from(ownerTable)
        .innerJoin(junction, eq(ownerTable.id, junction[relation.ownerKey]))
        .where(
          and(eq(junction.target_id, item.id), liveOnly(ownerTable), statusOnly(ownerTable, status))
        )
        .orderBy(asc(junction.inverse_sort), asc(ownerTable.sort));

      const cap = readLimit(spec);
      const rows = await (cap ? query.limit(cap) : query);
      item[fieldName] = rows.map((row: any) => row[ownerTableName] ?? row);
    } catch (error) {
      log.error(`Failed to load reverse field '${fieldName}'`, {}, error as Error);
      item[fieldName] = [];
    }
  }
}

/**
 * Bulk variant for list views: one query per reverse field for every row,
 * rather than one per row. A list resolving reverse relations row-by-row is an
 * N+1 by construction, which is why the design notes say to keep it off lists
 * entirely — grouping the query removes the reason for that rule.
 */
export async function loadReverseRelationsForOwners(
  items: any[],
  itemProperties: Record<string, any>,
  status: RelationStatus = 'published'
): Promise<void> {
  if (items.length === 0) return;
  const targetIds = items.map((item) => item.id).filter(Boolean);
  if (targetIds.length === 0) return;

  for (const [fieldName, fieldDef] of Object.entries(itemProperties)) {
    const def = fieldDef as any;
    if (def?.type !== 'reverse') continue;

    const spec = def.reverse ?? {};
    const fromType = spec.fromCollection
      ? 'collection'
      : spec.fromGlobal
        ? 'global'
        : spec.fromBlock
          ? 'block'
          : null;
    const fromSlug = spec.fromCollection || spec.fromGlobal || spec.fromBlock;
    const relation =
      fromType && fromSlug && spec.field
        ? forwardRelations[`${fromType}:${fromSlug}:${spec.field}`]
        : undefined;

    if (!relation) {
      for (const item of items) item[fieldName] = [];
      continue;
    }

    const junction = (schema as any)[relation.junction];
    const ownerTableName = `${relation.ownerType}_${relation.ownerSlug}`;
    const ownerTable = (schema as any)[ownerTableName];
    if (!junction || !ownerTable) {
      for (const item of items) item[fieldName] = [];
      continue;
    }

    try {
      // Projected, unlike the single-item loader. A list renders counts and
      // labels, so selecting whole owner rows drags every wysiwyg body into the
      // page payload — measured at ~93 KB of `content` across 62 products to
      // render 18 numbers, and it scales with the catalogue rather than the
      // list. Columns are picked defensively: not every owner table has all of
      // them.
      const columns: Record<string, any> = { id: ownerTable.id };
      for (const name of ['title', 'slug', 'status', 'sort']) {
        if (ownerTable[name] !== undefined) columns[name] = ownerTable[name];
      }
      columns.__target = junction.target_id;

      const rows = await db
        .select(columns)
        .from(ownerTable)
        .innerJoin(junction, eq(ownerTable.id, junction[relation.ownerKey]))
        .where(
          and(
            inArray(junction.target_id, targetIds),
            liveOnly(ownerTable),
            statusOnly(ownerTable, status)
          )
        )
        .orderBy(asc(junction.inverse_sort), asc(ownerTable.sort));

      const byTarget = new Map<string, any[]>();
      for (const row of rows as any[]) {
        const { __target: targetId, ...owner } = row;
        if (!targetId) continue;
        const bucket = byTarget.get(targetId);
        if (bucket) bucket.push(owner);
        else byTarget.set(targetId, [owner]);
      }

      for (const item of items) {
        const found = byTarget.get(item.id) ?? [];
        const cap = readLimit(spec);
        item[fieldName] = cap ? found.slice(0, cap) : found;
      }
    } catch (error) {
      log.error(`Failed to load reverse field '${fieldName}' for list`, {}, error as Error);
      for (const item of items) item[fieldName] = [];
    }
  }
}
