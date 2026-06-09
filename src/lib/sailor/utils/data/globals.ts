import { db } from 'sailorcms/core/db/index.server';
import { sql, ne, eq, asc, desc, and, count } from 'drizzle-orm';
import { liveOnly } from 'sailorcms/core/db/soft-delete';
import { globalTypes, files } from '$sailor/generated/schema';
import * as schema from '$sailor/generated/schema';
import { fieldConfigurations } from '$sailor/generated/fields';
import type { GlobalTypes } from '$sailor/generated/types';
import type { Pagination } from 'sailorcms/core/types';
import { TagService } from 'sailorcms/core/services/tag.server';
import { SearchIndexService } from 'sailorcms/core/services/search-index.server';
import { runTemplateHook } from 'sailorcms/core/hooks/template-hooks';
import { generateUUID } from 'sailorcms/core/utils/common';
import { globalDefinitions } from '$sailor/templates/globals';
import { log } from 'sailorcms/core/utils/logger';
import { loadFileFields } from './loaders/file-loader';
import { loadArrayFields } from './loaders/array-loader';
import {
  loadOneToXRelations,
  loadManyToManyRelations,
  type RelationStatus
} from './loaders/relation-loader';
import { assertAccess, AccessDeniedError } from './access';
import { parseDate, groupItemsByField } from './internal';
import { getContentSettings, buildLocaleHref } from './collections';

/**
 * True if the consumer marked this global `localized: true` in its template.
 * Mirrors `isLocalizedCollection` in collections.ts.
 */
function isLocalizedGlobal(slug: string): boolean {
  return (fieldConfigurations as any).globals?.[slug]?.localized === true;
}

/**
 * Load all fields (files, arrays, relations) for a global
 * Global-specific implementation that knows about global table naming conventions
 */
async function loadGlobalFields(
  global: any,
  globalSlug: string,
  globalSchema: Record<string, any>,
  loadFullFileObjects: boolean = false,
  status: RelationStatus = 'published'
): Promise<void> {
  // Child tables (files, arrays, junctions) anchor on `global_<slug>` for
  // both localized and non-localized — the generator keeps the same names
  // for both modes. For localized rows the FK columns (`parent_id`,
  // `global_id`) point at the `_locales` row id, supplied by callers as
  // `_localeId`.
  const tablePrefix = `global_${globalSlug}`;
  const junctionPrefix = globalSlug;

  // Load file fields
  await loadFileFields(global, globalSchema, tablePrefix, loadFullFileObjects);

  // Load array fields
  await loadArrayFields(
    global,
    globalSchema,
    tablePrefix,
    'global_id',
    loadFullFileObjects,
    status
  );

  // Load one-to-one and one-to-many relations
  await loadOneToXRelations(global, globalSchema, loadFullFileObjects, status);

  // Load many-to-many relations
  await loadManyToManyRelations(
    global,
    globalSchema,
    junctionPrefix,
    'global_id',
    loadFullFileObjects,
    status
  );
}

type User = {
  id: string;
  email: string;
  name: string;
  role: string;
  image?: string | null;
};

export interface GlobalWithData {
  id: string;
  slug: string;
  name_singular: string;
  name_plural: string;
  description: string | null;
  created_at: Date;
  updated_at: Date;
  [key: string]: any; // Dynamic fields from the global
}

export interface GlobalsOptions {
  // Single item queries
  itemSlug?: string; // Get specific item by slug
  itemId?: string; // Get specific item by ID

  // Multiple item queries
  parentId?: string; // Get children of this parent
  siblingOf?: string; // Get siblings of this item
  excludeCurrent?: boolean; // For siblings query (default: true)

  // Loading options
  withRelations?: boolean; // Include items relation for relational globals (default: true)
  withTags?: boolean; // Include tags for the global (default: false)
  loadFullFileObjects?: boolean; // Load full file objects vs just IDs (default: false)
  /**
   * Attach `translations: Array<{ locale, slug, status, updated_at }>` to
   * each returned item — one entry per row in `<global>_locales` for that
   * item. Use for language switchers, hreflang generation, sitemaps, and
   * staleness comparison (each translation's `updated_at` against the
   * default locale's tells you whether a sibling may be out of date).
   * Opt-in: costs one extra query per item. Always empty for non-localized
   * globals.
   */
  includeTranslations?: boolean;
  // Content visibility filter applied to repeatable globals (the top-level
  // rows), AND propagated to relation targets (a global field pointing at a
  // collection). Defaults to 'published' so the public site never picks up
  // drafts. Pass 'all' for admin previews. Singleton (`dataType: 'flat'`)
  // globals have no status column and ignore this option.
  status?: RelationStatus;

  // Filtering and ordering
  groupBy?: string;
  orderBy?: string; // Default: 'sort'
  order?: 'asc' | 'desc'; // Default: 'asc'
  limit?: number;
  offset?: number;

  // Pagination URL generation (same shape as getCollections).
  // Populate `pagination` on the result when both `limit` and `baseUrl` are provided.
  baseUrl?: string;
  currentPage?: number;
  /**
   * Sugar over `baseUrl` for localized list routes — pass `'/projects'`
   * and pagination URLs get the locale-correct prefix applied via
   * `urlStrategy`. See `CollectionsOptions.routePattern`. Explicit
   * `baseUrl` always wins; no-op when i18n isn't configured.
   */
  routePattern?: string;

