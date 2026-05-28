import { db } from 'sailorcms/core/db/index.server';
import { sql, ne, eq, and, asc, desc, count, inArray } from 'drizzle-orm';
import { liveOnly } from 'sailorcms/core/db/soft-delete';
import { loadBlocksForCollection, type BlockWithRelations } from './blocks';
import { toSnakeCase } from 'sailorcms/core/utils/string';
import type { CollectionTypes } from '$sailor/generated/types';
import type { Pagination } from 'sailorcms/core/types';
import type { BreadcrumbItem } from '../types';
import { getCollectionType } from 'sailorcms/core/utils/db.server';
import * as schema from '$sailor/generated/schema';
import { fieldConfigurations } from '$sailor/generated/fields';
import * as generatedSettings from '$sailor/generated/settings';
import { getGlobals } from './globals';
import { loadFileFields } from './loaders/file-loader';
import { loadArrayFields } from './loaders/array-loader';
import {
  loadOneToXRelations,
  loadManyToManyRelations,
  type RelationStatus
} from './loaders/relation-loader';
import { assertAccess, AccessDeniedError } from './access';
import { parseDate, groupItemsByField } from './internal';
import { TagService } from 'sailorcms/core/services/tag.server';

/**
 * True if the consumer marked this collection `localized: true` in its
 * template. Read at runtime from the generated `fields.ts` so the read path
 * branches without re-parsing templates.
 */
function isLocalizedCollection(slug: string): boolean {
  return (fieldConfigurations as any).collections?.[slug]?.localized === true;
}

/**
 * Resolve the project's content i18n config from `templates/settings.ts`.
 * Sync read of the generated module — no DB hit, no async cost per read.
 *
 * Content locales are deliberately decoupled from paraglide's admin-UI
 * locales: a project can run the admin in English while authoring content
 * in 10 languages, or vice versa. So both `locales` and `defaultLocale`
 * must come from `content` in settings — there's no paraglide fallback.
 * Read paths fail loud when `localized: true` is used without these set.
 *
 * Exported (not just file-local) so admin route loaders use the same
 * resolution rules — keeps the localized read shape consistent everywhere.
 */
export function getContentSettings() {
  const s = (generatedSettings as any).settings?.content ?? {};
  return {
    locales: s.locales as string[] | undefined,
    defaultLocale: s.defaultLocale as string | undefined,
    fallback: (s.fallback as 'default' | 'strict' | undefined) ?? 'default'
  };
}

/**
 * Load all fields (files, arrays, relations) for a collection
 * Collection-specific implementation that knows about collection table naming conventions
 */
async function loadCollectionFields(
  collection: any,
  collectionSlug: string,
  collectionSchema: Record<string, any>,
  loadFullFileObjects: boolean = false,
  status: RelationStatus = 'published'
): Promise<void> {
  // Child tables (files, arrays, junctions) anchor on `collection_<slug>`
  // regardless of `localized` — the generator keeps the same names for both
  // modes so a non-localized → localized flip doesn't rename tables. For
  // localized rows the FK columns (`parent_id`, `collection_id`) point at
  // the `_locales` row id, which loaders pass in as `_localeId`.
  const tablePrefix = `collection_${collectionSlug}`;
  const junctionPrefix = collectionSlug;

  // Load file fields
  await loadFileFields(collection, collectionSchema, tablePrefix, loadFullFileObjects);

  // Load array fields
  await loadArrayFields(
    collection,
    collectionSchema,
    tablePrefix,
    'collection_id',
    loadFullFileObjects,
    status
  );

  // Load one-to-one and one-to-many relations
  await loadOneToXRelations(collection, collectionSchema, loadFullFileObjects, status);

  // Load many-to-many relations
  await loadManyToManyRelations(
    collection,
    collectionSchema,
    junctionPrefix,
    'collection_id',
    loadFullFileObjects,
    status
  );

  // Tags live in `taggables` under `taggable_type = 'collection_<slug>'`
  // for both localized and non-localized. The `taggable_id` references the
  // `_locales` row id for localized (each translation owns its tags) or
  // main.id otherwise — both come from `randomUUID()`, so the (type,id)
  // pair stays unique without a per-mode type discriminator.
  const tagFieldNames = Object.entries(collectionSchema)
    .filter(([, fieldDef]) => (fieldDef as any)?.type === 'tags')
    .map(([name]) => name);
  if (tagFieldNames.length > 0) {
    try {
      const taggableType = tablePrefix;
      const taggableId = (collection as any)._localeId ?? collection.id;
      const tags = await TagService.getTagsForEntity(taggableType, taggableId);
      for (const fieldName of tagFieldNames) collection[fieldName] = tags;
    } catch {
      for (const fieldName of tagFieldNames) collection[fieldName] = [];
    }
  }
}

type User = {
  id: string;
  email: string;
  name: string;
  role: string;
  image?: string | null;
};

// Enhanced collection item type that extends generated types with utility fields
export type CollectionItem = {
  url: string; // Auto-generated URL for the item
  breadcrumbs?: BreadcrumbItem[]; // Auto-generated breadcrumb trail
  blocks?: BlockWithRelations[];
  [key: string]: any; // Dynamic fields from the collection
};

