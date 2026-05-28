// Global-item loader for the admin edit page.
//
// Mirror of `core/data/loaders/collection-item.server.ts` for globals. Handles
// flat (singleton) and repeatable globals, with localized routing internalized.
//
// Side effect: for flat globals with no main row yet, this loader CREATES the
// singleton with default values (preserving the existing convention — flat
// globals are implicitly auto-instantiated on first view). All other dataTypes
// stay read-only.
//
// Auth is the caller's responsibility.

import { db } from '../../db/index.server';
import * as schema from '$sailor/generated/schema';
import { fieldConfigurations } from '$sailor/generated/fields';
import { eq, and, asc } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { getCurrentTimestamp } from '../../utils/date';
import { getContentSettings } from '../../../utils/data/collections';

export interface LoadGlobalItemOptions {
  slug: string;
  /** Required for repeatable globals; ignored for flat (uses slug as id). */
  itemId?: string;
  user: { id: string } | null;
  /** Locale for localized globals; defaults to `content.i18n.default`. */
  locale?: string;
}

export interface LoadGlobalItemResult {
  item: Record<string, any>;
  isNewItem: boolean;
  global: {
    id: string;
    name: { singular: string; plural: string };
    slug: string;
    description: string | null;
    dataType: string;
    fields: Record<string, any>;
    options: Record<string, any>;
    created_at: Date;
    updated_at: Date;
  };
  // Localization
  localized: boolean;
  availableLocales: string[];
  currentLocale: string | null;
  translatedLocales: string[];
}