  // Relationship filtering
  whereRelated?: {
    field: string; // The relation field name (e.g., 'categories')
    value: string | string[]; // Category slug(s) to filter by
  };

  // Security
  user?: User | null; // User context for ACL filtering

  // Localization (only meaningful for globals declared `localized: true`)
  /** BCP-47 locale to fetch; defaults to `content.i18n.default` from settings. */
  locale?: string;
  /** Behavior when the requested locale has no row for an item: `'default'` returns the default-locale row stamped `isFallback: true` + `requestedLocale: <asked-for code>` so consumers can render a banner; `'strict'` returns null/omits. */
  fallback?: 'default' | 'strict';
}

// Return types
export type GlobalsSingleResult<T extends GlobalTypes = GlobalTypes> = T | null;
export type GlobalsMultipleResult<T extends GlobalTypes = GlobalTypes> = {
  items: T[];
  total: number;
  hasMore: boolean;
  grouped?: Record<string, T[]>;
  pagination?: Pagination;
};

/**
 * Get globals - single function for all global queries
 *
 * @example
 * ```typescript
 * // Multiple items
 * const navItems = await getGlobals('navigation');
 * const children = await getGlobals('navigation', { parentId: 'parent-id' });
 * const siblings = await getGlobals('navigation', { siblingOf: 'item-id' });
 *
 * // Single items
 * const settings = await getGlobals('settings', { itemSlug: 'main' });
 * const item = await getGlobals('navigation', { itemId: 'item-id' });
 *
 * // With options
 * const items = await getGlobals('navigation', {
 *   withTags: true,
 *   orderBy: 'created_at',
 *   order: 'desc',
 *   user: locals.user
 * });
 * ```
 */
// Overload: When itemSlug is provided, return single result
export async function getGlobals<T extends GlobalTypes = GlobalTypes>(
  globalSlug: string,
  options: GlobalsOptions & { itemSlug: string }
): Promise<GlobalsSingleResult<T>>;
// Overload: When itemId is provided, return single result
export async function getGlobals<T extends GlobalTypes = GlobalTypes>(
  globalSlug: string,
  options: GlobalsOptions & { itemId: string }
): Promise<GlobalsSingleResult<T>>;
// Overload: Otherwise, return multiple result
export async function getGlobals<T extends GlobalTypes = GlobalTypes>(
  globalSlug: string,
  options?: GlobalsOptions
): Promise<GlobalsMultipleResult<T>>;
// Implementation — public path, access rule enforced.
export async function getGlobals<T extends GlobalTypes = GlobalTypes>(
  globalSlug: string,
  options?: GlobalsOptions
): Promise<GlobalsSingleResult<T> | GlobalsMultipleResult<T>> {
  return _loadGlobalImpl<T>(globalSlug, options, true);
}

/**
 * Sugar over `getGlobals` that pulls `locale` and `user` off `event` —
 * mirror of `getCollectionsFor`. See its docstring for the rationale +
 * dependency-tag behavior. Use in localized route loaders to skip the
 * `const locale = ... ?? getDefaultLocale()` + `dependsOnContentLocale`
 * ceremony.
 *
 * ```ts
 * import { getGlobalsFor } from 'sailorcms/utils/data';
 *
 * export const load = async (event) => {
 *   const menu = await getGlobalsFor(event, 'menus', { itemSlug: 'main' });
 *   return { menu };
 * };
 * ```
 */
export async function getGlobalsFor<T extends GlobalTypes = GlobalTypes>(
  event: { locals: App.Locals; depends?: (id: string) => void },
  globalSlug: string,
  options: GlobalsOptions & { itemSlug: string }
): Promise<GlobalsSingleResult<T>>;
export async function getGlobalsFor<T extends GlobalTypes = GlobalTypes>(
  event: { locals: App.Locals; depends?: (id: string) => void },
  globalSlug: string,
  options: GlobalsOptions & { itemId: string }
): Promise<GlobalsSingleResult<T>>;
export async function getGlobalsFor<T extends GlobalTypes = GlobalTypes>(
  event: { locals: App.Locals; depends?: (id: string) => void },
  globalSlug: string,
  options?: GlobalsOptions
): Promise<GlobalsMultipleResult<T>>;
export async function getGlobalsFor<T extends GlobalTypes = GlobalTypes>(
  event: { locals: App.Locals; depends?: (id: string) => void },
  globalSlug: string,
  options?: GlobalsOptions
): Promise<GlobalsSingleResult<T> | GlobalsMultipleResult<T>> {
  if (typeof event.depends === 'function') {
    try {
      event.depends('sailor:content-locale');
    } catch {
      // depends() may throw outside a load context — ignore.
    }
  }
  return getGlobals<T>(globalSlug, {
    ...options,
    locale: options?.locale ?? event.locals.contentLocale,
    user: options?.user ?? (event.locals.user as any) ?? null
  });
}

/**
 * Framework-internal read for globals. Skips the type-level `access` rule
 * because the caller is the framework itself (search index rebuild, hooks,
 * cron jobs) and has no user context to authenticate as. Re-exported from
 * `core/services/data-read.server.ts` as `readGlobal` — that is the canonical
 * import path. Consumer code reads via `getGlobals`.
 *
 * @internal
 */