export interface CollectionsOptions {
  // Single item queries
  itemSlug?: string; // Get specific item by slug
  itemId?: string; // Get specific item by ID

  // Multiple item queries
  parentId?: string; // Get children of this parent
  siblingOf?: string; // Get siblings of this item
  excludeCurrent?: boolean; // For siblings query (default: true)

  // Content options
  status?: 'published' | 'draft' | 'all'; // Default: 'published'
  includeBlocks?: boolean; // Default: true
  includeBreadcrumbs?: boolean; // Generate breadcrumb navigation (default: false)
  includeAuthors?: boolean; // Populate author details (default: false)

  // Filtering and ordering
  orderBy?: string; // Default: 'created_at'
  order?: 'asc' | 'desc'; // Default: 'desc'
  groupBy?: string;
  limit?: number;
  offset?: number;

  // Pagination URL generation
  baseUrl?: string;
  currentPage?: number;

  // Relationship filtering
  whereRelated?: {
    field: string; // The relation field name (e.g., 'categories')
    value: string | string[]; // Category slug(s) to filter by
    recursive?: boolean; // Include all descendant categories (default: false)
  };

  // Security
  user?: User | null; // User context for ACL filtering

  // Localization (only meaningful for collections declared `localized: true`)
  /**
   * BCP-47 locale to fetch (e.g. `'en'`, `'nb-NO'`). Defaults to
   * `content.defaultLocale` from settings when unset. Ignored for
   * non-localized collections.
   */
  locale?: string;
  /**
   * Behavior when the requested locale has no row for an item:
   * - `'default'`: return the default-locale row marked `_localeFallback`.
   * - `'strict'`: return null (single-item) or omit (multi-item).
   * Defaults to `content.fallback` from settings, then `'default'`.
   */
  fallback?: 'default' | 'strict';
}

// Return types with generic support
export type CollectionsSingleResult<T extends CollectionTypes = CollectionTypes> =
  | (T & {
      url: string;
      breadcrumbs?: BreadcrumbItem[];
      blocks?: BlockWithRelations[];
    })
  | null;

export type CollectionsMultipleResult<T extends CollectionTypes = CollectionTypes> = {
  items: (T & {
    url: string;
    breadcrumbs?: BreadcrumbItem[];
    blocks?: BlockWithRelations[];
  })[];
  total: number;
  hasMore: boolean;
  pagination?: Pagination;
  grouped?: Record<
    string,
    (T & {
      url: string;
      breadcrumbs?: BreadcrumbItem[];
      blocks?: BlockWithRelations[];
    })[]
  >;
};

/**
 * Get collections - single function for all collection queries
 *
 * ⚠️  SECURITY: Always pass user context for permission filtering in production!
 * Without user context, this function returns ALL content regardless of permissions.
 *
 * @example
 * ```typescript
 * // Multiple items (properly typed)
 * const posts = await getCollections<Post>('posts', { user: locals.user });
 * const children = await getCollections<Page>('pages', { parentId: 'parent-id', user: locals.user });
 * const siblings = await getCollections<Page>('pages', { siblingOf: 'item-id', user: locals.user });
 *
 * // Single items (properly typed)
 * const post = await getCollections<Post>('posts', { itemSlug: 'my-post', user: locals.user });
 * const page = await getCollections<Page>('pages', { itemId: 'item-id', user: locals.user });
 *
 * // With pagination
 * const posts = await getCollections<Post>('posts', {
 *   limit: 10,
 *   currentPage: 2,
 *   baseUrl: '/blog',
 *   user: locals.user
 * });
 *
 * // Filter by related content
 * const techPosts = await getCollections<Post>('posts', {
 *   whereRelated: { field: 'categories', value: 'technology' },
 *   user: locals.user
 * });
 * ```
 */
// Overload: When itemSlug or itemId is provided, return single result
export async function getCollections<T extends CollectionTypes = CollectionTypes>(
  collectionSlug: string,
  options: CollectionsOptions & { itemSlug: string }
): Promise<CollectionsSingleResult<T>>;
export async function getCollections<T extends CollectionTypes = CollectionTypes>(
  collectionSlug: string,
  options: CollectionsOptions & { itemId: string }
): Promise<CollectionsSingleResult<T>>;
// Overload: Otherwise, return multiple result
export async function getCollections<T extends CollectionTypes = CollectionTypes>(
  collectionSlug: string,
  options?: CollectionsOptions
): Promise<CollectionsMultipleResult<T>>;
// Implementation — public path, access rule enforced.
export async function getCollections<T extends CollectionTypes = CollectionTypes>(
  collectionSlug: string,
  options?: CollectionsOptions
): Promise<CollectionsSingleResult<T> | CollectionsMultipleResult<T>> {
  return _loadCollectionImpl<T>(collectionSlug, options, true);
}

/**
 * Framework-internal read for collections. Skips the type-level `access` rule
 * because the caller is the framework itself (search index rebuild, hooks,
 * cron jobs) and has no user context to authenticate as. Re-exported from
 * `core/services/data-read.server.ts` as `readCollection` — that is the
 * canonical import path. Consumer code reads via `getCollections`.
 *
 * @internal
 */