export async function loadGlobalItem(opts: LoadGlobalItemOptions): Promise<LoadGlobalItemResult> {
  const { slug, locale } = opts;

  // Get global definition from database
  const globalTypeRow = await db.query.globalTypes.findFirst({
    where: (globalTypes: any, { eq }: any) => eq(globalTypes.slug, slug)
  });

  if (!globalTypeRow) {
    const err = new Error('Global not found') as Error & { notFound?: boolean };
    err.notFound = true;
    throw err;
  }

  const globalDefinition = {
    id: globalTypeRow.id,
    name: {
      singular: globalTypeRow.name_singular,
      plural: globalTypeRow.name_plural
    },
    slug: globalTypeRow.slug,
    description: globalTypeRow.description,
    dataType: globalTypeRow.data_type,
    fields: JSON.parse(globalTypeRow.schema),
    options: globalTypeRow.options ? JSON.parse(globalTypeRow.options) : {},
    created_at: globalTypeRow.created_at,
    updated_at: globalTypeRow.updated_at
  };

  const isFlat = globalDefinition.dataType === 'flat';
  let itemId = isFlat ? slug : opts.itemId!;

  // Localization detection
  const isLocalized = (fieldConfigurations as any).globals?.[slug]?.localized === true;
  const localesTable = isLocalized
    ? (schema[`global_${slug}_locales` as keyof typeof schema] as any)
    : null;
  const { locales: contentLocales, defaultLocale } = getContentSettings();

  if (isLocalized && (!contentLocales || contentLocales.length === 0 || !defaultLocale)) {
    throw new Error(
      `Global '${slug}' is marked \`localized: true\` but \`content.i18n.locales\` / \`content.i18n.default\` aren't configured in \`templates/settings.ts\`.`
    );
  }

  const currentLocale: string | null = isLocalized ? locale || defaultLocale || null : null;
  const availableLocales = isLocalized ? (contentLocales as string[]) : [];
  // Child tables (files, arrays, junctions) anchor on `global_<slug>` for
  // both modes; FK columns reference the `_locales` row id when localized.
  const tablePrefix = `global_${slug}`;

  let item: Record<string, any>;
  let isNewItem = false;
  let prefillFromLocaleRowId: string | null = null;

  const globalTable = schema[`global_${slug}` as keyof typeof schema];
  if (!globalTable) {
    const err = new Error(`Global table for '${slug}' not found`) as Error & {
      notFound?: boolean;
    };
    err.notFound = true;
    throw err;
  }

  // For localized globals, only pull identity from main — content lives
  // canonically on `_locales` and is merged below. Safe set: id/created_at/
  // deleted_at/deleted_by (doctor --fix keeps). NOT safe: updated_at,
  // last_modified_by, content columns — all dropped from main by doctor.
  const localizedMainIdentity = isLocalized
    ? {
        id: (globalTable as any).id,
        created_at: (globalTable as any).created_at,
        deleted_at: (globalTable as any).deleted_at,
        deleted_by: (globalTable as any).deleted_by
      }
    : null;

  if (isFlat) {
    // For singletons, try to get the single item (any ID)
    const existingItems = await (
      localizedMainIdentity
        ? db.select(localizedMainIdentity).from(globalTable)
        : db.select().from(globalTable)
    ).limit(1);

    if (existingItems.length === 0) {
      // Auto-instantiate the singleton with default values — preserves the
      // existing convention that flat globals always exist once their type
      // is registered.
      const defaultItem: Record<string, any> = {
        id: slug,
        created_at: getCurrentTimestamp(),
        updated_at: getCurrentTimestamp()
      };

      for (const [fieldName, fieldDef] of Object.entries(globalDefinition.fields)) {
        const fieldConfig = fieldDef as any;
        if (fieldConfig.default !== undefined) {
          defaultItem[fieldName] = fieldConfig.default;
        }
      }

      await db.insert(globalTable).values(defaultItem);

      item = defaultItem;
      isNewItem = true;
      if (isLocalized && currentLocale) {
        item.locale = currentLocale;
        item._localeId = null;
      }
    } else {
      item = existingItems[0] as Record<string, any>;
      // Merge in the locale row (or prefill from default) for localized flat globals.
      if (isLocalized && localesTable && currentLocale) {
        const fkField = `${slug}_id`;
        const localeRows = await db
          .select()
          .from(localesTable)
          .where(and(eq(localesTable[fkField], item.id), eq(localesTable.locale, currentLocale)))
          .limit(1);
        if (localeRows.length > 0) {
          const { id: localeRowId, [fkField]: _ignored, ...localeContent } = localeRows[0] as any;
          item = { ...item, ...localeContent, _localeId: localeRowId, locale: currentLocale };
        } else if (currentLocale !== defaultLocale) {
          const defaultRows = await db
            .select()
            .from(localesTable)
            .where(
              and(
                eq(localesTable[fkField], item.id),
                eq(localesTable.locale, defaultLocale as string)
              )
            )
            .limit(1);
          if (defaultRows.length > 0) {
            const {
              id: defaultRowId,
              [fkField]: _ignored,
              ...defaultContent
            } = defaultRows[0] as any;
            item = {
              ...item,
              ...defaultContent,
              _localeId: null,
              locale: currentLocale,
              _localePrefilledFrom: defaultLocale
            };
            prefillFromLocaleRowId = defaultRowId as string;
          } else {
            item._localeId = null;
            item.locale = currentLocale;
          }
        } else {
          item._localeId = null;
          item.locale = currentLocale;
        }
      }
    }
  } else {
    // Repeatable: try to get the specific item by ID, then by slug for
    // pretty-URL support (e.g. /sailor/globals/menus/main-menu).
    let existingItems = await (
      localizedMainIdentity
        ? db.select(localizedMainIdentity).from(globalTable)
        : db.select().from(globalTable)
    )
      .where(eq((globalTable as any).id, itemId))
      .limit(1);

    if (existingItems.length === 0 && itemId !== 'new') {
      let resolvedId: string | null = null;
      if (isLocalized && localesTable) {
        const row = await db
          .select({ id: (localesTable as any)[`${slug}_id`] })
          .from(localesTable)
          .where(eq((localesTable as any).slug, itemId))
          .limit(1);
        resolvedId = (row[0]?.id as string) ?? null;
      } else if ((globalTable as any).slug) {
        const row = await db
          .select({ id: (globalTable as any).id })
          .from(globalTable)
          .where(eq((globalTable as any).slug, itemId))
          .limit(1);
        resolvedId = (row[0]?.id as string) ?? null;
      }
      if (resolvedId) {
        itemId = resolvedId;
        existingItems = await (
          localizedMainIdentity
            ? db.select(localizedMainIdentity).from(globalTable)
            : db.select().from(globalTable)
        )
          .where(eq((globalTable as any).id, itemId))
          .limit(1);
      }
    }

    if (existingItems.length === 0) {
      isNewItem = true;
      const defaultTitle = `New ${globalDefinition.name.singular}`;
      const statusDefault = (globalDefinition.fields as any)?.status?.default ?? 'published';
      // Generate a real UUID for new repeatable items so the create→save
      // round-trip doesn't persist the literal 'new' route param as the
      // row's id. Flat globals are intentionally keyed by `slug` (single
      // row per slug), so they bypass this — `isFlat` is handled above
      // and `itemId === slug` for that branch.
      const newId = !isFlat && itemId === 'new' ? randomUUID() : itemId;
      item = {
        id: newId,
        title: defaultTitle,
        status: statusDefault,
        created_at: getCurrentTimestamp(),
        updated_at: getCurrentTimestamp()
      };
      if (isLocalized && currentLocale) {
        item.locale = currentLocale;
        item._localeId = null;
      }
    } else {
      item = existingItems[0] as Record<string, any>;

      if (isLocalized && localesTable && currentLocale) {
        const fkField = `${slug}_id`;
        const localeRows = await db
          .select()
          .from(localesTable)
          .where(and(eq(localesTable[fkField], item.id), eq(localesTable.locale, currentLocale)))
          .limit(1);
        if (localeRows.length > 0) {
          const { id: localeRowId, [fkField]: _ignored, ...localeContent } = localeRows[0] as any;
          item = { ...item, ...localeContent, _localeId: localeRowId, locale: currentLocale };
        } else if (currentLocale !== defaultLocale) {
          const defaultRows = await db
            .select()
            .from(localesTable)
            .where(
              and(
                eq(localesTable[fkField], item.id),
                eq(localesTable.locale, defaultLocale as string)
              )
            )
            .limit(1);
          if (defaultRows.length > 0) {
            const {
              id: defaultRowId,
              [fkField]: _ignored,
              ...defaultContent
            } = defaultRows[0] as any;
            item = {
              ...item,
              ...defaultContent,
              _localeId: null,
              locale: currentLocale,
              _localePrefilledFrom: defaultLocale
            };
            prefillFromLocaleRowId = defaultRowId as string;
          } else {
            item._localeId = null;
            item.locale = currentLocale;
          }
        } else {
          item._localeId = null;
          item.locale = currentLocale;
        }
      }
    }
  }

  // entityId for child loads. For localized: prefer the locale row id; fall
  // back to prefill source row id; fall back to main id.
  const entityIdForChildren = (item as any)._localeId ?? prefillFromLocaleRowId ?? item.id;

  // Load array/file/relation field data from relational tables. Child table
  // names are mode-agnostic (`global_<slug>_<field>`); for localized globals
  // their FK columns store the `_locales` row id.
  for (const [fieldName, fieldDef] of Object.entries(globalDefinition.fields)) {
    if ((fieldDef as any).type === 'file') {
      try {
        const fileTableName = `${tablePrefix}_${fieldName}`;
        const fileRelationTable = schema[fileTableName as keyof typeof schema];
        if (fileRelationTable && entityIdForChildren) {
          const fileResult = await db
            .select()
            .from(fileRelationTable)
            .where(eq((fileRelationTable as any).parent_id, entityIdForChildren))
            .orderBy(asc((fileRelationTable as any).sort))
            .limit(1);
          item[fieldName] = fileResult.length > 0 ? fileResult[0].file_id : '';
        } else {
          item[fieldName] = '';
        }
      } catch {
        item[fieldName] = '';
      }
    } else if ((fieldDef as any).type === 'array') {
      try {
        const relTableName = `${tablePrefix}_${fieldName}`;
        const relationTable = schema[relTableName as keyof typeof schema];
        if (relationTable && entityIdForChildren) {
          const arrayResult = await db
            .select()
            .from(relationTable)
            .where(eq((relationTable as any).global_id, entityIdForChildren))
            .orderBy(asc((relationTable as any).sort));
          item[fieldName] = arrayResult;
        } else {
          item[fieldName] = [];
        }
      } catch {
        item[fieldName] = [];
      }
    } else if ((fieldDef as any).type === 'relation') {
      // Resolve single-FK relations server-side for better UX
      const relType = (fieldDef as any).relation?.type;
      if (relType === 'one-to-one' || relType === 'many-to-one') {
        const targetId = item[fieldName];
        if (targetId) {
          try {
            const { getRelationItem } = await import('../../../remote/relations.remote');
            const scope = (fieldDef as any).relation?.targetGlobal ? 'global' : 'collection';
            const slugArg =
              (fieldDef as any).relation?.targetGlobal ||
              (fieldDef as any).relation?.targetCollection;
            const res = await getRelationItem({ scope, slug: slugArg, id: String(targetId) });
            if (res.success && res.item) {
              item[fieldName] = JSON.stringify(res.item);
            }
          } catch {
            // Leave as id on failure
          }
        }
      }
    }
  }

  // Translated locales for the switcher
  let translatedLocales: string[] = [];
  if (isLocalized && localesTable && !isNewItem) {
    const fkField = `${slug}_id`;
    const rows = await db
      .select({ locale: localesTable.locale })
      .from(localesTable)
      .where(eq(localesTable[fkField], item.id));
    translatedLocales = rows.map((r: any) => r.locale as string);
  }

  return {
    item,
    isNewItem,
    global: globalDefinition,
    localized: isLocalized,
    availableLocales,
    currentLocale,
    translatedLocales
  };
}