export async function _loadGlobalUnchecked<T extends GlobalTypes = GlobalTypes>(
  globalSlug: string,
  options?: GlobalsOptions
): Promise<GlobalsSingleResult<T> | GlobalsMultipleResult<T>> {
  return _loadGlobalImpl<T>(globalSlug, options, false);
}

async function _loadGlobalImpl<T extends GlobalTypes = GlobalTypes>(
  globalSlug: string,
  options: GlobalsOptions | undefined,
  checkAccess: boolean
): Promise<GlobalsSingleResult<T> | GlobalsMultipleResult<T>> {
  const {
    itemSlug,
    itemId,
    parentId,
    siblingOf,
    excludeCurrent = true,
    withRelations = true,
    withTags = false,
    loadFullFileObjects = false,
    includeTranslations = false,
    status = 'published',
    groupBy,
    orderBy = 'sort',
    order = 'asc',
    limit,
    offset = 0,
    baseUrl,
    currentPage,
    routePattern,
    user: _user, // Reserved for future ACL implementation
    locale,
    fallback
  } = options || {};

  // Determine if this is a single item query
  const isSingleQuery = !!(itemSlug || itemId);
  const isLocalized = isLocalizedGlobal(globalSlug);

  // routePattern → baseUrl derivation, same shape as collections — see
  // `_loadCollectionImpl` for the rationale.
  let resolvedBaseUrl = baseUrl;
  if (!resolvedBaseUrl && routePattern) {
    const { defaultLocale } = getContentSettings();
    if (defaultLocale) {
      const section = routePattern.replace(/^\/+/, '') || undefined;
      resolvedBaseUrl = buildLocaleHref({
        locale: locale ?? defaultLocale,
        translation: null,
        section
      });
    } else {
      resolvedBaseUrl = routePattern;
    }
  }

  try {
    // Get global type definition
    const globalType = await db.query.globalTypes.findFirst({
      where: eq(globalTypes.slug, globalSlug)
    });

    if (!globalType) {
      console.warn(`Global type '${globalSlug}' not found`);
      return isSingleQuery ? null : { items: [], total: 0, hasMore: false };
    }

    if (checkAccess) {
      // Enforce type-level access before any DB work. Throws AccessDeniedError
      // on miss — never returns silently. Default rule is 'public' so untouched
      // templates keep their current behavior.
      const persistedOptions = globalType.options ? JSON.parse(globalType.options) : {};
      assertAccess(persistedOptions.access, _user, `Global '${globalSlug}'`);
    }

    const isFlat = globalType.data_type === 'flat';

    // Handle singleton globals
    if (isFlat) {
      if (isLocalized) {
        return await handleSingletonLocalizedGlobal<T>(globalSlug, globalType, {
          withRelations,
          withTags,
          loadFullFileObjects,
          includeTranslations,
          status,
          locale,
          fallback
        });
      }
      return await handleSingletonGlobal<T>(globalSlug, globalType, {
        withRelations,
        withTags,
        loadFullFileObjects,
        includeTranslations,
        status
      });
    }

    // Repeatable globals — localized branch routes to single-item or
    // multi-item handler depending on whether the caller asked for one item.
    if (isLocalized) {
      if (isSingleQuery) {
        return await handleRepeatableLocalizedGlobalSingle<T>(globalSlug, globalType, {
          itemSlug,
          itemId,
          withRelations,
          withTags,
          loadFullFileObjects,
          includeTranslations,
          status,
          locale,
          fallback,
          user: _user
        });
      }
      return await handleRepeatableLocalizedGlobalMulti<T>(globalSlug, globalType, {
        parentId,
        siblingOf,
        excludeCurrent,
        withRelations,
        withTags,
        loadFullFileObjects,
        includeTranslations,
        status,
        groupBy,
        orderBy,
        order,
        limit,
        offset,
        baseUrl: resolvedBaseUrl,
        currentPage,
        locale,
        fallback,
        user: _user
      });
    }

    // Handle repeatable globals
    return await handleRepeatableGlobal<T>(globalSlug, globalType, {
      isSingleQuery,
      itemSlug,
      itemId,
      parentId,
      siblingOf,
      excludeCurrent,
      withRelations,
      withTags,
      loadFullFileObjects,
      includeTranslations,
      status,
      groupBy,
      orderBy,
      order,
      limit,
      offset,
      baseUrl: resolvedBaseUrl,
      currentPage,
      user: _user
    });
  } catch (err) {
    // Access failures must propagate — otherwise they become a silent empty
    // result, which is the exact failure mode the type-level gate exists to
    // prevent.
    if (err instanceof AccessDeniedError) throw err;
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error(`Failed to load globals '${globalSlug}':`, errorMessage);
    return isSingleQuery ? null : { items: [], total: 0, hasMore: false };
  }
}

/**
 * Handle singleton (flat) globals
 */