export async function _loadCollectionUnchecked<T extends CollectionTypes = CollectionTypes>(
  collectionSlug: string,
  options?: CollectionsOptions
): Promise<CollectionsSingleResult<T> | CollectionsMultipleResult<T>> {
  return _loadCollectionImpl<T>(collectionSlug, options, false);
}

async function _loadCollectionImpl<T extends CollectionTypes = CollectionTypes>(
  collectionSlug: string,
  options: CollectionsOptions | undefined,
  checkAccess: boolean
): Promise<CollectionsSingleResult<T> | CollectionsMultipleResult<T>> {
  const {
    itemSlug,
    itemId,
    parentId,
    siblingOf,
    excludeCurrent = true,
    status = 'published',
    includeBlocks = true,
    includeBreadcrumbs = false,
    includeAuthors = false,
    orderBy = 'created_at',
    order = 'desc',
    groupBy,
    limit,
    offset = 0,
    baseUrl,
    currentPage,
    whereRelated,
    user,
    locale,
    fallback
  } = options || {};

  // Determine if this is a single item query
  const isSingleQuery = !!(itemSlug || itemId);
  const isLocalized = isLocalizedCollection(collectionSlug);

  try {
    // Get the table dynamically from schema
    const table = schema[`collection_${collectionSlug}` as keyof typeof schema];
    if (!table) {
      console.error(`Collection '${collectionSlug}' not found in schema`);
      return isSingleQuery ? null : { items: [], total: 0, hasMore: false };
    }

    if (checkAccess) {
      // Enforce type-level access before any DB work. Throws AccessDeniedError
      // on miss — never returns silently. Default rule is 'public' so untouched
      // templates keep their current behavior.
      const collectionDef = await getCollectionType(collectionSlug);
      assertAccess(
        (collectionDef?.options as { access?: any })?.access,
        user,
        `Collection '${collectionSlug}'`
      );
    }

    // Handle single item queries
    if (isSingleQuery) {
      if (isLocalized) {
        return await handleSingleLocalizedCollectionItem<T>(collectionSlug, {
          itemSlug,
          itemId,
          status,
          includeBlocks,
          includeBreadcrumbs,
          includeAuthors,
          user,
          locale,
          fallback
        });
      }
      return await handleSingleCollectionItem<T>(table, collectionSlug, {
        itemSlug,
        itemId,
        status,
        includeBlocks,
        includeBreadcrumbs,
        includeAuthors,
        user
      });
    }

    // Handle multiple items queries
    if (isLocalized) {
      return await handleMultipleLocalizedCollectionItems<T>(collectionSlug, {
        parentId,
        siblingOf,
        excludeCurrent,
        status,
        includeBlocks,
        includeBreadcrumbs,
        includeAuthors,
        orderBy,
        order,
        groupBy,
        limit,
        offset,
        baseUrl,
        currentPage,
        whereRelated,
        user,
        locale,
        fallback
      });
    }

    return await handleMultipleCollectionItems<T>(table, collectionSlug, {
      parentId,
      siblingOf,
      excludeCurrent,
      status,
      includeBlocks,
      includeBreadcrumbs,
      includeAuthors,
      orderBy,
      order,
      groupBy,
      limit,
      offset,
      baseUrl,
      currentPage,
      whereRelated,
      user
    });
  } catch (err) {
    // Access failures must propagate — otherwise they become a silent empty
    // result, which is the exact failure mode the type-level gate exists to
    // prevent.
    if (err instanceof AccessDeniedError) throw err;
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error(`Failed to load collections '${collectionSlug}':`, errorMessage);
    return isSingleQuery ? null : { items: [], total: 0, hasMore: false };
  }
}

/**
 * Handle single collection item query
 */
async function handleSingleCollectionItem<T extends CollectionTypes = CollectionTypes>(
  table: any,
  collectionSlug: string,
  options: {
    itemSlug?: string;
    itemId?: string;
    status: string;
    includeBlocks: boolean;
    includeBreadcrumbs: boolean;
    includeAuthors: boolean;
    user?: User | null;
  }
): Promise<CollectionsSingleResult<T>> {
  const { itemSlug, itemId, status, includeBlocks, includeBreadcrumbs, includeAuthors, user } =
    options;

  const whereConditions = [liveOnly(table)];

  if (itemSlug) {
    whereConditions.push(eq((table as any).slug, itemSlug));
  }
  if (itemId) {
    whereConditions.push(eq((table as any).id, itemId));
  }

  if (status !== 'all') {
    whereConditions.push(eq((table as any).status, status));
  }

  const whereClause = whereConditions.length > 1 ? and(...whereConditions) : whereConditions[0];
  const result = await db.select().from(table).where(whereClause).limit(1);

  if (result.length === 0) {
    return null;
  }

  const item = await enrichCollectionItem(result[0], collectionSlug, {
    includeBlocks,
    includeBreadcrumbs,
    includeAuthors,
    status: status as RelationStatus
  });

  return item as CollectionsSingleResult<T>;
}

