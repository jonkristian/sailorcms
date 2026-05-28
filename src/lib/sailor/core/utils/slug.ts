import { and, eq } from 'drizzle-orm';
import { db } from 'sailorcms/core/db/index.server';

type SlugTable = { id: any; slug: any; [key: string]: any };
type Executor = { select: typeof db.select };

/**
 * Find a non-colliding slug on a table by appending -2, -3, etc.
 * Pass `tx` when calling inside a Drizzle transaction; otherwise the global db is used.
 * Pass `excludeId` to ignore a row matching that id (e.g. when updating an existing item).
 *
 * For localized collections, slug uniqueness is scoped to a locale (composite
 * `(slug, locale)` unique on `<slug>_locales`). Pass `locale` + `localeColumn`
 * (typically `'locale'`) so EN slug='about' and NB slug='about' can coexist
 * but a second EN row with slug='about' still gets bumped to 'about-2'.
 */
export async function ensureUniqueSlug({
  table,
  slug,
  excludeId,
  tx,
  locale,
  localeColumn
}: {
  table: SlugTable;
  slug: string;
  excludeId?: string | null;
  tx?: Executor;
  locale?: string;
  localeColumn?: string;
}): Promise<string> {
  if (!slug || !table?.slug) return slug;

  const exec = tx ?? db;
  let candidate = slug;
  let counter = 2;
  const scopedToLocale = !!(locale && localeColumn && table[localeColumn]);

  while (counter < 1000) {
    const conditions = scopedToLocale
      ? and(eq(table.slug, candidate), eq(table[localeColumn!], locale!))
      : eq(table.slug, candidate);

    const existing = await exec
      .select({ id: table.id })
      .from(table as any)
      .where(conditions)
      .limit(1);

    if (existing.length === 0 || (excludeId && existing[0].id === excludeId)) {
      return candidate;
    }

    candidate = `${slug}-${counter}`;
    counter++;
  }

  return candidate;
}
