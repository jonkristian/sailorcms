import { isNull, sql, type SQL } from 'drizzle-orm';

/**
 * Returns a `deleted_at IS NULL` condition for any entity table.
 * Use to filter out soft-deleted rows from "live" reads.
 *
 * Tables without a `deleted_at` column (system/derived tables) get a no-op
 * (always-true) so this helper is safe to apply unconditionally.
 */
export function liveOnly(table: any): SQL {
  if (table?.deleted_at === undefined) return sql`1 = 1`;
  return isNull(table.deleted_at);
}