/**
 * Handle single-item query for a localized collection.
 *
 * Storage shape: `collection_<slug>` holds identity (id, author, created_at,
 * deleted_at, deleted_by) and `collection_<slug>_locales` holds editable
 * content per locale, joined on `<slug>_id`. We JOIN them, resolve the
 * requested locale (with fallback to defaultLocale when allowed), and return
 * a flattened item shaped like a non-localized read with two extra fields:
 *
 *   - `_localeId`: the `_locales` row id. Loaders use this for junction
 *     `parent_id` queries (junctions FK to `_locales.id` for localized
 *     collections — see Phase 1b generator).
 *   - `locale`: the resolved locale code that backed this row.
 *   - `_localeFallback` (optional): set when the row came from the default
 *     locale because the requested one had no translation.
 *
 * `item.id` is always the **main** row id so consumers can pass it back to
 * other utilities (`getCollections({ itemId })`) language-agnostically.
 */
async function handleSingleLocalizedCollectionItem<T extends CollectionTypes = CollectionTypes>(
  collectionSlug: string,
  options: {
    itemSlug?: string;
    itemId?: string;
    status: string;
    includeBlocks: boolean;
    includeBreadcrumbs: boolean;
    includeAuthors: boolean;
    user?: User | null;
    locale?: string;
    fallback?: 'default' | 'strict';
  }
): Promise<CollectionsSingleResult<T>> {
  const {
    itemSlug,
    itemId,
    status,
    includeBlocks,
    includeBreadcrumbs,
    includeAuthors,
    locale,
    fallback
  } = options;

  const mainTableName = `collection_${collectionSlug}`;
  const localesTableName = `${mainTableName}_locales`;
  const mainTable = (schema as any)[mainTableName];
  const localesTable = (schema as any)[localesTableName];

  if (!mainTable || !localesTable) {
    console.error(
      `Localized collection '${collectionSlug}' is missing tables ('${mainTableName}' / '${localesTableName}'). Run 'npx sailor db:update'.`
    );
    return null;
  }

  const { defaultLocale, fallback: settingsFallback } = getContentSettings();
  const fallbackMode = fallback ?? settingsFallback;
  const requestedLocale = locale ?? defaultLocale;

  if (!requestedLocale) {
    console.error(
      `getCollections('${collectionSlug}', ...): no locale resolved. Pass { locale } or set content.defaultLocale in templates/settings.ts.`
    );
    return null;
  }

  const fkField = `${collectionSlug}_id`;

  const runQuery = async (resolveLocale: string) => {
    const conditions = [liveOnly(mainTable), eq(localesTable.locale, resolveLocale)];
    if (itemSlug) conditions.push(eq(localesTable.slug, itemSlug));
    if (itemId) conditions.push(eq(mainTable.id, itemId));
    if (status !== 'all') conditions.push(eq(localesTable.status, status));

    return db
      .select({ main: mainTable, locale: localesTable })
      .from(mainTable)
      .innerJoin(localesTable, eq(localesTable[fkField], mainTable.id))
      .where(and(...conditions))
      .limit(1);
  };

  let rows = await runQuery(requestedLocale);
  let fellBack = false;

  if (
    rows.length === 0 &&
    fallbackMode === 'default' &&
    defaultLocale &&
    requestedLocale !== defaultLocale
  ) {
    rows = await runQuery(defaultLocale);
    fellBack = rows.length > 0;
  }

  if (rows.length === 0) return null;

  const row = rows[0] as any;
  const mainRow = row.main;
  const localeRow = row.locale;

  // Flatten: main provides identity (id, author, created_at, deleted_*);
  // locale provides everything editable. Drop the locale row's own id and
  // back-reference fkField so they don't leak into the user-facing shape —
  // `_localeId` exposes the locale row id explicitly for loaders.
  const { id: localeRowId, [fkField]: _ignoredFk, ...localeContent } = localeRow;
  const flat: any = {
    ...mainRow,
    ...localeContent,
    _localeId: localeRowId
  };
  if (fellBack) flat._localeFallback = requestedLocale;

  const item = await enrichCollectionItem(flat, collectionSlug, {
    includeBlocks,
    includeBreadcrumbs,
    includeAuthors,
    status: status as RelationStatus
  });

  return item as CollectionsSingleResult<T>;
}

/**
 * Handle multiple collection items query
 */
