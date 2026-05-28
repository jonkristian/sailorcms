// Shared helper for "give me the editable title / updated_at / last_modified_by
// of a collection or global row" without rewriting the localized split each
// time. For non-localized entities the columns live on the main table; for
// localized ones the editable copies live on `_locales` and main's columns
// are vestigial (nullable post-additive-flip). Callers compose this into
// their own SELECT — the helper just returns the JOIN setup and column
// expressions so list pages, recovery views, dashboard activity feeds and
// future audit surfaces don't all re-derive the rule.
//
// Usage:
//
//   const join = entityLabelJoin('collection', slug);
//   let q = db.select({ id: table.id, title: join.title, updated_at: join.updated_at }).from(table);
//   if (join.localesTable && join.joinCondition) {
//     q = q.leftJoin(join.localesTable, join.joinCondition);
//   }
//   q = q.where(...).orderBy(desc(join.updated_at));
//
// The `title`, `updated_at` and `last_modified_by` properties are safe to drop
// into selects / orderBy in both modes — `COALESCE(locales.col, main.col)`
// when localized, the plain main column when not.

import { and, eq, sql, type SQL } from 'drizzle-orm';
import * as schema from '$sailor/generated/schema';
import { fieldConfigurations } from '$sailor/generated/fields';
import { getContentSettings } from './collections';

export type EntityKind = 'collection' | 'global';

export interface EntityLabelJoin {
  /** Main table reference, or `null` if the slug doesn't resolve. */
  table: any;
  /** True when the template declares `localized: true`. */
  isLocalized: boolean;
  /** `_locales` sibling table, or `null` for non-localized. */
  localesTable: any | null;
  /** Default content locale used for the JOIN, or `null` if not configured. */
  defaultLocale: string | null;
  /** FK column name on `_locales` pointing back to main (e.g. `posts_id`). */
  fkField: string;
  /**
   * JOIN condition for the localized sibling — pass to `.leftJoin(localesTable, joinCondition)`.
   * `null` when there's no sibling to join (non-localized, or default locale not set).
   */
  joinCondition: SQL | null;
  /** Title column expression: COALESCE'd when localized, plain otherwise. */
  title: SQL | any;
  /** updated_at expression with the same COALESCE treatment. */
  updated_at: SQL | any;
  /** last_modified_by expression with the same COALESCE treatment. */
  last_modified_by: SQL | any;
}

function isLocalizedEntity(kind: EntityKind, slug: string): boolean {
  const cfg = fieldConfigurations as any;
  return kind === 'collection'
    ? cfg.collections?.[slug]?.localized === true
    : cfg.globals?.[slug]?.localized === true;
}

export function entityLabelJoin(kind: EntityKind, slug: string): EntityLabelJoin {
  const tableKey = `${kind}_${slug}` as keyof typeof schema;
  const table = (schema as any)[tableKey] ?? null;
  if (!table) {
    return {
      table: null,
      isLocalized: false,
      localesTable: null,
      defaultLocale: null,
      fkField: `${slug}_id`,
      joinCondition: null,
      title: sql<string | null>`NULL`,
      updated_at: sql<Date | null>`NULL`,
      last_modified_by: sql<string | null>`NULL`
    };
  }

  const isLocalized = isLocalizedEntity(kind, slug);
  const localesTable = isLocalized
    ? ((schema as any)[`${tableKey}_locales` as keyof typeof schema] ?? null)
    : null;
  const defaultLocale = isLocalized ? (getContentSettings().defaultLocale ?? null) : null;
  const fkField = `${slug}_id`;

  const canJoin = !!(localesTable && defaultLocale);

  // Non-localized: read from main. Localized + can-join: read from `_locales`
  // directly (don't COALESCE down to main — those columns may have been
  // dropped by `doctor --fix`, which would break the SQL).
  const titleCol = canJoin ? localesTable.title : (table.title ?? sql<string | null>`NULL`);
  const updatedCol = canJoin
    ? localesTable.updated_at
    : (table.updated_at ?? sql<Date | null>`NULL`);
  const lastModifiedCol = canJoin
    ? localesTable.last_modified_by
    : (table.last_modified_by ?? sql<string | null>`NULL`);

  return {
    table,
    isLocalized,
    localesTable,
    defaultLocale,
    fkField,
    joinCondition: canJoin
      ? and(eq(localesTable[fkField], table.id), eq(localesTable.locale, defaultLocale))!
      : null,
    title: titleCol,
    updated_at: updatedCol,
    last_modified_by: lastModifiedCol
  };
}