async function handleSingletonGlobal<T extends GlobalTypes = GlobalTypes>(
  globalSlug: string,
  globalType: any,
  options: {
    withRelations: boolean;
    withTags: boolean;
    loadFullFileObjects: boolean;
    includeTranslations: boolean;
    status: RelationStatus;
  }
): Promise<GlobalsSingleResult<T>> {
  const { withRelations, withTags, loadFullFileObjects, includeTranslations, status } = options;

  const globalTable = schema[`global_${globalSlug}` as keyof typeof schema];
  if (!globalTable) {
    console.warn(`Global table for '${globalSlug}' not found in schema`);
    return null;
  }

  const globalResult = await db
    .select()
    .from(globalTable)
    .where(and(eq((globalTable as any).id, globalSlug), liveOnly(globalTable)))
    .limit(1);

  if (globalResult.length === 0) {
    // Distinguish "not created yet" from the id≠slug footgun: a flat global is a
    // singleton keyed by id == slug, so a row with any other id is invisible to
    // this lookup. Surface that explicitly rather than a vague "not found".
    const mismatched = await db
      .select({ id: (globalTable as any).id })
      .from(globalTable)
      .where(ne((globalTable as any).id, globalSlug))
      .limit(1);
    if (mismatched.length > 0) {
      console.warn(
        `Flat global '${globalSlug}': a row exists with id '${mismatched[0].id}', but singleton globals must be keyed by slug (row id = slug) — so it's invisible to getGlobals('${globalSlug}'). Fix the row id; run 'npx sailor doctor' (globals:flat-id-mismatch) to locate it.`
      );
    } else {
      console.warn(`Global data for '${globalSlug}' not found`);
    }
    return null;
  }

  const globalData = globalResult[0] as any;
  const enrichedGlobal = await enrichGlobalItem<T>(globalData, globalSlug, globalType, {
    withRelations,
    withTags,
    loadFullFileObjects,
    includeTranslations,
    status
  });

  return enrichedGlobal;
}

/**
 * Singleton (flat) global with localization. Main row id == globalSlug
 * (existing convention); content lives on `global_<slug>_locales`. JOIN +
 * locale resolution mirror the collection single-item path.
 */
async function handleSingletonLocalizedGlobal<T extends GlobalTypes = GlobalTypes>(
  globalSlug: string,
  globalType: any,
  options: {
    withRelations: boolean;
    withTags: boolean;
    loadFullFileObjects: boolean;
    includeTranslations: boolean;
    status: RelationStatus;
    locale?: string;
    fallback?: 'default' | 'strict';
  }
): Promise<GlobalsSingleResult<T>> {
  const {
    withRelations,
    withTags,
    loadFullFileObjects,
    includeTranslations,
    status,
    locale,
    fallback
  } = options;

  const mainTableName = `global_${globalSlug}`;
  const localesTableName = `${mainTableName}_locales`;
  const mainTable = (schema as any)[mainTableName];
  const localesTable = (schema as any)[localesTableName];

  if (!mainTable || !localesTable) {
    console.warn(`Localized global '${globalSlug}' is missing tables. Run 'npx sailor db:update'.`);
    return null;
  }

  const { defaultLocale, fallback: settingsFallback } = getContentSettings();
  const fallbackMode = fallback ?? settingsFallback;
  const requestedLocale = locale ?? defaultLocale;
  if (!requestedLocale) {
    console.error(
      `getGlobals('${globalSlug}', ...): no locale resolved. Pass { locale } or set content.i18n.default.`
    );
    return null;
  }

  const fkField = `${globalSlug}_id`;

  const runQuery = async (resolveLocale: string) =>
    db
      .select({ main: mainTable, locale: localesTable })
      .from(mainTable)
      .innerJoin(localesTable, eq(localesTable[fkField], mainTable.id))
      .where(
        and(
          eq(mainTable.id, globalSlug),
          liveOnly(mainTable),
          eq(localesTable.locale, resolveLocale)
        )
      )
      .limit(1);

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
  const { id: localeRowId, [fkField]: _ignored, ...localeContent } = localeRow;
  const flat: any = {
    ...mainRow,
    ...localeContent,
    _localeId: localeRowId
  };
  if (fellBack) {
    flat.isFallback = true;
    flat.requestedLocale = requestedLocale;
  }

  const enriched = await enrichGlobalItem<T>(flat, globalSlug, globalType, {
    withRelations,
    withTags,
    loadFullFileObjects,
    includeTranslations,
    status
  });

  return enriched;
}

/**
 * Single-item read for a localized repeatable global. Mirrors the collection
 * single-item path: JOIN by item id, resolve locale, optional fallback.
 */