async function handleMultipleCollectionItems<T extends CollectionTypes = CollectionTypes>(
  table: any,
  collectionSlug: string,
  options: {
    parentId?: string;
    siblingOf?: string;
    excludeCurrent: boolean;
    status: string;
    includeBlocks: boolean;
    includeBreadcrumbs: boolean;
    includeAuthors: boolean;
    orderBy: string;
    order: 'asc' | 'desc';
    groupBy?: string;
    limit?: number;
    offset: number;
    baseUrl?: string;
    currentPage?: number;
    whereRelated?: {
      field: string;
      value: string | string[];
    };
    user?: User | null;
  }
): Promise<CollectionsMultipleResult<T>> {
  const {
    parentId,
    siblingOf,
    excludeCurrent,
    status,
    includeBlocks,
    includeBreadcrumbs,
    includeAuthors,
    orderBy,
    order,
    groupBy,
    limit,
    offset,
    baseUrl,
    currentPage,
    whereRelated,
    user
  } = options;

  const whereConditions = [liveOnly(table)];

  if (status !== 'all') {
    whereConditions.push(eq((table as any).status, status));
  }

  // Handle relationship filtering
  if (whereRelated) {
    const relatedIds = await buildRelationshipSubquery(
      collectionSlug,
      whereRelated.field,
      whereRelated.value,
      (whereRelated as any).recursive || false
    );

    if (relatedIds.length > 0) {
      whereConditions.push(inArray((table as any).id, relatedIds));
    } else {
      // If no related items found, ensure no results are returned
      whereConditions.push(sql`1 = 0`);
    }
  }

  // Handle parent/child filtering
  if (parentId) {
    whereConditions.push(eq((table as any).parent_id, parentId));
  }

  // Handle sibling filtering
  if (siblingOf) {
    // First get the parent_id of the sibling item
    const siblingItem = await db
      .select({ parent_id: (table as any).parent_id })
      .from(table)
      .where(eq((table as any).id, siblingOf))
      .limit(1);

    if (siblingItem.length > 0 && siblingItem[0].parent_id) {
      whereConditions.push(eq((table as any).parent_id, siblingItem[0].parent_id));

      if (excludeCurrent) {
        whereConditions.push(ne((table as any).id, siblingOf));
      }
    } else {
      // No parent found, no siblings
      whereConditions.push(sql`1 = 0`);
    }
  }

  const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined;

  // Get total count for pagination in parallel with items
  const countPromise = db.select({ count: count() }).from(table).where(whereClause);

  // Build main query with ordering
  let itemsQuery = db.select().from(table);
  if (whereClause) {
    itemsQuery = itemsQuery.where(whereClause);
  }

  // Add ordering
  if (orderBy && (table as any)[orderBy]) {
    const orderFn = order === 'desc' ? desc : asc;
    itemsQuery = itemsQuery.orderBy(orderFn((table as any)[orderBy]));
  }

  // Add pagination
  if (limit) {
    itemsQuery = itemsQuery.limit(limit).offset(offset);
  }

  // Execute both queries in parallel
  const [countResult, items] = await Promise.all([countPromise, itemsQuery]);

  const total = countResult[0]?.count || 0;

  for (const item of items as any[]) {
    (item as CollectionItem).created_at = parseDate((item as CollectionItem).created_at);
    (item as CollectionItem).updated_at = parseDate((item as CollectionItem).updated_at);
  }

  // Enrich all items
  const enrichedItems = await Promise.all(
    items.map((item: any) =>
      enrichCollectionItem(item, collectionSlug, {
        includeBlocks,
        includeBreadcrumbs,
        includeAuthors,
        status: status as RelationStatus
      })
    )
  );

  const result: CollectionsMultipleResult = {
    items: enrichedItems,
    total,
    hasMore: limit ? offset + items.length < total : false
  };

  // Add pagination info if we have the required data
  if (limit && baseUrl) {
    const page = currentPage || Math.floor(offset / limit) + 1;
    const totalPages = Math.ceil(total / limit);

    result.pagination = {
      page,
      pageSize: limit,
      totalItems: total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1
    } as Pagination;
  }

  // Group items if requested
  if (groupBy) {
    result.grouped = groupItemsByField(enrichedItems, groupBy);
  }

  return result as CollectionsMultipleResult<T>;
}

/**
 * Multi-item read for a localized collection.
 *
 * INNER JOIN of main + `_locales` filtered by the requested locale — items
 * without a translation in that locale are omitted from the list. This is
 * the strict semantics, and the only mode v1 supports for lists. Per-row
 * fallback to default locale (`fallback: 'default'`) is honored for
 * single-item reads but deferred to a follow-up for lists, because pagination
 * over a mix of "real translations + fallback rows" requires either UNION
 * tricks or a window function — both add real complexity and the most
 * common list use case (only-translated-items) is the right default anyway.
 *
 * All filter/order/paginate options work; ordering picks the right table
 * based on which one has the column. `whereRelated` uses
 * `buildRelationshipSubquery`, which already routes to the localized
 * junction name and returns `_locales.id` values to filter against.
 */
