import { db } from 'sailorcms/core/db/index.server';
import { sql, ne, eq, and, asc, desc, count, inArray, type SQL } from 'drizzle-orm';
import { liveOnly } from 'sailorcms/core/db/soft-delete';
import {
  loadBlocksForCollection,
  loadGroupedBlocksForCollection,
  type BlockWithRelations,
  type BlockOrGroup
} from './blocks';
import type { CollectionTypes } from '$sailor/generated/types';
import type { Pagination } from 'sailorcms/core/types';
import type { BreadcrumbItem } from '../types';
import { getCollectionType } from 'sailorcms/core/utils/db.server';
import * as schema from '$sailor/generated/schema';
import { fieldConfigurations } from '$sailor/generated/fields';
import { getGlobals } from './globals';
import { loadFileFields } from './loaders/file-loader';
import { loadArrayFields } from './loaders/array-loader';
import {
  loadOneToXRelations,
  loadManyToManyRelations,
  type RelationStatus
} from './loaders/relation-loader';
import { buildRelationshipSubquery, resolveRelationFilter } from './loaders/relation-filter';
import { loadReverseRelations } from './loaders/reverse-loader';
import { assertAccess, AccessDeniedError } from './access';
import { parseDate, groupItemsByField } from './internal';
import { TagService } from 'sailorcms/core/services/tag.server';
// Internal use of the pure i18n config helper. Re-export below makes it part
// of this module's public surface for back-compat with existing server-side
// imports (`sailorcms/utils/data/collections`); client-bundled callers
// should import from `sailorcms/utils/i18n` instead.
import {
  getContentSettings as getContentSettingsInternal,
  buildLocaleHref as buildLocaleHrefInternal
} from 'sailorcms/core/settings/i18n';

/**
 * True if the consumer marked this collection `localized: true` in its
 * template. Read at runtime from the generated `fields.ts` so the read path
 * branches without re-parsing templates.
 */
function isLocalizedCollection(slug: string): boolean {
  return (fieldConfigurations as any).collections?.[slug]?.localized === true;
}

