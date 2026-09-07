import { sql } from 'drizzle-orm';
import * as schema from '$sailor/generated/schema';
import { forwardRelations } from '$sailor/generated/relations';
import { generateUUID } from '../../utils/common';
import { getCurrentTimestampSeconds } from '../../utils/date';
import { log } from '../../utils/logger';

/**
 * Persist `reverse` fields — edits made from the side that does not declare the
 * relation.
 *
 * Writes go to the junction the forward side already owns, so there is still
 * one edge set. Three things make this different from the forward writer:
 *
 * - It reconciles by `target_id` (this item) rather than deleting everything
 *   for an owner. Deleting by owner here would wipe that owner's edges to
 *   *other* targets.
 * - Order is written to `inverse_sort`, this side's sequence. The owner's
 *   `sort` is never touched, because it means something different.
 * - A new edge still needs a `sort` for the owner's own list, so it appends
 *   after whatever that owner already has rather than colliding on 0.
 */
export async function persistReverseRelations(
  tx: any,
  ownerFields: Record<string, any>,
  itemId: string,
  data: Record<string, any>
): Promise<void> {
  for (const [fieldName, fieldDef] of Object.entries(ownerFields)) {
    const def = fieldDef as any;
    if (def?.type !== 'reverse' || def?.reverse?.editable === false) continue;
    if (!(fieldName in data)) continue;

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

    if (!relation || !(schema as any)[relation.junction]) {
      log.warn(`Reverse field '${fieldName}' did not resolve; skipping write.`);
      continue;
    }

    const raw = (data as any)[fieldName];
    const wanted: string[] = (Array.isArray(raw) ? raw : [])
      .map((entry: any) => (entry && typeof entry === 'object' ? entry.id : entry))
      .filter(Boolean);

    const junction = sql.identifier(relation.junction);
    const ownerKey = sql.identifier(relation.ownerKey);

    // `before` must be what the *reader* surfaced, not every row on the
    // junction. `loadReverseRelations` joins the owner table and applies
    // `liveOnly`, so a soft-deleted or orphaned owner is invisible in the
    // editor — and anything invisible would otherwise look like "the editor
    // removed it" and be deleted on the next save. Trashing a product,
    // reordering its category and restoring would have returned it with no
    // category, silently.
    //
    // Matching the reader's filter here also means orphaned edges are left
    // alone rather than quietly swept up on every save; cleaning those up is a
    // separate, visible job.
    const ownerTableName = `${relation.ownerType}_${relation.ownerSlug}`;
    const ownerTable = (schema as any)[ownerTableName];
    const visible = ownerTable?.deleted_at
      ? await tx.run(
          sql`SELECT j.${ownerKey} AS owner_id
              FROM ${junction} AS j
              JOIN ${sql.identifier(ownerTableName)} AS o ON o.id = j.${ownerKey}
              WHERE j.target_id = ${itemId} AND o.deleted_at IS NULL`
        )
      : await tx.run(
          sql`SELECT j.${ownerKey} AS owner_id
              FROM ${junction} AS j
              JOIN ${sql.identifier(ownerTableName)} AS o ON o.id = j.${ownerKey}
              WHERE j.target_id = ${itemId}`
        );
    const before: string[] = (visible.rows || []).map((row: any) => row.owner_id);

    // Detach only what this side removed, and only what it could see.
    const removed = before.filter((id) => !wanted.includes(id));
    if (removed.length > 0) {
      await tx.run(
        sql`DELETE FROM ${junction} WHERE target_id = ${itemId} AND ${ownerKey} IN (${sql.join(
          removed.map((id) => sql`${id}`),
          sql`, `
        )})`
      );
    }

    for (const [position, ownerId] of wanted.entries()) {
      if (before.includes(ownerId)) {
        await tx.run(
          sql`UPDATE ${junction} SET inverse_sort = ${position}, updated_at = ${getCurrentTimestampSeconds()}
              WHERE target_id = ${itemId} AND ${ownerKey} = ${ownerId}`
        );
        continue;
      }

      // New edge. It also joins the owner's own list, so give it a `sort` that
      // appends rather than tying at 0 with the owner's existing entries.
      const tail = await tx.run(
        sql`SELECT COALESCE(MAX(sort), -1) + 1 AS next FROM ${junction} WHERE ${ownerKey} = ${ownerId}`
      );
      const nextSort = Number(tail.rows?.[0]?.next ?? 0);

      await tx.run(
        sql`INSERT INTO ${junction} (id, ${ownerKey}, target_id, sort, inverse_sort, created_at, updated_at)
            VALUES (${generateUUID()}, ${ownerId}, ${itemId}, ${nextSort}, ${position}, ${getCurrentTimestampSeconds()}, ${getCurrentTimestampSeconds()})`
      );
    }
  }
}