async function handleMultipleLocalizedCollectionItems<T extends CollectionTypes = CollectionTypes>(
  collectionSlug: string,
  options: {
    parentId?: string;
    siblingOf?: string;
    excludeCurrent: boolean;
    status: string;
    includeBlocks: boolean;
    includeBreadcrumbs: boolean;
    includeAuthors: boolean;
    orderBy: string;
    order: 'asc' | 'desc';
    groupBy?: string;
    limit?: number;
    offset: number;
    baseUrl?: string;
    currentPage?: number;
    whereRelated?: {
      field: string;
      value: string | string[];
      recursive?: boolean;
    };
    user?: User | null;
    locale?: string;
    fallback?: 'default' | 'strict';
  }
): Promise<CollectionsMultipleResult<T>> {
  const {
    parentId,
    siblingOf,
    excludeCurrent,
    status,
    includeBlocks,
    includeBreadcrumbs,
    includeAuthors,
    orderBy,
    order,
    groupBy,
    limit,
    offset,
    baseUrl,
    currentPage,
    whereRelated,
    locale
  } = options;

  const mainTableName = `collection_${collectionSlug}`;
  const localesTableName = `${mainTableName}_locales`;
  const mainTable = (schema as any)[mainTableName];
  const localesTable = (schema as any)[localesTableName];

  if (!mainTable || !localesTable) {
    console.error(
      `Localized collection '${collectionSlug}' is missing tables. Run 'npx sailor db:update'.`
    );
    return { items: [], total: 0, hasMore: false };
  }

  const { defaultLocale } = getContentSettings();
  const requestedLocale = locale ?? defaultLocale;
  if (!requestedLocale) {
    console.error(
      `getCollections('${collectionSlug}', ...): no locale resolved. Pass { locale } or set content.defaultLocale.`
    );
    return { items: [], total: 0, hasMore: false };
  }

  const fkField = `${collectionSlug}_id`;

  const whereConditions: any[] = [liveOnly(mainTable), eq(localesTable.locale, requestedLocale)];

  if (status !== 'all') {
    whereConditions.push(eq(localesTable.status, status));
  }

  // Relationship filtering — buildRelationshipSubquery returns `_locales.id`
  // values for localized collections, so we filter against `localesTable.id`.
  if (whereRelated) {
    const relatedIds = await buildRelationshipSubquery(
      collectionSlug,
      whereRelated.field,
      whereRelated.value,
      whereRelated.recursive || false
    );

    if (relatedIds.length > 0) {
      whereConditions.push(inArray(localesTable.id, relatedIds));
    } else {
      whereConditions.push(sql`1 = 0`);
    }
  }

  // parent_id lives on `_locales` (each translation owns its tree position).
  if (parentId) {
    whereConditions.push(eq(localesTable.parent_id, parentId));
  }

  if (siblingOf) {
    // Look up the sibling's parent_id in the requested locale's row.
    const siblingRow = await db
      .select({ parent_id: localesTable.parent_id })
      .from(mainTable)
      .innerJoin(
        localesTable,
        and(eq(localesTable[fkField], mainTable.id), eq(localesTable.locale, requestedLocale))
      )
      .where(eq(mainTable.id, siblingOf))
      .limit(1);

    if (siblingRow.length > 0 && siblingRow[0].parent_id) {
      whereConditions.push(eq(localesTable.parent_id, siblingRow[0].parent_id));
      if (excludeCurrent) {
        whereConditions.push(ne(mainTable.id, siblingOf));
      }
    } else {
      whereConditions.push(sql`1 = 0`);
    }
  }

  const whereClause = and(...whereConditions);

  // Count via the JOIN — `count()` over the joined row count gives us the
  // total items matching the filter, same semantics as the non-localized path.
  const countPromise = db
    .select({ count: count() })
    .from(mainTable)
    .innerJoin(localesTable, eq(localesTable[fkField], mainTable.id))
    .where(whereClause);

  // Items query
  let itemsQuery: any = db
    .select({ main: mainTable, locale: localesTable })
    .from(mainTable)
    .innerJoin(localesTable, eq(localesTable[fkField], mainTable.id))
    .where(whereClause);

  // Ordering: column might live on main (created_at, deleted_at) or on
  // `_locales` (everything editable + slug, status, sort, updated_at). Pick
  // whichever table has it; if neither, skip ordering.
  if (orderBy) {
    const onMain = (mainTable as any)[orderBy];
    const onLocale = (localesTable as any)[orderBy];
    const targetCol = onMain ?? onLocale;
    if (targetCol) {
      const orderFn = order === 'desc' ? desc : asc;
      itemsQuery = itemsQuery.orderBy(orderFn(targetCol));
    }
  }

  if (limit) {
    itemsQuery = itemsQuery.limit(limit).offset(offset);
  }

  const [countResult, rows] = await Promise.all([countPromise, itemsQuery]);
  const total = countResult[0]?.count || 0;

  // Flatten each {main, locale} row into the user-facing shape. Same logic
  // as handleSingleLocalizedCollectionItem — main provides identity, locale
  // provides editable content, `_localeId` exposed for loaders.
  const flatItems: any[] = (rows as any[]).map((row) => {
    const mainRow = row.main;
    const localeRow = row.locale;
    const { id: localeRowId, [fkField]: _ignoredFk, ...localeContent } = localeRow;
    return {
      ...mainRow,
      ...localeContent,
      _localeId: localeRowId
    };
  });

  for (const item of flatItems) {
    item.created_at = parseDate(item.created_at);
    item.updated_at = parseDate(item.updated_at);
  }

  const enrichedItems = await Promise.all(
    flatItems.map((item) =>
      enrichCollectionItem(item, collectionSlug, {
        includeBlocks,
        includeBreadcrumbs,
        includeAuthors,
        status: status as RelationStatus
      })
    )
  );

  const result: CollectionsMultipleResult = {
    items: enrichedItems as any,
    total,
    hasMore: limit ? offset + (rows as any[]).length < total : false
  };

  if (limit && baseUrl) {
    const page = currentPage || Math.floor(offset / limit) + 1;
    const totalPages = Math.ceil(total / limit);
    result.pagination = {
      page,
      pageSize: limit,
      totalItems: total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1
    } as Pagination;
  }

  if (groupBy) {
    result.grouped = groupItemsByField(enrichedItems, groupBy) as any;
  }

  return result as CollectionsMultipleResult<T>;
}

/**
 * Enrich a single collection item with blocks, breadcrumbs, authors, etc.
 */
