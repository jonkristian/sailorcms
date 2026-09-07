import { command, query, getRequestEvent } from '$app/server';
import { db } from 'sailorcms/core/db/index.server';
import * as schema from '$sailor/generated/schema';
import { fieldConfigurations } from '$sailor/generated/fields';
import { getContentSettings } from 'sailorcms/core/settings/i18n';
import { liveOnly } from 'sailorcms/core/db/soft-delete';
import { and, asc, count, desc, eq, inArray, ne, sql } from 'drizzle-orm';

/**
 * The relation being edited, passed straight through from the field
 * definition. Taking the relation rather than a slug keeps the "is this a
 * global or a collection?" branch in one place instead of in every picker.
 */
export type RelationTarget = { targetGlobal?: string; targetCollection?: string };

const SLUG_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * Both endpoints read arbitrary collection/global rows by slug, so they gate on
 * the same `read`/`content` permission the admin content routes use. The older
 * `getGlobalItems` / `getCollectionItems` never did — worth revisiting, but a
 * searchable, paginated endpoint is a broader surface than a one-shot fetch.
 */
async function canReadContent(): Promise<boolean> {
  const { locals } = getRequestEvent();
  return await locals.security.hasPermission('read', 'content');
}

/**
 * Resolve a relation target to the tables its options live in.
 *
 * For localized entities `title` and `sort` live on `_locales` (and the main
 * table's copies may have been dropped by `doctor --fix`), so options are read
 * through a join at the default locale.
 */
function resolveTarget(target: RelationTarget) {
  const isGlobal = !!target?.targetGlobal;
  const slug = target?.targetGlobal || target?.targetCollection;
  if (!slug || !SLUG_PATTERN.test(slug)) return null;

  const prefix = isGlobal ? 'global' : 'collection';
  const mainTable = (schema as any)[`${prefix}_${slug}`];
  if (!mainTable) return null;

  const configKey = isGlobal ? 'globals' : 'collections';
  const isLocalized = (fieldConfigurations as any)[configKey]?.[slug]?.localized === true;
  const localesTable = isLocalized ? (schema as any)[`${prefix}_${slug}_locales`] : null;
  const defaultLocale = isLocalized ? getContentSettings().defaultLocale : null;
  const usesLocales = Boolean(isLocalized && localesTable && defaultLocale);

  return {
    slug,
    mainTable,
    localesTable,
    usesLocales,
    titleColumn: usesLocales ? localesTable.title : mainTable.title,
    sortColumn: usesLocales ? localesTable.sort : mainTable.sort,
    joinCondition: usesLocales
      ? and(eq(localesTable[`${slug}_id`], mainTable.id), eq(localesTable.locale, defaultLocale))
      : null
  };
}

/**
 * One page of selectable options for a relation field.
 *
 * Search and paging happen in SQL. The pickers used to fetch whole tables and
 * filter in the browser, which is fine for a handful of rows and quietly
 * terrible for a real catalogue.
 */
export const searchRelationOptions = query(
  'unchecked',
  async ({
    target,
    search,
    limit = 50,
    offset = 0,
    excludeId
  }: {
    target: RelationTarget;
    search?: string;
    limit?: number;
    offset?: number;
    /** Usually the item being edited, so it can't relate to itself. */
    excludeId?: string;
  }) => {
    try {
      if (!(await canReadContent())) return { success: false, error: 'Unauthorized' };

      const resolved = resolveTarget(target);
      if (!resolved) return { success: false, error: 'Unknown relation target' };

      const { mainTable, localesTable, usesLocales, titleColumn, sortColumn, joinCondition } =
        resolved;

      const conditions: any[] = [liveOnly(mainTable)];
      if (search?.trim()) {
        conditions.push(sql`lower(${titleColumn}) like lower(${`%${search.trim()}%`})`);
      }
      if (excludeId) conditions.push(ne(mainTable.id, excludeId));

      const safeLimit = Math.min(Math.max(limit, 1), 200);

      const rows = usesLocales
        ? await db
            .select({ id: mainTable.id, title: titleColumn, slug: mainTable.slug })
            .from(mainTable)
            .innerJoin(localesTable, joinCondition)
            .where(and(...conditions))
            .orderBy(asc(sortColumn), desc(mainTable.created_at))
            .limit(safeLimit)
            .offset(offset)
        : await db
            .select({ id: mainTable.id, title: titleColumn, slug: mainTable.slug })
            .from(mainTable)
            .where(and(...conditions))
            .orderBy(asc(sortColumn), desc(mainTable.created_at))
            .limit(safeLimit)
            .offset(offset);

      const totalRows = usesLocales
        ? await db
            .select({ value: count() })
            .from(mainTable)
            .innerJoin(localesTable, joinCondition)
            .where(and(...conditions))
        : await db
            .select({ value: count() })
            .from(mainTable)
            .where(and(...conditions));

      const total = Number(totalRows[0]?.value ?? 0);
      return {
        success: true,
        items: rows.map((row: any) => ({ id: row.id, title: row.title, slug: row.slug })),
        total,
        hasMore: offset + rows.length < total
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load relation options'
      };
    }
  }
);

/**
 * Titles for a known set of ids.
 *
 * A saved relation value carries bare ids, so a picker needs labels for
 * exactly those — without paging through the whole target table to find them.
 */
export const resolveRelationTitles = query(
  'unchecked',
  async ({ target, ids }: { target: RelationTarget; ids: string[] }) => {
    try {
      if (!Array.isArray(ids) || ids.length === 0) return { success: true, items: [] };
      if (!(await canReadContent())) return { success: false, error: 'Unauthorized' };

      const resolved = resolveTarget(target);
      if (!resolved) return { success: false, error: 'Unknown relation target' };

      const { mainTable, localesTable, usesLocales, titleColumn, joinCondition } = resolved;

      const rows = usesLocales
        ? await db
            .select({ id: mainTable.id, title: titleColumn })
            .from(mainTable)
            .innerJoin(localesTable, joinCondition)
            .where(inArray(mainTable.id, ids.slice(0, 500)))
        : await db
            .select({ id: mainTable.id, title: titleColumn })
            .from(mainTable)
            .where(inArray(mainTable.id, ids.slice(0, 500)));

      return { success: true, items: rows.map((r: any) => ({ id: r.id, title: r.title })) };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to resolve relation titles'
      };
    }
  }
);

export const getRelationItem = command(
  'unchecked',
  async ({ scope, slug, id }: { scope: 'global' | 'collection'; slug: string; id: string }) => {
    try {
      if (!id || !slug || (scope !== 'global' && scope !== 'collection')) {
        return { success: false, error: 'Invalid parameters' };
      }

      const tableName = `${scope}_${slug}`;
      const table = (schema as any)[tableName];

      if (table) {
        const rows = await db
          .select({ id: (table as any).id, title: (table as any).title })
          .from(table)
          .where(sql`${(table as any).id} = ${id}`)
          .limit(1);
        const row = rows[0];
        if (!row) return { success: true, item: null };
        return { success: true, item: { id: row.id, title: row.title } };
      }

      // Fallback to raw SQL for dynamic table name if not in schema map
      const result = await db.run(
        sql`SELECT id, title FROM ${sql.identifier(tableName)} WHERE id = ${id} LIMIT 1`
      );
      const row = result.rows[0];
      if (!row) return { success: true, item: null };
      return { success: true, item: { id: row.id, title: row.title } };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load relation item'
      };
    }
  }
);