// Re-export the pure i18n config helpers from their canonical home in
// `core/settings/i18n`. Server-side callers can keep importing from here;
// client-bundled callers should import from `sailorcms/utils/i18n` to
// avoid pulling in this module's `db` dependency chain.
export {
  getContentSettings,
  getContentLocales,
  getDefaultLocale,
  getUrlLangs,
  urlToContentLocale,
  contentToUrlLang,
  buildLocaleHref,
  buildLocaleHomeHref,
  buildLocalePath,
  defaultLangParamMatcher,
  extractTranslations,
  dependsOnContentLocale,
  CONTENT_LOCALE_DEP,
  type BuildLocaleHrefOptions
} from 'sailorcms/core/settings/i18n';

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
  await loadReverseRelations(collection, collectionSchema, status);

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
  // Flat list with `includeBlocks: true`; the grouping tree (blocks + group
  // nodes) with `includeBlocks: 'grouped'`. BlockOrGroup covers both.
  blocks?: BlockOrGroup[];
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
  includeBlocks?: boolean | 'grouped'; // true = flat blocks, 'grouped' = grouping tree (default: true)
  includeBreadcrumbs?: boolean; // Generate breadcrumb navigation (default: false)
  includeAuthors?: boolean; // Populate author details (default: false)
  /**
   * Attach `translations: Array<{ locale, slug, status, updated_at }>` to
   * each returned item — one entry per row in `<collection>_locales` for
   * that item. Use for language switchers, `<link rel="alternate" hreflang>`
   * generation, sitemaps, and staleness comparison (each translation's
   * `updated_at` against the default locale's tells you whether a sibling
   * may be out of date). Opt-in: costs one extra query per item. Always
   * empty for non-localized collections.
   */
  includeTranslations?: boolean;

  // Filtering and ordering
  /**
   * Field to order by. `'relation'` orders by the junction's `inverse_sort`
   * — the position the related target assigned — and is only meaningful
   * alongside `whereRelated`; without it the ordering is skipped.
   */
  orderBy?: string; // Default: 'created_at'
  order?: 'asc' | 'desc'; // Default: 'desc'
  groupBy?: string;
  limit?: number;
  offset?: number;

  // Pagination URL generation
  baseUrl?: string;
  currentPage?: number;
  /**
   * Sugar over `baseUrl` for localized list routes. Pass the *unprefixed*
   * route pattern (e.g. `'/blog'`) and pagination URLs get the correct
   * locale prefix applied based on `urlStrategy` + resolved `locale` —
   * `/blog?page=2` for the default locale under `'default-at-root'`,
   * `/no/blog?page=2` for non-default (or every locale under `'symmetric'`).
   *
   * Equivalent to `baseUrl: buildLocaleHref({ locale, translation: null,
   * section: 'blog' })`. Explicit `baseUrl` always wins. Reads
   * `urlStrategy`/`defaultLocale`/`urlAliases` from settings.
   *
   * No-op when i18n isn't configured (`baseUrl` falls back to `routePattern`
   * unchanged) — safe to leave on a non-localized collection's call.
   */
  routePattern?: string;

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
   * `content.i18n.default` from settings when unset. Ignored for
   * non-localized collections.
   */
  locale?: string;
  /**
   * Behavior when the requested locale has no row for an item:
   * - `'default'`: return the default-locale row with `isFallback: true` and
   *   `requestedLocale: <asked-for code>` so consumers can render a banner.
   * - `'strict'`: return null (single-item) or omit (multi-item).
   * Defaults to `content.i18n.fallback` from settings, then `'default'`.
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
// Overload: single item + `includeBlocks: 'grouped'` → `.blocks` is the grouping
// tree (`BlockOrGroup[]`), so a page loads its item and grouped blocks in one
// call — no separate `getBlockTree(item.id)` round-trip. Listed before the plain
// single-item overloads so the more specific options shape wins.
export async function getCollections<T extends CollectionTypes = CollectionTypes>(
  collectionSlug: string,
  options: CollectionsOptions & { itemSlug: string; includeBlocks: 'grouped' }
): Promise<(T & { url: string; breadcrumbs?: BreadcrumbItem[]; blocks?: BlockOrGroup[] }) | null>;
export async function getCollections<T extends CollectionTypes = CollectionTypes>(
  collectionSlug: string,
  options: CollectionsOptions & { itemId: string; includeBlocks: 'grouped' }
): Promise<(T & { url: string; breadcrumbs?: BreadcrumbItem[]; blocks?: BlockOrGroup[] }) | null>;
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
 * Sugar over `getCollections` that pulls `locale` and `user` off `event` so
 * localized loaders don't have to thread either through manually. Picks:
 *
 *   - `locale` from `options.locale` ?? `event.locals.contentLocale` ??
 *     `getContentSettings().defaultLocale`
 *   - `user` from `options.user` ?? `event.locals.user ?? null`
 *
 * Also stamps `event.depends('sailor:content-locale')` automatically so the
 * load re-runs on locale-prefix navigation (paired with `watchContentLocale`
 * in your client layout). No need to call `dependsOnContentLocale(event)`
 * separately.
 *
 * Use in localized route loaders:
 *
 * ```ts
 * // src/routes/(site)/[[lang=lang]]/pages/[slug]/+page.server.ts
 * import { getCollectionsFor } from 'sailorcms/utils/data';
 *
 * export const load = async (event) => {
 *   const page = await getCollectionsFor(event, 'pages', {
 *     itemSlug: event.params.slug,
 *     includeTranslations: true
 *   });
 *   return { page };
 * };
 * ```
 *
 * Existing `getCollections(slug, opts)` stays — for unchanged behavior or
 * non-localized reads. `getCollectionsFor` is the sugar for the "this is a
 * request-scoped read" common case.
 */