async function enrichCollectionItem(
  item: any,
  collectionSlug: string,
  options: {
    includeBlocks: boolean;
    includeBreadcrumbs: boolean;
    includeAuthors: boolean;
    status?: RelationStatus;
  }
): Promise<CollectionItem> {
  const { includeBlocks, includeBreadcrumbs, includeAuthors, status = 'published' } = options;

  const enrichedItem = { ...item } as CollectionItem;

  // Populate collection item fields (files, arrays, relations)
  try {
    const collectionDef = await getCollectionType(collectionSlug);
    const collectionSchema = collectionDef ? collectionDef.fields || {} : {};
    if (Object.keys(collectionSchema).length > 0) {
      await loadCollectionFields(enrichedItem, collectionSlug, collectionSchema, false, status);
    }
  } catch (err) {
    console.warn(
      `Failed to load content data for collection '${collectionSlug}' item '${item.id}'`,
      err
    );
  }

  // Load blocks if requested. For localized collections the block junction's
  // `collection_id` references the `_locales` row id (Phase 1b generator),
  // so pass `_localeId` when present and fall through to the main id otherwise.
  if (includeBlocks) {
    const blockParentId = (enrichedItem as any)._localeId ?? enrichedItem.id;
    enrichedItem.blocks = await loadBlocksForCollection(blockParentId, { status });
  }

  // Populate user references if requested
  if (includeAuthors) {
    if (enrichedItem.author && typeof enrichedItem.author === 'string') {
      const populatedAuthor = await getPopulatedAuthor(enrichedItem.author);
      if (populatedAuthor) {
        enrichedItem.author = populatedAuthor;
      }
    }
    if (enrichedItem.last_modified_by && typeof enrichedItem.last_modified_by === 'string') {
      const populatedUser = await getPopulatedAuthor(enrichedItem.last_modified_by);
      if (populatedUser) {
        enrichedItem.last_modified_by = populatedUser;
      }
    }
  }

  // Add URL property and breadcrumbs with hierarchical path
  const { url, breadcrumbs } = await generateItemUrlAndBreadcrumbs(
    collectionSlug,
    enrichedItem,
    includeBreadcrumbs
  );
  enrichedItem.url = url;
  if (includeBreadcrumbs) {
    enrichedItem.breadcrumbs = breadcrumbs;
  }

  return enrichedItem;
}

/**
 * Get populated author object by user ID
 */
async function getPopulatedAuthor(
  userId: string
): Promise<{ id: string; name: string | null; email: string | null } | undefined> {
  try {
    const user = await db
      .select({ name: schema.users.name, email: schema.users.email })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    return user[0] ? { id: userId, name: user[0].name, email: user[0].email } : undefined;
  } catch (err) {
    console.error(`Failed to get author details for user '${userId}':`, err);
    return undefined;
  }
}

/**
 * Generate hierarchical URL and breadcrumbs for an item based on its parent structure
 */
async function generateItemUrlAndBreadcrumbs(
  collectionSlug: string,
  item: CollectionItem,
  includeBreadcrumbs: boolean = false
): Promise<{ url: string; breadcrumbs?: BreadcrumbItem[] }> {
  try {
    // Get collection definition from database to check for basePath
    const collectionDef = await getCollectionType(collectionSlug);
    const basePath = collectionDef?.options?.basePath || '';

    // If no parent, return slug with basePath
    if (!item.parent_id) {
      return {
        url: `${basePath}${item.slug}`,
        breadcrumbs: includeBreadcrumbs ? [] : undefined
      };
    }

    // Get the table for this collection
    const table = schema[`collection_${collectionSlug}` as keyof typeof schema];
    if (!table) {
      return {
        url: `/${item.slug}`,
        breadcrumbs: includeBreadcrumbs ? [] : undefined
      };
    }

    // Get parent item
    const parentResult = await db
      .select()
      .from(table)
      .where(eq((table as any).id, item.parent_id))
      .limit(1);

    if (parentResult.length === 0) {
      return {
        url: `${basePath}${item.slug}`,
        breadcrumbs: includeBreadcrumbs ? [] : undefined
      };
    }

    const parent = parentResult[0] as CollectionItem;

    // Recursively get parent data
    const parentData = await generateItemUrlAndBreadcrumbs(
      collectionSlug,
      parent,
      includeBreadcrumbs
    );

    const url = `${parentData.url}/${item.slug}`;
    let breadcrumbs: BreadcrumbItem[] | undefined;

    if (includeBreadcrumbs) {
      breadcrumbs = [
        ...(parentData.breadcrumbs || []),
        {
          label: parent.title,
          url: parentData.url,
          isActive: false,
          isCurrent: false
        }
      ];
    }

    return { url, breadcrumbs };
  } catch (err) {
    console.error(`Failed to generate URL/breadcrumbs for item '${item.id}':`, err);
    // Get collection definition from database for basePath even in error case
    const collectionDef = await getCollectionType(collectionSlug);
    const basePath = collectionDef?.options?.basePath || '';
    return {
      url: `${basePath}${item.slug}`,
      breadcrumbs: includeBreadcrumbs ? [] : undefined
    };
  }
}

/**
 * Get all descendant items recursively for any global or collection type
 */
