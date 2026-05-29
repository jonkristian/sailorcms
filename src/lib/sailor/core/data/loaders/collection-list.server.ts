// Collection-list loader for the admin list page.
//
// Reads paginated items for a collection (localized + non-localized). For
// localized collections, JOINs the `_locales` table at the project's default
// locale so editable fields (title, slug, status, sort, parent_id) come
// through. Per-locale switching in the list itself is a polish step.
//
// Returns a flat row shape the existing Svelte components (TableView,
// RepeatableNestedView, etc.) consume without changes.

import { db } from '../../db/index.server';
import { eq, desc, asc, count, and, or, sql, inArray } from 'drizzle-orm';
import * as schema from '$sailor/generated/schema';
import { fieldConfigurations } from '$sailor/generated/fields';
import { getContentSettings } from '../../settings/i18n';
import { liveOnly } from '../../db/soft-delete';
import type { Pagination } from '../../types';

export interface LoadCollectionListOptions {
  slug: string;
  page?: number;
  pageSize?: number;
  searchQuery?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface LoadCollectionListResult {
  collectionType: {
    id: string;
    name: { singular: string; plural: string };
    slug: string;
    description: string | undefined;
    fields: Record<string, any>;
    options: Record<string, any>;
    created_at: Date;
    updated_at: Date;
  };
  items: any[];
  pagination: Pagination;
}

export async function loadCollectionList(
  opts: LoadCollectionListOptions
): Promise<LoadCollectionListResult> {
  const { slug } = opts;

  // Get the collection type
  const collectionTypeRow = await db.query.collectionTypes.findFirst({
    where: eq(schema.collectionTypes.slug, slug)
  });

  if (!collectionTypeRow) {
    const err = new Error('Collection not found') as Error & { notFound?: boolean };
    err.notFound = true;
    throw err;
  }

  const options = JSON.parse(collectionTypeRow.options || '{}');
  const collectionType = {
    id: collectionTypeRow.id,
    name: {
      singular: collectionTypeRow.name_singular,
      plural: collectionTypeRow.name_plural
    },
    slug: collectionTypeRow.slug,
    // Convert null → undefined to match the optional shape consumed by Svelte
    // components (Header expects `string | undefined`, not `string | null`).
    description: collectionTypeRow.description ?? undefined,
    fields: JSON.parse(collectionTypeRow.schema),
    options,
    created_at: collectionTypeRow.created_at,
    updated_at: collectionTypeRow.updated_at
  };

  // Resolved options with defaults that mirror the original route logic.
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.max(1, Math.min(100, opts.pageSize ?? 20));
  const searchQuery = opts.searchQuery?.trim() ?? '';
  const sortBy = opts.sortBy ?? (options.sortable ? 'sort' : 'updated_at');
  const sortOrder = opts.sortOrder ?? (options.sortable && !opts.sortBy ? 'asc' : 'desc');

  const collectionTable = schema[`collection_${slug}` as keyof typeof schema];
  if (!collectionTable) {
    const err = new Error(`Collection table for '${slug}' not found`) as Error & {
      notFound?: boolean;
    };
    err.notFound = true;
    throw err;
  }

  const isLocalized = (fieldConfigurations as any).collections?.[slug]?.localized === true;

  if (isLocalized) {
    return await loadLocalizedList({
      slug,
      collectionType,
      collectionTable,
      options,
      page,
      pageSize,
      searchQuery,
      sortBy,
      sortOrder
    });
  }

  // ── Non-localized path ────────────────────────────────────────────────
  const whereConditions: any[] = [liveOnly(collectionTable)];

  // For nestable collections with no search, only paginate top-level items
  // (parent_id is null, empty string, or invalid values like '[]'). When
  // searching, we want to find all matching items regardless of hierarchy.
  if (options.nestable && !searchQuery) {
    whereConditions.push(
      or(
        sql`${(collectionTable as any).parent_id} IS NULL`,
        sql`${(collectionTable as any).parent_id} = ''`,
        sql`${(collectionTable as any).parent_id} = '[]'`
      )
    );
  }

  if (searchQuery) {
    whereConditions.push(
      or(
        sql`lower(${(collectionTable as any).title}) like lower(${`%${searchQuery}%`})`,
        sql`lower(${(collectionTable as any).slug}) like lower(${`%${searchQuery}%`})`
      )
    );
  }

  const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined;

  const selectShape = {
    id: (collectionTable as any).id,
    title: (collectionTable as any).title,
    slug: (collectionTable as any).slug,
    status: (collectionTable as any).status,
    updated_at: (collectionTable as any).updated_at,
    created_at: (collectionTable as any).created_at,
    sort: (collectionTable as any).sort,
    parent_id: (collectionTable as any).parent_id,
    author: (collectionTable as any).author,
    author_name: schema.users.name,
    author_email: schema.users.email
  };

  const baseQuery = () =>
    db
      .select(selectShape)
      .from(collectionTable)
      .leftJoin(schema.users, eq((collectionTable as any).author, schema.users.id));

  let items: any[];
  let totalItems: number;
  let totalPages: number;
  let validPage: number;

  if (options.nestable && !searchQuery) {
    // Paginate top-level items, then fetch all descendants for those items
    // (recursive, breadth-first).
    const [countResult, topLevelResult] = await Promise.all([
      db.select({ total: count() }).from(collectionTable).where(whereClause),
      baseQuery()
        .where(whereClause)
        .orderBy(
          sortOrder === 'asc'
            ? asc((collectionTable as any)[sortBy])
            : desc((collectionTable as any)[sortBy])
        )
        .limit(pageSize)
        .offset((page - 1) * pageSize)
    ]);

    totalItems = Number(countResult[0]?.total || 0);
    totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    validPage = totalPages > 0 ? Math.min(page, totalPages) : 1;

    if (topLevelResult.length > 0) {
      const topLevelIds = topLevelResult.map((item: any) => item.id);
      const allDescendants: any[] = [];
      let currentLevelIds = [...topLevelIds];

      while (currentLevelIds.length > 0) {
        const childrenResult = await baseQuery()
          .where(
            and(
              liveOnly(collectionTable),
              inArray((collectionTable as any).parent_id, currentLevelIds)
            )
          )
          .orderBy(asc((collectionTable as any).sort));

        if (childrenResult.length === 0) break;

        allDescendants.push(...childrenResult);
        currentLevelIds = childrenResult.map((item: any) => item.id);
      }

      items = [...topLevelResult, ...allDescendants];
    } else {
      items = topLevelResult;
    }
  } else {
    // Flat pagination for non-nestable collections (or nestable + search).
    const [countResult, result] = await Promise.all([
      db.select({ total: count() }).from(collectionTable).where(whereClause),
      baseQuery()
        .where(whereClause)
        .orderBy(
          sortOrder === 'asc'
            ? asc((collectionTable as any)[sortBy])
            : desc((collectionTable as any)[sortBy])
        )
        .limit(pageSize)
        .offset((page - 1) * pageSize)
    ]);

    totalItems = Number(countResult[0]?.total || 0);
    totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    validPage = totalPages > 0 ? Math.min(page, totalPages) : 1;
    items = result;
  }

  return {
    collectionType,
    items,
    pagination: {
      page: validPage,
      pageSize,
      totalItems,
      totalPages,
      hasNextPage: validPage < totalPages,
      hasPreviousPage: validPage > 1
    } as Pagination
  };
}

/**
 * Localized variant: JOINs `<slug>_locales` at the project's default locale.
 * `id` + `author` + `created_at` come from main; everything else comes from
 * locales (title, slug, status, sort, parent_id, updated_at). Returns the
 * same flat row shape so the Svelte components stay unchanged.
 *
 * v1 limitation: only the default locale's row is shown per item.
 */
async function loadLocalizedList({
  slug,
  collectionType,
  collectionTable,
  options,
  page,
  pageSize,
  searchQuery,
  sortBy,
  sortOrder
}: {
  slug: string;
  collectionType: LoadCollectionListResult['collectionType'];
  collectionTable: any;
  options: any;
  page: number;
  pageSize: number;
  searchQuery: string;
  sortBy: string;
  sortOrder: string;
}): Promise<LoadCollectionListResult> {
  const localesTable = schema[`collection_${slug}_locales` as keyof typeof schema] as any;
  if (!localesTable) {
    throw new Error(
      `Localized collection '${slug}' missing locales table — run 'npx sailor db:update'`
    );
  }

  const { defaultLocale } = getContentSettings();
  if (!defaultLocale) {
    throw new Error(
      `Localized collection '${slug}' needs content.i18n.default set in templates/settings.ts`
    );
  }

  const fkField = `${slug}_id`;

  // WHERE: soft-delete on main, locale match on locales. Search and
  // parent-null filter both target locales (slug/title/parent_id live there).
  const whereConditions: any[] = [
    liveOnly(collectionTable),
    eq(localesTable.locale, defaultLocale)
  ];

  if (options.nestable && !searchQuery) {
    whereConditions.push(
      or(
        sql`${localesTable.parent_id} IS NULL`,
        sql`${localesTable.parent_id} = ''`,
        sql`${localesTable.parent_id} = '[]'`
      )
    );
  }

  if (searchQuery) {
    whereConditions.push(
      or(
        sql`lower(${localesTable.title}) like lower(${`%${searchQuery}%`})`,
        sql`lower(${localesTable.slug}) like lower(${`%${searchQuery}%`})`
      )
    );
  }

  const whereClause = and(...whereConditions);

  // Sort column: prefer `_locales` (canonical for localized columns), fall
  // back to main for identity-only columns like `created_at`. Inverted from
  // "main first" because doctor --fix drops shadowed main columns — Drizzle's
  // schema view still lists them, so the old "main first" lookup resolved to
  // a column that no longer exists in the DB.
  const sortCol = localesTable[sortBy] ?? (collectionTable as any)[sortBy];
  const orderBy = sortCol
    ? sortOrder === 'asc'
      ? asc(sortCol)
      : desc(sortCol)
    : desc((collectionTable as any).created_at);

  const selectShape = {
    id: (collectionTable as any).id,
    title: localesTable.title,
    slug: localesTable.slug,
    status: localesTable.status,
    updated_at: localesTable.updated_at,
    created_at: (collectionTable as any).created_at,
    sort: localesTable.sort,
    parent_id: localesTable.parent_id,
    author: (collectionTable as any).author,
    author_name: schema.users.name,
    author_email: schema.users.email
  };

  const baseQuery = () =>
    db
      .select(selectShape)
      .from(collectionTable)
      .innerJoin(localesTable, eq(localesTable[fkField], (collectionTable as any).id))
      .leftJoin(schema.users, eq((collectionTable as any).author, schema.users.id));

  let items: any[];
  let totalItems: number;
  let totalPages: number;
  let validPage: number;

  if (options.nestable && !searchQuery) {
    const [countResult, topLevelResult] = await Promise.all([
      db
        .select({ total: count() })
        .from(collectionTable)
        .innerJoin(localesTable, eq(localesTable[fkField], (collectionTable as any).id))
        .where(whereClause),
      baseQuery()
        .where(whereClause)
        .orderBy(orderBy)
        .limit(pageSize)
        .offset((page - 1) * pageSize)
    ]);

    totalItems = Number(countResult[0]?.total || 0);
    totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    validPage = totalPages > 0 ? Math.min(page, totalPages) : 1;

    if (topLevelResult.length > 0) {
      const topLevelIds = topLevelResult.map((item: any) => item.id);
      const allDescendants: any[] = [];
      let currentLevelIds = [...topLevelIds];

      while (currentLevelIds.length > 0) {
        const childrenResult = await baseQuery()
          .where(
            and(
              liveOnly(collectionTable),
              eq(localesTable.locale, defaultLocale),
              inArray(localesTable.parent_id, currentLevelIds)
            )
          )
          .orderBy(asc(localesTable.sort));

        if (childrenResult.length === 0) break;

        allDescendants.push(...childrenResult);
        currentLevelIds = childrenResult.map((item: any) => item.id);
      }

      items = [...topLevelResult, ...allDescendants];
    } else {
      items = topLevelResult;
    }
  } else {
    const [countResult, result] = await Promise.all([
      db
        .select({ total: count() })
        .from(collectionTable)
        .innerJoin(localesTable, eq(localesTable[fkField], (collectionTable as any).id))
        .where(whereClause),
      baseQuery()
        .where(whereClause)
        .orderBy(orderBy)
        .limit(pageSize)
        .offset((page - 1) * pageSize)
    ]);

    totalItems = Number(countResult[0]?.total || 0);
    totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    validPage = totalPages > 0 ? Math.min(page, totalPages) : 1;
    items = result;
  }

  return {
    collectionType,
    items,
    pagination: {
      page: validPage,
      pageSize,
      totalItems,
      totalPages,
      hasNextPage: validPage < totalPages,
      hasPreviousPage: validPage > 1
    } as Pagination
  };
}