async function handleRepeatableLocalizedGlobalSingle<T extends GlobalTypes = GlobalTypes>(
  globalSlug: string,
  globalType: any,
  options: {
    itemSlug?: string;
    itemId?: string;
    withRelations: boolean;
    withTags: boolean;
    loadFullFileObjects: boolean;
    includeTranslations: boolean;
    status: RelationStatus;
    locale?: string;
    fallback?: 'default' | 'strict';
    user?: User | null;
  }
): Promise<GlobalsSingleResult<T>> {
  const {
    itemSlug,
    itemId,
    withRelations,
    withTags,
    loadFullFileObjects,
    includeTranslations,
    status,
    locale,
    fallback
  } = options;

  const mainTableName = `global_${globalSlug}`;
  const localesTableName = `${mainTableName}_locales`;
  const mainTable = (schema as any)[mainTableName];
  const localesTable = (schema as any)[localesTableName];

  if (!mainTable || !localesTable) {
    console.warn(`Localized global '${globalSlug}' is missing tables. Run 'npx sailor db:update'.`);
    return null;
  }

  const { defaultLocale, fallback: settingsFallback } = getContentSettings();
  const fallbackMode = fallback ?? settingsFallback;
  const requestedLocale = locale ?? defaultLocale;
  if (!requestedLocale) {
    console.error(
      `getGlobals('${globalSlug}', ...): no locale resolved. Pass { locale } or set content.i18n.default.`
    );
    return null;
  }

  const fkField = `${globalSlug}_id`;

  const runQuery = async (resolveLocale: string) => {
    const conditions: any[] = [liveOnly(mainTable), eq(localesTable.locale, resolveLocale)];
    if (itemId) conditions.push(eq(mainTable.id, itemId));
    if (itemSlug) conditions.push(eq(localesTable.slug, itemSlug));
    if (status !== 'all' && localesTable.status) {
      conditions.push(eq(localesTable.status, status));
    }
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
  const { id: localeRowId, [fkField]: _ignored, ...localeContent } = localeRow;
  const flat: any = { ...mainRow, ...localeContent, _localeId: localeRowId };
  if (fellBack) {
    flat.isFallback = true;
    flat.requestedLocale = requestedLocale;
  }

  return enrichGlobalItem<T>(flat, globalSlug, globalType, {
    withRelations,
    withTags,
    loadFullFileObjects,
    includeTranslations,
    status
  });
}

/**
 * Multi-item read for a localized repeatable global. Mirrors the collection
 * multi-item localized path: INNER JOIN main + `_locales` filtered by the
 * requested locale — items without a translation in that locale are omitted
 * from the list (strict semantics; single-item path honors `fallback`).
 *
 * `status` / `parent_id` / `sort` live on `_locales` for localized globals,
 * so filters and ordering target the locale table when present. Pagination +
 * grouping mirror `handleRepeatableGlobal`.
 */
async function handleRepeatableLocalizedGlobalMulti<T extends GlobalTypes = GlobalTypes>(
  globalSlug: string,
  globalType: any,
  options: {
    parentId?: string;
    siblingOf?: string;
    excludeCurrent: boolean;
    withRelations: boolean;
    withTags: boolean;
    loadFullFileObjects: boolean;
    includeTranslations: boolean;
    status: RelationStatus;
    groupBy?: string;
    orderBy: string;
    order: 'asc' | 'desc';
    limit?: number;
    offset: number;
    baseUrl?: string;
    currentPage?: number;
    locale?: string;
    fallback?: 'default' | 'strict';
    user?: User | null;
  }
): Promise<GlobalsMultipleResult<T>> {
  const {
    parentId,
    siblingOf,
    excludeCurrent,
    withRelations,
    withTags,
    loadFullFileObjects,
    includeTranslations,
    status,
    groupBy,
    orderBy,
    order,
    limit,
    offset,
    baseUrl,
    currentPage,
    locale,
    fallback
  } = options;

  const mainTableName = `global_${globalSlug}`;
  const localesTableName = `${mainTableName}_locales`;
  const mainTable = (schema as any)[mainTableName];
  const localesTable = (schema as any)[localesTableName];

  if (!mainTable || !localesTable) {
    console.warn(`Localized global '${globalSlug}' is missing tables. Run 'npx sailor db:update'.`);
    return { items: [], total: 0, hasMore: false };
  }

  const { defaultLocale, fallback: settingsFallback } = getContentSettings();
  // fallback is destructured but only used for symmetry with single-item path;
  // multi-item localized uses INNER JOIN (no per-row fallback to default).
  void (fallback ?? settingsFallback);
  const requestedLocale = locale ?? defaultLocale;
  if (!requestedLocale) {
    console.error(
      `getGlobals('${globalSlug}', ...): no locale resolved. Pass { locale } or set content.i18n.default.`
    );
    return { items: [], total: 0, hasMore: false };
  }

  const fkField = `${globalSlug}_id`;

  const whereConditions: any[] = [liveOnly(mainTable), eq(localesTable.locale, requestedLocale)];

  // Status / parent_id live on `_locales` for localized — guarded by column
  // presence because some globals omit them (flat-shaped templates).
  if (status !== 'all' && localesTable.status) {
    whereConditions.push(eq(localesTable.status, status));
  }
  if (parentId && localesTable.parent_id) {
    whereConditions.push(eq(localesTable.parent_id, parentId));
  }

  if (siblingOf && localesTable.parent_id) {
    const siblingRow = await db
      .select({ parent_id: localesTable.parent_id })
      .from(mainTable)
      .innerJoin(
        localesTable,
        and(
          eq(localesTable[fkField], (mainTable as any).id),
          eq(localesTable.locale, requestedLocale)
        )
      )
      .where(eq((mainTable as any).id, siblingOf))
      .limit(1);
    if (siblingRow.length > 0 && siblingRow[0].parent_id) {
      whereConditions.push(eq(localesTable.parent_id, siblingRow[0].parent_id));
      if (excludeCurrent) {
        whereConditions.push(ne((mainTable as any).id, siblingOf));
      }
    } else {
      whereConditions.push(sql`1 = 0`);
    }
  }

  const whereClause = and(...whereConditions);

  // Parallel count + items, same pattern as collections.
  const countPromise = db
    .select({ count: count() })
    .from(mainTable)
    .innerJoin(localesTable, eq(localesTable[fkField], (mainTable as any).id))
    .where(whereClause);

  let itemsQuery: any = db
    .select({ main: mainTable, locale: localesTable })
    .from(mainTable)
    .innerJoin(localesTable, eq(localesTable[fkField], (mainTable as any).id))
    .where(whereClause);

  // Ordering: column might live on main (created_at) or `_locales` (sort,
  // updated_at, slug, status). Pick whichever table has it; skip if neither.
  if (orderBy) {
    const onMain = (mainTable as any)[orderBy];
    const onLocale = (localesTable as any)[orderBy];
    const targetCol = onMain ?? onLocale;
    if (targetCol) {
      const orderFn = order === 'desc' ? desc : asc;
      itemsQuery = itemsQuery.orderBy(orderFn(targetCol));
    }
  }

  if (limit) itemsQuery = itemsQuery.limit(limit).offset(offset);

  const [countResult, rows] = await Promise.all([countPromise, itemsQuery]);
  const total = Number(countResult[0]?.count ?? 0);

  // Flatten {main, locale} rows. Identity comes from main; editable content
  // from locale. `_localeId` exposed for child loaders that anchor on it.
  const flatItems: any[] = (rows as any[]).map((row) => {
    const mainRow = row.main;
    const localeRow = row.locale;
    const { id: localeRowId, [fkField]: _ignoredFk, ...localeContent } = localeRow as any;
    return {
      ...mainRow,
      ...localeContent,
      _localeId: localeRowId
    };
  });

  const enrichedItems = await Promise.all(
    flatItems.map((item) =>
      enrichGlobalItem<T>(item, globalSlug, globalType, {
        withRelations,
        withTags,
        loadFullFileObjects,
        includeTranslations,
        status
      })
    )
  );

  const result: GlobalsMultipleResult<T> = {
    items: enrichedItems,
    total,
    hasMore: limit ? offset + enrichedItems.length < total : false
  };

  if (limit && baseUrl) {
    const pageNum = currentPage || Math.floor(offset / limit) + 1;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    result.pagination = {
      page: pageNum,
      pageSize: limit,
      totalItems: total,
      totalPages,
      hasNextPage: pageNum < totalPages,
      hasPreviousPage: pageNum > 1
    };
  }

  if (groupBy) {
    result.grouped = groupItemsByField(enrichedItems, groupBy);
  }

  return result;
}

/**
 * Handle repeatable globals
 */
async function handleRepeatableGlobal<T extends GlobalTypes = GlobalTypes>(
  globalSlug: string,
  globalType: any,
  options: {
    isSingleQuery: boolean;
    itemSlug?: string;
    itemId?: string;
    parentId?: string;
    siblingOf?: string;
    excludeCurrent: boolean;
    withRelations: boolean;
    withTags: boolean;
    loadFullFileObjects: boolean;
    includeTranslations: boolean;
    status: RelationStatus;
    groupBy?: string;
    orderBy: string;
    order: 'asc' | 'desc';
    limit?: number;
    offset: number;
    baseUrl?: string;
    currentPage?: number;
    user?: User | null;
  }
): Promise<GlobalsSingleResult<T> | GlobalsMultipleResult<T>> {
  const {
    isSingleQuery,
    itemSlug,
    itemId,
    parentId,
    siblingOf,
    excludeCurrent,
    withRelations,
    withTags,
    loadFullFileObjects,
    includeTranslations,
    status,
    groupBy,
    orderBy,
    order,
    limit,
    offset,
    baseUrl,
    currentPage,
    user: _user // Reserved for future ACL implementation
  } = options;

  const globalTable = schema[`global_${globalSlug}` as keyof typeof schema];
  if (!globalTable) {
    console.warn(`Global table for '${globalSlug}' not found in schema`);
    return isSingleQuery ? null : { items: [], total: 0, hasMore: false };
  }

  let queryBuilder = db.select().from(globalTable);
  const whereConditions = [liveOnly(globalTable)];

  // Content visibility filter — repeatable globals carry a `status` column;
  // singletons go through `handleSingletonGlobal` and never reach here, so we
  // can apply unconditionally.
  if (status !== 'all') {
    whereConditions.push(eq((globalTable as any).status, status));
  }

  // Handle different query types
  if (itemSlug) {
    whereConditions.push(eq((globalTable as any).slug, itemSlug));
  } else if (itemId) {
    whereConditions.push(eq((globalTable as any).id, itemId));
  } else if (parentId) {
    whereConditions.push(eq((globalTable as any).parent_id, parentId));
  } else if (siblingOf) {
    // Get siblings
    const siblingItem = await db
      .select({ parent_id: (globalTable as any).parent_id })
      .from(globalTable)
      .where(eq((globalTable as any).id, siblingOf))
      .limit(1);

    if (siblingItem.length > 0 && siblingItem[0].parent_id) {
      whereConditions.push(eq((globalTable as any).parent_id, siblingItem[0].parent_id));
      if (excludeCurrent) {
        whereConditions.push(ne((globalTable as any).id, siblingOf));
      }
    } else {
      // No parent found, no siblings
      whereConditions.push(sql`1 = 0`);
    }
  }

  const whereClause =
    whereConditions.length > 0
      ? whereConditions.length > 1
        ? and(...whereConditions)
        : whereConditions[0]
      : undefined;

  if (whereClause) queryBuilder = queryBuilder.where(whereClause);

  // Apply ordering for multiple items or when no specific filters
  if (!isSingleQuery || (!itemSlug && !itemId)) {
    const orderField = (globalTable as any)[orderBy];
    if (orderField) {
      const orderFn = order === 'desc' ? desc : asc;
      queryBuilder = queryBuilder.orderBy(orderFn(orderField));
    }
  }

  // Apply pagination for multiple items
  if (!isSingleQuery && limit) {
    queryBuilder = queryBuilder.limit(limit).offset(offset);
  } else if (isSingleQuery) {
    queryBuilder = queryBuilder.limit(1);
  }

  if (isSingleQuery) {
    const results = await queryBuilder;
    if (results.length === 0) return null;

    const item = await enrichGlobalItem<T>(results[0], globalSlug, globalType, {
      withRelations,
      withTags,
      loadFullFileObjects,
      includeTranslations,
      status
    });
    return item;
  }

  // Parallel count + items query (mirrors getCollections). The count covers
  // the full where clause, independent of pagination — so `total` and
  // `hasMore` reflect the DB, not just the slice we fetched.
  const countQuery = whereClause
    ? db.select({ count: count() }).from(globalTable).where(whereClause)
    : db.select({ count: count() }).from(globalTable);
  const [countResult, results] = await Promise.all([countQuery, queryBuilder]);
  const total = Number(countResult[0]?.count ?? 0);

  const enrichedItems = await Promise.all(
    results.map((item: Record<string, any>) =>
      enrichGlobalItem<T>(item, globalSlug, globalType, {
        withRelations,
        withTags,
        loadFullFileObjects,
        includeTranslations,
        status
      })
    )
  );

  const result: GlobalsMultipleResult<T> = {
    items: enrichedItems,
    total,
    hasMore: limit ? offset + enrichedItems.length < total : false
  };

  if (limit && baseUrl) {
    const pageNum = currentPage || Math.floor(offset / limit) + 1;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    result.pagination = {
      page: pageNum,
      pageSize: limit,
      totalItems: total,
      totalPages,
      hasNextPage: pageNum < totalPages,
      hasPreviousPage: pageNum > 1
    };
  }

  // Group items if requested
  if (groupBy) {
    result.grouped = groupItemsByField(enrichedItems, groupBy);
  }

  return result;
}

/**
 * Per-item translations enrichment for globals. One row per (item × locale)
 * in `<global>_locales`. Cheap single query keyed on the FK. Returns an
 * empty array for non-localized globals. `slug` / `status` columns may not
 * exist on every locales table (slug is optional on flat globals; status
 * defaults from CORE_FIELDS for repeatable) — defensively project only
 * what's present.
 */
async function loadGlobalTranslations(
  itemId: string,
  globalSlug: string
): Promise<
  Array<{
    locale: string;
    slug: string | null;
    status: string | null;
    updated_at: Date | string | null;
  }>
> {
  if (!isLocalizedGlobal(globalSlug)) return [];
  const localesTable = (schema as any)[`global_${globalSlug}_locales`];
  if (!localesTable) return [];
  const projection: Record<string, any> = { locale: localesTable.locale };
  if (localesTable.slug) projection.slug = localesTable.slug;
  if (localesTable.status) projection.status = localesTable.status;
  if (localesTable.updated_at) projection.updated_at = localesTable.updated_at;
  try {
    const rows = await db
      .select(projection)
      .from(localesTable)
      .where(eq(localesTable[`${globalSlug}_id`], itemId));
    return rows.map((r: any) => ({
      locale: r.locale,
      slug: r.slug ?? null,
      status: r.status ?? null,
      updated_at: r.updated_at ?? null
    }));
  } catch {
    return [];
  }
}

/**
 * Enrich a single global item with relations, tags, and data
 */
async function enrichGlobalItem<T extends GlobalTypes = GlobalTypes>(
  item: Record<string, any>,
  globalSlug: string,
  globalType: Record<string, any>,
  options: {
    withRelations: boolean;
    withTags: boolean;
    loadFullFileObjects: boolean;
    includeTranslations?: boolean;
    status: RelationStatus;
  }
): Promise<T> {
  const { withRelations, withTags, loadFullFileObjects, includeTranslations, status } = options;

  const enrichedItem: any = {
    ...item,
    created_at: parseDate(item.created_at),
    updated_at: parseDate(item.updated_at)
  };

  // Load tags if requested. Tags live under `taggable_type = 'global_<slug>'`
  // for both modes. For localized globals the `taggable_id` is the `_locales`
  // row id (callers pass it as `_localeId`); ids never collide across modes
  // so the type discriminator stays mode-agnostic.
  if (withTags) {
    try {
      const taggableType = `global_${globalSlug}`;
      const taggableId = (enrichedItem as any)._localeId ?? enrichedItem.id;
      const tags = await TagService.getTagsForEntity(taggableType, taggableId);
      const globalFields = JSON.parse(globalType.schema);
      Object.entries(globalFields).forEach(([fieldName, fieldDef]) => {
        if ((fieldDef as any).type === 'tags') {
          enrichedItem[fieldName] = tags;
        }
      });
    } catch (err) {
      console.warn(`Failed to load tags for global '${globalSlug}':`, err);
    }
  }

  // Load items relation if requested
  if (withRelations) {
    try {
      const relationTableName = `global_${globalSlug}_items`;
      const relationTable = schema[relationTableName as keyof typeof schema];

      if (relationTable) {
        const relationResult = await db
          .select()
          .from(relationTable)
          .where(eq((relationTable as any).global_id, enrichedItem.id))
          .orderBy(asc((relationTable as any).sort));
        enrichedItem.items = relationResult;
      } else {
        enrichedItem.items = [];
      }
    } catch (err) {
      console.error(`Error loading relations for ${enrichedItem.id}:`, err);
      enrichedItem.items = [];
    }
  }

  // Load global data (arrays, files, many-to-many relations)
  if (withRelations) {
    try {
      const globalFields = JSON.parse(globalType.schema);
      const preservedItems = enrichedItem.items;

      await loadGlobalFields(enrichedItem, globalSlug, globalFields, loadFullFileObjects, status);

      enrichedItem.items = preservedItems;
    } catch (err) {
      console.warn(`Failed to load global data for '${globalSlug}':`, err);
    }
  }

  if (includeTranslations) {
    enrichedItem.translations = await loadGlobalTranslations(enrichedItem.id, globalSlug);
  }

  return enrichedItem as T;
}

/**
 * Utility to get all available global types
 *
 * @example
 * ```typescript
 * const globalTypes = await getAvailableGlobalTypes();
 * // Returns: ['navigation', 'settings', 'footer', ...]
 * ```
 */
export async function getAvailableGlobalTypes(): Promise<string[]> {
  const globalTypes = await db.query.globalTypes.findMany();
  return globalTypes.map((gt: any) => gt.slug);
}

/**
 * Utility to check if a global type exists
 *
 * @example
 * ```typescript
 * if (await globalTypeExists('site_settings')) {
 *   // Global type is available
 * }
 * ```
 */
export async function globalTypeExists(globalType: string): Promise<boolean> {
  const availableTypes = await getAvailableGlobalTypes();
  return availableTypes.includes(globalType);
}

export interface CreateGlobalItemOptions {
  /** Slug of a repeatable global, e.g. `'submissions'`. */
  slug: string;
  /** Column values for the new row. Required columns (per the generated schema) must be present. */
  data: Record<string, unknown>;
  /** User id stored as `author` + `last_modified_by`. Defaults to `null` (anonymous). */
  authorId?: string | null;
  /** Defaults to `'published'`. */
  status?: string;
}

export interface CreateGlobalItemResult {
  id: string;
}

/**
 * Insert a single item into a repeatable global. Use this from public-facing
 * endpoints (contact form, newsletter signup, anything where a visitor writes
 * to a CMS-managed table) instead of reaching into `core/db` directly.
 *
 * What this does beyond a raw `db.insert(...)`:
 *  - Validates `slug` against `globalDefinitions` and resolves the generated
 *    drizzle table, so a typo errors out here rather than as a cryptic Drizzle
 *    column mismatch.
 *  - Fills `id` (uuid), `status` (`'published'`), and `last_modified_by` /
 *    `author` defaults; `created_at` + `updated_at` come from the table's
 *    `$defaultFn`.
 *  - Calls `SearchIndexService.onSaveSafe('global', slug, id)` after insert so
 *    the row appears in the admin command palette (⌘K) immediately. Skipping
 *    this leaves the row out of the FTS index until the next `npx sailor
 *    search:reindex`.
 *
 * Does NOT enforce the global's `access.roles` — this helper is intended for
 * trusted server contexts that have already validated input (e.g. a
 * `+server.ts` route after CAPTCHA verification). Singleton globals
 * (`dataType: 'flat'`) and localized globals (`localized: true`) are not
 * supported — singletons upsert against a known id, and localized writes
 * need to land on `_locales` rows; both should go through the admin save path.
 *
 * @example
 * ```ts
 * import { createGlobalItem } from 'sailorcms/utils/data';
 *
 * const { id } = await createGlobalItem({
 *   slug: 'submissions',
 *   data: { subject, name, email, phone, message, inquiry_status: 'new' }
 * });
 * ```
 */
export async function createGlobalItem(
  opts: CreateGlobalItemOptions
): Promise<CreateGlobalItemResult> {
  const { slug, data, authorId = null, status = 'published' } = opts;

  const def = (globalDefinitions as Record<string, any>)[slug];
  if (!def) throw new Error(`Unknown global '${slug}'`);
  if (def.dataType === 'flat') {
    throw new Error(
      `createGlobalItem does not support singleton globals (slug='${slug}'); use the admin save path for these`
    );
  }
  if (isLocalizedGlobal(slug)) {
    throw new Error(
      `createGlobalItem does not support localized globals (slug='${slug}'); the public-endpoint shape doesn't carry a locale or write to _locales rows`
    );
  }

  const table = (schema as Record<string, any>)[`global_${slug}`];
  if (!table) throw new Error(`Generated table 'global_${slug}' not found`);

  const id = (data.id as string) || generateUUID();
  const insertData: Record<string, any> = {
    status,
    author: authorId,
    last_modified_by: authorId,
    ...data,
    id
  };

  await db.insert(table).values(insertData);
  await SearchIndexService.onSaveSafe('global', slug, id);

  // Fire the template's `afterCreate` hook for the public-endpoint case
  // (form submissions, signup feeds). `ctx.user` is null — we don't have a
  // session here; the consumer can derive from `ctx.item.author` if they
  // need the id. The hook runner traps + logs; failures never propagate
  // back into the caller's response.
  if (def.hooks?.afterCreate) {
    const [savedRow] = await db.select().from(table).where(eq(table.id, id)).limit(1);
    await runTemplateHook('afterCreate', def.hooks, {
      item: savedRow ?? insertData,
      slug,
      kind: 'global',
      user: null,
      log
    });
  }

  return { id };
}