async function getAllDescendantItems(parentSlug: string, targetType: string): Promise<string[]> {
  const allSlugs = new Set<string>();

  async function getChildren(slug: string) {
    // Try to get as global first, then as collection
    let itemResult = null;
    let isGlobal = false;

    try {
      itemResult = await getGlobals(targetType, { itemSlug: slug, withRelations: true });
      isGlobal = true;
    } catch {
      try {
        itemResult = await getCollections(targetType, { itemSlug: slug });
        isGlobal = false;
      } catch {
        console.warn(`Could not find item with slug '${slug}' in type '${targetType}'`);
        return;
      }
    }

    if (!itemResult) return;

    const item = itemResult as any;
    allSlugs.add(item.slug);

    // Get children of this item
    const childrenResult = isGlobal
      ? await getGlobals(targetType, { parentId: item.id, withRelations: true })
      : await getCollections(targetType, { parentId: item.id });

    if (childrenResult && 'items' in childrenResult && childrenResult.items) {
      // Recursively get children of each child
      for (const child of childrenResult.items) {
        if ('slug' in child && typeof child.slug === 'string') {
          await getChildren(child.slug);
        }
      }
    }
  }

  await getChildren(parentSlug);
  return Array.from(allSlugs);
}

/**
 * Build a relationship subquery to filter items by related entities
 */
async function buildRelationshipSubquery(
  collectionSlug: string,
  relationField: string,
  targetValues: string | string[],
  recursive: boolean = false
): Promise<any> {
  let values = Array.isArray(targetValues) ? targetValues : [targetValues];

  // If recursive is true, get all descendant items
  if (recursive && values.length === 1) {
    // Get the target type from the collection definition
    const collectionDef = await getCollectionType(collectionSlug);
    const relationDef = collectionDef?.fields?.[relationField]?.relation;

    if (relationDef) {
      let targetType: string;

      if (relationDef.targetGlobal) {
        // Collection to Global relationship
        targetType = relationDef.targetGlobal;
      } else if (relationDef.targetCollection) {
        // Collection to Collection relationship
        targetType = relationDef.targetCollection;
      } else {
        console.warn(
          `No target type found for relation field '${relationField}' in collection '${collectionSlug}'`
        );
        return [];
      }

      const allDescendantSlugs = await getAllDescendantItems(values[0], targetType);
      values = allDescendantSlugs;
    }
  }

  // Junction table name is the same for localized and non-localized. For
  // localized collections the `collection_id` column stores the `_locales`
  // row id; callers (`buildRelationshipSubquery`) account for that when
  // joining back.
  const junctionBase = collectionSlug;
  let throughTableName = `junction_${junctionBase}_${toSnakeCase(relationField)}`;
  let throughTable = schema[throughTableName as keyof typeof schema];

  // If the standard naming doesn't work, try alternative naming patterns
  if (!throughTable) {
    // Try with just the field name (singular)
    throughTableName = `junction_${junctionBase}_${relationField}`;
    throughTable = schema[throughTableName as keyof typeof schema];
  }

  if (!throughTable) {
    throw new Error(`Junction table '${throughTableName}' not found in schema`);
  }

  // Get the target global table name from the collection definition
  // We need to look up the actual targetGlobal from the relation field definition
  let targetTableName: string;

  // Try to get the target global from the collection definition
  try {
    const collectionDef = await getCollectionType(collectionSlug);
    if (collectionDef?.fields?.[relationField]?.relation?.targetGlobal) {
      targetTableName = `global_${collectionDef.fields[relationField].relation.targetGlobal}`;
    } else {
      // Fallback to the old behavior
      targetTableName = `global_${relationField}`;
    }
  } catch (error) {
    // Fallback to the old behavior if we can't get the collection definition
    targetTableName = `global_${relationField}`;
  }

  const targetTable = schema[targetTableName as keyof typeof schema];

  if (!targetTable) {
    throw new Error(`Target table '${targetTableName}' not found in schema`);
  }

  // Execute query to get collection_ids that have the specified related entities
  // If no values provided, return empty array
  if (values.length === 0) {
    return [];
  }

  const relatedResults = await db
    .select({ collection_id: (throughTable as any).collection_id })
    .from(throughTable)
    .innerJoin(targetTable, eq((throughTable as any).target_id, (targetTable as any).id))
    .where(inArray((targetTable as any).slug, values));

  // Extract just the collection_id values for the IN clause
  return relatedResults.map((row: { collection_id: string }) => row.collection_id);
}

/**
 * Utility to get all available collection types
 *
 * @example
 * ```typescript
 * const collectionTypes = await getAvailableCollectionTypes();
 * // Returns: ['posts', 'pages', 'products', ...]
 * ```
 */
export async function getAvailableCollectionTypes(): Promise<string[]> {
  const collectionTypes = await db.query.collectionTypes.findMany();
  return collectionTypes.map((ct: any) => ct.slug);
}

/**
 * Utility to check if a collection type exists
 *
 * @example
 * ```typescript
 * if (await collectionTypeExists('posts')) {
 *   // Collection type is available
 * }
 * ```
 */
export async function collectionTypeExists(collectionType: string): Promise<boolean> {
  const availableTypes = await getAvailableCollectionTypes();
  return availableTypes.includes(collectionType);
}
