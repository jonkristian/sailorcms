import { eq } from 'drizzle-orm';
import { db } from '$sailor/core/db/index.server';

type SlugTable = { id: any; slug: any };
type Executor = { select: typeof db.select };

/**
 * Find a non-colliding slug on a table by appending -2, -3, etc.
 * Pass `tx` when calling inside a Drizzle transaction; otherwise the global db is used.
 * Pass `excludeId` to ignore a row matching that id (e.g. when updating an existing item).
 */
export async function ensureUniqueSlug({
  table,
  slug,
  excludeId,
  tx
}: {
  table: SlugTable;
  slug: string;
  excludeId?: string | null;
  tx?: Executor;
}): Promise<string> {
  if (!slug || !table?.slug) return slug;

  const exec = tx ?? db;
  let candidate = slug;
  let counter = 2;

  while (counter < 1000) {
    const existing = await exec
      .select({ id: table.id })
      .from(table as any)
      .where(eq(table.slug, candidate))
      .limit(1);

    if (existing.length === 0 || (excludeId && existing[0].id === excludeId)) {
      return candidate;
    }

    candidate = `${slug}-${counter}`;
    counter++;
  }

  return candidate;
}
