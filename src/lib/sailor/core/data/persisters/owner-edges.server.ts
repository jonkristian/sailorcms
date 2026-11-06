import { sql } from 'drizzle-orm';
import { generateUUID } from '../../utils/common';
import { getCurrentTimestampSeconds } from '../../utils/date';

/**
 * Replace one owner's many-to-many edges from the forward (owning) side.
 *
 * The picker's array order becomes `sort`, the owner's own sequence. Rows are
 * deleted and reinserted, but `inverse_sort` belongs to the *target* — "this
 * owner is Nth among everything pointing at the target", written by
 * `persistReverseRelations` — so it is carried across rather than reset to 0.
 * Resetting it moved an owner to the top of every target's list each time the
 * owner was saved, even with the relation untouched.
 *
 * A target new to this owner is appended after that target's existing owners,
 * mirroring how the reverse writer gives a new edge a tail `sort` — but only
 * when the target has an order at all. A target nobody has ordered has every
 * edge at 0, which readers break by the owner's own `sort`; appending there
 * would quietly switch it to attach order.
 */
export async function replaceOwnerEdges(
  tx: any,
  junctionTableName: string,
  ownerKey: 'collection_id' | 'global_id' | 'block_id',
  ownerId: string,
  items: unknown[]
): Promise<void> {
  const junction = sql.identifier(junctionTableName);
  const ownerColumn = sql.identifier(ownerKey);

  const existing = await tx.run(
    sql`SELECT target_id, inverse_sort FROM ${junction} WHERE ${ownerColumn} = ${ownerId}`
  );
  const inverseSortByTarget = new Map<string, number>(
    (existing.rows || []).map((row: any) => [row.target_id, Number(row.inverse_sort ?? 0)])
  );

  await tx.run(sql`DELETE FROM ${junction} WHERE ${ownerColumn} = ${ownerId}`);

  let sort = 0;
  for (const item of items) {
    const rawId = item && typeof item === 'object' ? (item as any).id : item;
    if (rawId === null || rawId === undefined || rawId === '') continue;
    const targetId = String(rawId);

    let inverseSort = inverseSortByTarget.get(targetId);
    if (inverseSort === undefined) {
      const tail = await tx.run(
        sql`SELECT MAX(inverse_sort) AS top FROM ${junction} WHERE target_id = ${targetId}`
      );
      const top = Number(tail.rows?.[0]?.top ?? 0);
      inverseSort = top > 0 ? top + 1 : 0;
    }

    const now = getCurrentTimestampSeconds();
    await tx.run(
      sql`INSERT INTO ${junction} (id, ${ownerColumn}, target_id, sort, inverse_sort, created_at, updated_at)
          VALUES (${generateUUID()}, ${ownerId}, ${targetId}, ${sort}, ${inverseSort}, ${now}, ${now})`
    );
    sort++;
  }
}