// Single item + grouped blocks in one call — see the matching getCollections overload.
export async function getCollectionsFor<T extends CollectionTypes = CollectionTypes>(
  event: { locals: App.Locals; depends?: (id: string) => void },
  collectionSlug: string,
  options: CollectionsOptions & { itemSlug: string; includeBlocks: 'grouped' }
): Promise<(T & { url: string; breadcrumbs?: BreadcrumbItem[]; blocks?: BlockOrGroup[] }) | null>;
export async function getCollectionsFor<T extends CollectionTypes = CollectionTypes>(
  event: { locals: App.Locals; depends?: (id: string) => void },
  collectionSlug: string,
  options: CollectionsOptions & { itemId: string; includeBlocks: 'grouped' }
): Promise<(T & { url: string; breadcrumbs?: BreadcrumbItem[]; blocks?: BlockOrGroup[] }) | null>;
export async function getCollectionsFor<T extends CollectionTypes = CollectionTypes>(
  event: { locals: App.Locals; depends?: (id: string) => void },
  collectionSlug: string,
  options: CollectionsOptions & { itemSlug: string }
): Promise<CollectionsSingleResult<T>>;
export async function getCollectionsFor<T extends CollectionTypes = CollectionTypes>(
  event: { locals: App.Locals; depends?: (id: string) => void },
  collectionSlug: string,
  options: CollectionsOptions & { itemId: string }
): Promise<CollectionsSingleResult<T>>;
export async function getCollectionsFor<T extends CollectionTypes = CollectionTypes>(
  event: { locals: App.Locals; depends?: (id: string) => void },
  collectionSlug: string,
  options?: CollectionsOptions
): Promise<CollectionsMultipleResult<T>>;
export async function getCollectionsFor<T extends CollectionTypes = CollectionTypes>(
  event: { locals: App.Locals; depends?: (id: string) => void },
  collectionSlug: string,
  options?: CollectionsOptions
): Promise<CollectionsSingleResult<T> | CollectionsMultipleResult<T>> {
  // Best-effort depends() — only available on load events, not all RequestEvent
  // variants (handlers, hooks). Silently skipped where unavailable.
  if (typeof event.depends === 'function') {
    try {
      event.depends('sailor:content-locale');
    } catch {
      // depends() may throw if called outside a load context — ignore.
    }
  }
  return getCollections<T>(collectionSlug, {
    ...options,
    locale: options?.locale ?? event.locals.contentLocale,
    user: options?.user ?? (event.locals.user as any) ?? null
  });
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
    includeTranslations = false,
    orderBy = 'created_at',
    order = 'desc',
    groupBy,
    limit,
    offset = 0,
    baseUrl,
    currentPage,
    routePattern,
    whereRelated,
    user,
    locale,
    fallback
  } = options || {};

  // Determine if this is a single item query
  const isSingleQuery = !!(itemSlug || itemId);
  const isLocalized = isLocalizedCollection(collectionSlug);

  // Resolve baseUrl from routePattern when explicit baseUrl wasn't passed.
  // Locale-prefix is applied via buildLocaleHref so paginated URLs respect
  // the configured urlStrategy without consumers hand-building `locale ===
  // defaultLocale ? '/blog' : '/${urlLang}/blog'` ternaries.
  let resolvedBaseUrl = baseUrl;
  if (!resolvedBaseUrl && routePattern) {
    const { defaultLocale } = getContentSettingsInternal();
    if (defaultLocale) {
      const section = routePattern.replace(/^\/+/, '') || undefined;
      resolvedBaseUrl = buildLocaleHrefInternal({
        locale: locale ?? defaultLocale,
        translation: null,
        section
      });
    } else {
      // No i18n configured — pass routePattern through unchanged.
      resolvedBaseUrl = routePattern;
    }
  }

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
          includeTranslations,
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
        includeTranslations,
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
        includeTranslations,
        orderBy,
        order,
        groupBy,
        limit,
        offset,
        baseUrl: resolvedBaseUrl,
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
      includeTranslations,
      orderBy,
      order,
      groupBy,
      limit,
      offset,
      baseUrl: resolvedBaseUrl,
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
    includeBlocks: boolean | 'grouped';
    includeBreadcrumbs: boolean;
    includeAuthors: boolean;
    includeTranslations: boolean;
    user?: User | null;
  }
): Promise<CollectionsSingleResult<T>> {
  const {
    itemSlug,
    itemId,
    status,
    includeBlocks,
    includeBreadcrumbs,
    includeAuthors,
    includeTranslations,
    user
  } = options;

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
    includeTranslations,
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
 *   - `isFallback` (optional, `true`): set when the row came from the
 *     default locale because the requested one had no translation.
 *   - `requestedLocale` (optional): what the caller asked for, when
 *     `isFallback` is set — pair them to render banners like
 *     "Translation for {requestedLocale} pending".
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
    includeBlocks: boolean | 'grouped';
    includeBreadcrumbs: boolean;
    includeAuthors: boolean;
    includeTranslations: boolean;
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
    includeTranslations,
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

  const { defaultLocale, fallback: settingsFallback } = getContentSettingsInternal();
  const fallbackMode = fallback ?? settingsFallback;
  const requestedLocale = locale ?? defaultLocale;

  if (!requestedLocale) {
    console.error(
      `getCollections('${collectionSlug}', ...): no locale resolved. Pass { locale } or set content.i18n.default in templates/settings.ts.`
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
  if (fellBack) {
    flat.isFallback = true;
    flat.requestedLocale = requestedLocale;
  }

  const item = await enrichCollectionItem(flat, collectionSlug, {
    includeBlocks,
    includeBreadcrumbs,
    includeAuthors,
    includeTranslations,
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
    includeBlocks: boolean | 'grouped';
    includeBreadcrumbs: boolean;
    includeAuthors: boolean;
    includeTranslations: boolean;
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
    includeTranslations,
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
  let relationOrdering: SQL | null = null;
  if (whereRelated) {
    const resolved = await resolveRelationFilter({
      ownerType: 'collection',
      ownerSlug: collectionSlug,
      relationField: whereRelated.field,
      targetValues: whereRelated.value,
      recursive: (whereRelated as any).recursive || false,
      resolveDescendants: getAllDescendantItems
    });

    if (resolved.ownerIds.length > 0) {
      whereConditions.push(inArray((table as any).id, resolved.ownerIds));
    } else {
      // If no related items found, ensure no results are returned
      whereConditions.push(sql`1 = 0`);
    }

    // `orderBy: 'relation'` orders by the junction rather than by a column on
    // the collection — the position the *target* assigned, which is what a
    // category page wants. A correlated subquery keeps it in SQL so it survives
    // pagination; ordering the resolved ids in JS would only sort one page.
    //
    // `MIN` because `recursive` expands the target set: a row matched through
    // several descendants has several positions, and its best one is the
    // sensible answer. With everything tied at 0 this returns 0 for every row
    // and the secondary ordering decides, which is the pre-existing behaviour.
    if (orderBy === 'relation' && resolved.targetIds.length > 0) {
      relationOrdering = sql`(
        SELECT MIN(${sql.identifier('rj')}.inverse_sort)
        FROM ${sql.identifier(resolved.junctionTable)} AS ${sql.identifier('rj')}
        WHERE ${sql.identifier('rj')}.${sql.identifier(resolved.ownerKey)} = ${(table as any).id}
          AND ${sql.identifier('rj')}.target_id IN (${sql.join(
            resolved.targetIds.map((id) => sql`${id}`),
            sql`, `
          )})
      )`;
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
  const orderFn = order === 'desc' ? desc : asc;
  if (relationOrdering) {
    // Fall back to the collection's own `sort` so ties stay deterministic.
    itemsQuery = itemsQuery.orderBy(orderFn(relationOrdering), asc((table as any).sort));
  } else if (orderBy && (table as any)[orderBy]) {
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
        includeTranslations,
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
    includeBlocks: boolean | 'grouped';
    includeBreadcrumbs: boolean;
    includeAuthors: boolean;
    includeTranslations: boolean;
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
    includeTranslations,
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

  const { defaultLocale } = getContentSettingsInternal();
  const requestedLocale = locale ?? defaultLocale;
  if (!requestedLocale) {
    console.error(
      `getCollections('${collectionSlug}', ...): no locale resolved. Pass { locale } or set content.i18n.default.`
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
    const relatedIds = await buildRelationshipSubquery({
      ownerType: 'collection',
      ownerSlug: collectionSlug,
      relationField: whereRelated.field,
      targetValues: whereRelated.value,
      recursive: whereRelated.recursive || false,
      resolveDescendants: getAllDescendantItems
    });

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
        includeTranslations,
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
 * Per-item translations enrichment. One row per (item × locale) in
 * `<collection>_locales`. Cheap single query keyed on the indexed FK.
 * Always returns empty for non-localized collections.
 */
async function loadCollectionTranslations(
  itemId: string,
  collectionSlug: string
): Promise<
  Array<{
    locale: string;
    slug: string | null;
    status: string | null;
    updated_at: Date | string | null;
  }>
> {
  if (!isLocalizedCollection(collectionSlug)) return [];
  const localesTable = (schema as any)[`collection_${collectionSlug}_locales`];
  if (!localesTable) return [];
  try {
    const rows = await db
      .select({
        locale: localesTable.locale,
        slug: localesTable.slug,
        status: localesTable.status,
        updated_at: localesTable.updated_at
      })
      .from(localesTable)
      .where(eq(localesTable[`${collectionSlug}_id`], itemId));
    return rows as Array<{
      locale: string;
      slug: string | null;
      status: string | null;
      updated_at: Date | string | null;
    }>;
  } catch {
    return [];
  }
}

/**
 * Enrich a single collection item with blocks, breadcrumbs, authors, etc.
 */
async function enrichCollectionItem(
  item: any,
  collectionSlug: string,
  options: {
    includeBlocks: boolean | 'grouped';
    includeBreadcrumbs: boolean;
    includeAuthors: boolean;
    includeTranslations?: boolean;
    status?: RelationStatus;
  }
): Promise<CollectionItem> {
  const {
    includeBlocks,
    includeBreadcrumbs,
    includeAuthors,
    includeTranslations = false,
    status = 'published'
  } = options;

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
    // `includeBlocks: 'grouped'` returns the block-grouping tree (blocks + group
    // nodes with `.blocks` children) on `.blocks`; `true` keeps the flat list.
    enrichedItem.blocks =
      includeBlocks === 'grouped'
        ? await loadGroupedBlocksForCollection(blockParentId, { status })
        : await loadBlocksForCollection(blockParentId, { status });
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

  if (includeTranslations) {
    (enrichedItem as any).translations = await loadCollectionTranslations(
      enrichedItem.id,
      collectionSlug
    );
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
 * Get all descendant items recursively for any global or collection type.
 *
 * `targetKind` is passed rather than probed. Probing by try/catch does not work
 * here: `getGlobals` on an unknown slug warns and returns `null` instead of
 * throwing, so a collection target used to take the global branch, come back
 * empty, and bail before the collection lookup was ever reached.
 */
export async function getAllDescendantItems(
  parentSlug: string,
  targetType: string,
  targetKind: 'global' | 'collection'
): Promise<string[]> {
  const allSlugs = new Set<string>();
  const isGlobal = targetKind === 'global';

  async function getChildren(slug: string) {
    const itemResult = isGlobal
      ? await getGlobals(targetType, { itemSlug: slug, withRelations: true })
      : await getCollections(targetType, { itemSlug: slug });

    if (!itemResult) {
      console.warn(`Could not find item with slug '${slug}' in ${targetKind} '${targetType}'`);
      return;
    }

    const item = itemResult as any;
    if (typeof item.slug !== 'string') return;

    // Doubles as the cycle guard: a parent_id loop would otherwise recurse forever.
    if (allSlugs.has(item.slug)) return;
    allSlugs.add(item.slug);

    const childrenResult = isGlobal
      ? await getGlobals(targetType, { parentId: item.id, withRelations: true })
      : await getCollections(targetType, { parentId: item.id });

    if (childrenResult && 'items' in childrenResult && childrenResult.items) {
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
