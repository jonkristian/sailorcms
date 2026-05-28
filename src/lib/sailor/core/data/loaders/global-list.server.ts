// Globals "list" loader for the admin globals page.
//
// Dual-purpose, matching the existing route: returns a list of items for
// repeatable globals OR the singleton row for flat globals. Localized
// branching, array/file/tag enrichment, and locale-switcher inputs all live
// here so the route is a thin auth wrapper.

import { db } from '../../db/index.server';
import { eq, asc, desc, and, count } from 'drizzle-orm';
import * as schema from '$sailor/generated/schema';
import { fieldConfigurations } from '$sailor/generated/fields';
import { TagService } from '../../services/tag.server';
import { toSnakeCase } from '../../utils/string';
import { liveOnly } from '../../db/soft-delete';
import { loadFileFields } from '../../../utils/data/loaders/file-loader';
import { getContentSettings } from '../../../utils/data/collections';
import { log } from '../../utils/logger';
import type { Pagination } from '../../types';

export interface LoadGlobalsForListOptions {
  slug: string;
  page?: number;
  pageSize?: number;
  /** Locale for localized globals; defaults to `content.defaultLocale`. */
  locale?: string;
}

export interface LoadGlobalsForListResult {
  global: {
    id: string;
    name: { singular: string; plural: string };
    slug: string;
    description: string | undefined;
    dataType: string;
    fields: Record<string, any>;
    options: Record<string, any>;
    created_at: Date;
    updated_at: Date;
  };
  items: any[];
  existingData: Record<string, any> | null;
  pagination: Pagination | null;
  // Localization
  localized: boolean;
  availableLocales: string[];
  currentLocale: string | null;
  translatedLocales: string[];
}

export async function loadGlobalsForList(
  opts: LoadGlobalsForListOptions
): Promise<LoadGlobalsForListResult> {
  const { slug, locale } = opts;

  const globalTypeRow = await db.query.globalTypes.findFirst({
    where: eq(schema.globalTypes.slug, slug)
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
    description: globalTypeRow.description ?? undefined,
    dataType: globalTypeRow.data_type,
    fields: JSON.parse(globalTypeRow.schema),
    options: globalTypeRow.options ? JSON.parse(globalTypeRow.options) : {},
    created_at: globalTypeRow.created_at,
    updated_at: globalTypeRow.updated_at
  };

  let items: any[] = [];
  let existingData: any = {};
  let pagination: Pagination | null = null;

  const isFlat = globalDefinition.dataType === 'flat';

  // Localized detection + locale resolution
  const isLocalized = (fieldConfigurations as any).globals?.[slug]?.localized === true;
  const localesTable = isLocalized
    ? (schema[`global_${slug}_locales` as keyof typeof schema] as any)
    : null;
  const { locales: contentLocales, defaultLocale } = getContentSettings();
  if (isLocalized && (!contentLocales || contentLocales.length === 0 || !defaultLocale)) {
    throw new Error(
      `Global '${slug}' is marked \`localized: true\` but \`content.locales\` / \`content.defaultLocale\` aren't configured in \`templates/settings.ts\`. Add e.g. \`content: { locales: ['en', 'nb-NO'], defaultLocale: 'en' }\`.`
    );
  }
  const currentLocale: string | null = isLocalized ? locale || defaultLocale || null : null;
  const availableLocales = isLocalized ? (contentLocales as string[]) : [];
  // Child tables (files, arrays, junctions) anchor on `global_<slug>` for
  // both modes; FK columns reference the `_locales` row id when localized.
  const tablePrefix = `global_${slug}`;

  // Nestable / inline repeatable views render the entire set (tree expansion
  // / inline editing) so they bypass pagination. Regular repeatable + relational
  // go through TableView and paginate.
  const usesTableView =
    !isFlat &&
    !(
      globalDefinition.dataType === 'repeatable' &&
      (globalDefinition.options?.nestable || globalDefinition.options?.inline)
    );

  const globalTable = schema[`global_${slug}` as keyof typeof schema];

  if (isFlat) {
    if (globalTable) {
      let result: any[] = await db
        .select()
        .from(globalTable)
        .where(and(eq((globalTable as any).id, slug), liveOnly(globalTable)))
        .limit(1);

      // Localized flat globals: JOIN the locale row. If the row for the
      // current locale doesn't exist, try the default locale as a prefill
      // (clone-on-create UX) — same as collections.
      if (result.length > 0 && isLocalized && localesTable && currentLocale) {
        const fkField = `${slug}_id`;
        const localeRows = await db
          .select()
          .from(localesTable)
          .where(
            and(eq(localesTable[fkField], result[0].id), eq(localesTable.locale, currentLocale))
          )
          .limit(1);
        if (localeRows.length > 0) {
          const { id: localeRowId, [fkField]: _ignored, ...localeContent } = localeRows[0] as any;
          result[0] = {
            ...result[0],
            ...localeContent,
            _localeId: localeRowId,
            locale: currentLocale
          };
        } else if (currentLocale !== defaultLocale) {
          const defaultRows = await db
            .select()
            .from(localesTable)
            .where(
              and(
                eq(localesTable[fkField], result[0].id),
                eq(localesTable.locale, defaultLocale as string)
              )
            )
            .limit(1);
          if (defaultRows.length > 0) {
            const {
              id: _defaultId,
              [fkField]: _ignored,
              ...defaultContent
            } = defaultRows[0] as any;
            result[0] = {
              ...result[0],
              ...defaultContent,
              _localeId: null,
              locale: currentLocale,
              _localePrefilledFrom: defaultLocale
            };
          } else {
            result[0] = { ...result[0], _localeId: null, locale: currentLocale };
          }
        } else {
          result[0] = { ...result[0], _localeId: null, locale: currentLocale };
        }
      }

      if (result.length > 0) {
        existingData = result[0];

        const entityIdForChildren = (existingData as any)._localeId ?? existingData.id;

        // Load array field data from relational tables. Tables live under
        // `<prefix>_<field>`; for localized globals the `global_id` FK
        // references the `_locales` row id.
        const arrayFieldQueries = Object.entries(globalDefinition.fields)
          .filter(([_, fieldDef]) => (fieldDef as Record<string, unknown>).type === 'array')
          .map(async ([fieldName, _fieldDef]) => {
            try {
              const snakeCaseFieldName = toSnakeCase(fieldName);
              const relTableName = `${tablePrefix}_${snakeCaseFieldName}`;
              const relationTable = schema[relTableName as keyof typeof schema];
              if (relationTable && entityIdForChildren) {
                const relResult = await db
                  .select()
                  .from(relationTable)
                  .where(eq((relationTable as any).global_id, entityIdForChildren))
                  .orderBy(asc((relationTable as any).sort));
                existingData[fieldName] = relResult || [];
              } else {
                if (!relationTable) log.warn(`Relation table ${relTableName} not found in schema`);
                existingData[fieldName] = [];
              }
            } catch (err) {
              log.warn(`Could not load array field ${fieldName}:`, { fieldName, error: err });
              existingData[fieldName] = [];
            }
          });

        await Promise.all(arrayFieldQueries);
      } else {
        // Default values for new flat global
        const defaultItem: any = {
          id: slug,
          created_at: new Date(),
          updated_at: new Date()
        };

        for (const [fieldName, fieldDef] of Object.entries(globalDefinition.fields)) {
          const fieldConfig = fieldDef as any;
          if (fieldConfig.default !== undefined) {
            defaultItem[fieldName] = fieldConfig.default;
          } else if (fieldConfig.type === 'array') {
            defaultItem[fieldName] = [];
          }
        }

        if (isLocalized && currentLocale) {
          defaultItem.locale = currentLocale;
          defaultItem._localeId = null;
        }

        existingData = defaultItem;
      }
    }
  } else {
    // Repeatable. Localized JOINs `_locales` for default locale.
    if (globalTable) {
      try {
        if (isLocalized && localesTable && currentLocale) {
          const fkField = `${slug}_id`;
          const flatSelect = {
            id: (globalTable as any).id,
            created_at: (globalTable as any).created_at,
            deleted_at: (globalTable as any).deleted_at,
            title: localesTable.title,
            slug: localesTable.slug,
            status: localesTable.status,
            sort: localesTable.sort,
            parent_id: localesTable.parent_id,
            updated_at: localesTable.updated_at,
            _localeId: localesTable.id
          };
          const baseQuery = () =>
            db
              .select(flatSelect)
              .from(globalTable)
              .innerJoin(localesTable, eq(localesTable[fkField], (globalTable as any).id))
              .where(and(liveOnly(globalTable), eq(localesTable.locale, currentLocale)));
          const sortCol = localesTable.sort ?? (globalTable as any).created_at;

          if (usesTableView) {
            const page = Math.max(1, opts.page ?? 1);
            const pageSize = Math.max(1, Math.min(100, opts.pageSize ?? 20));
            const [countResult, result] = await Promise.all([
              db
                .select({ total: count() })
                .from(globalTable)
                .innerJoin(localesTable, eq(localesTable[fkField], (globalTable as any).id))
                .where(and(liveOnly(globalTable), eq(localesTable.locale, currentLocale))),
              baseQuery()
                .orderBy(asc(sortCol), desc((globalTable as any).created_at))
                .limit(pageSize)
                .offset((page - 1) * pageSize)
            ]);
            const totalItems = Number(countResult[0]?.total || 0);
            const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
            const validPage = totalPages > 0 ? Math.min(page, totalPages) : 1;
            items = result || [];
            pagination = {
              page: validPage,
              pageSize,
              totalItems,
              totalPages,
              hasNextPage: validPage < totalPages,
              hasPreviousPage: validPage > 1
            };
          } else {
            items =
              (await baseQuery().orderBy(asc(sortCol), desc((globalTable as any).created_at))) ||
              [];
          }
        } else if (usesTableView) {
          const page = Math.max(1, opts.page ?? 1);
          const pageSize = Math.max(1, Math.min(100, opts.pageSize ?? 20));

          const [countResult, result] = await Promise.all([
            db.select({ total: count() }).from(globalTable).where(liveOnly(globalTable)),
            db
              .select()
              .from(globalTable)
              .where(liveOnly(globalTable))
              .orderBy(asc((globalTable as any).sort), desc((globalTable as any).created_at))
              .limit(pageSize)
              .offset((page - 1) * pageSize)
          ]);

          const totalItems = Number(countResult[0]?.total || 0);
          const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
          const validPage = totalPages > 0 ? Math.min(page, totalPages) : 1;

          items = result || [];
          pagination = {
            page: validPage,
            pageSize,
            totalItems,
            totalPages,
            hasNextPage: validPage < totalPages,
            hasPreviousPage: validPage > 1
          };
        } else {
          // Nestable / inline repeatable: load the full set
          const result = await db
            .select()
            .from(globalTable)
            .where(liveOnly(globalTable))
            .orderBy(asc((globalTable as any).sort), desc((globalTable as any).created_at));
          items = result || [];
        }
      } catch (err) {
        log.warn(`Could not load items for ${slug}`, { slug, error: err });
        items = [];
      }
    } else {
      log.warn(`Global table for ${slug} not found in schema`, { slug });
      items = [];
    }
  }

  // Load array field data from relational tables (for both singleton and
  // repeatable globals). Child tables live under `<prefix>_<field>`; for
  // localized globals `global_id` references the `_locales` row id
  // (surfaced as `_localeId` on the item).
  for (const [fieldName, fieldDef] of Object.entries(globalDefinition.fields)) {
    if ((fieldDef as any).type === 'array') {
      try {
        const snakeCaseFieldName = toSnakeCase(fieldName);
        const relTableName = `${tablePrefix}_${snakeCaseFieldName}`;
        const relationTable = schema[relTableName as keyof typeof schema];

        if (relationTable) {
          const relResult = await db
            .select()
            .from(relationTable)
            .orderBy(asc((relationTable as any).global_id), asc((relationTable as any).sort));

          if (isFlat) {
            const matchId = (existingData as any)._localeId ?? existingData.id;
            existingData[fieldName] = relResult.filter((row: any) => row.global_id === matchId);
          } else {
            const relData = relResult || [];
            items.forEach((item: any) => {
              const matchId = (item as any)._localeId ?? item.id;
              item[fieldName] = relData.filter((row: any) => row.global_id === matchId);
            });
          }
        } else {
          if (isFlat) {
            existingData[fieldName] = [];
          } else {
            items.forEach((item: any) => {
              item[fieldName] = [];
            });
          }
        }
      } catch (err) {
        log.warn(`Could not load array field ${fieldName}`, { fieldName, error: err });
        if (isFlat) {
          existingData[fieldName] = [];
        } else {
          items.forEach((item) => {
            item[fieldName] = [];
          });
        }
      }
    }
  }

  // Files nested inside array items: separate pass per row. Form expects IDs,
  // so loadFullFileObjects=false. Stale column values are cleared so the
  // loader always re-fetches from the file-relation table.
  for (const [fieldName, fieldDef] of Object.entries(globalDefinition.fields)) {
    if ((fieldDef as any).type !== 'array') continue;
    const itemsProperties = (fieldDef as any).items?.properties;
    if (!itemsProperties) continue;

    const snakeCaseFieldName = toSnakeCase(fieldName);
    const arrayTableName = `${tablePrefix}_${snakeCaseFieldName}`;

    const fileKeys: Array<[string, string]> = Object.entries(itemsProperties)
      .filter(([, def]) => (def as any).type === 'file')
      .map(([key]) => [key, toSnakeCase(key)]);

    if (fileKeys.length === 0) continue;

    const rowSets: any[][] = isFlat
      ? [(existingData[fieldName] as any[]) || []]
      : items.map((it: any) => (it[fieldName] as any[]) || []);

    for (const rows of rowSets) {
      for (const row of rows) {
        for (const [k, snakeK] of fileKeys) {
          delete row[k];
          if (snakeK !== k) delete row[snakeK];
        }
        await loadFileFields(row, itemsProperties, arrayTableName, false);
      }
    }
  }

  // Load file field data from file relation tables.
  for (const [fieldName, fieldDef] of Object.entries(globalDefinition.fields)) {
    if ((fieldDef as any).type === 'file') {
      try {
        const snakeCaseFieldName = toSnakeCase(fieldName);
        const fileTableName = `${tablePrefix}_${snakeCaseFieldName}`;
        const fileTable = schema[fileTableName as keyof typeof schema];

        if (fileTable) {
          const fileResult = await db
            .select({
              id: (fileTable as any).id,
              parent_id: (fileTable as any).parent_id,
              file_id: (fileTable as any).file_id,
              sort: (fileTable as any).sort,
              alt_override: (fileTable as any).alt_override,
              filename: schema.files.name,
              path: schema.files.path,
              url: schema.files.url,
              file_size: schema.files.size,
              mime_type: schema.files.mime_type
            })
            .from(fileTable)
            .innerJoin(schema.files, eq(schema.files.id, (fileTable as any).file_id))
            .where(eq((fileTable as any).parent_type, 'global'))
            .orderBy(asc((fileTable as any).parent_id), asc((fileTable as any).sort));

          if (isFlat) {
            const matchId = (existingData as any)._localeId ?? existingData.id;
            const filteredFiles = fileResult.filter((row: any) => row.parent_id === matchId);
            const fileId = filteredFiles.length > 0 ? filteredFiles[0].file_id : '';
            existingData[fieldName] = fileId;
          } else {
            const allFileData = fileResult || [];
            items.forEach((item: any) => {
              const matchId = (item as any)._localeId ?? item.id;
              const itemFiles = allFileData.filter((row: any) => row.parent_id === matchId);
              const fileId = itemFiles.length > 0 ? itemFiles[0].file_id : '';
              item[fieldName] = fileId;
            });
          }
        } else {
          log.warn(`File relation table ${fileTableName} not found in schema`);
          if (isFlat) {
            existingData[fieldName] = [];
          } else {
            items.forEach((item: any) => {
              item[fieldName] = [];
            });
          }
        }
      } catch (err) {
        log.warn(`Could not load file field ${fieldName}:`, { fieldName, error: err });
        if (isFlat) {
          existingData[fieldName] = [];
        } else {
          items.forEach((item: any) => {
            item[fieldName] = [];
          });
        }
      }
    }
  }

  // Load tags. `taggable_type = 'global_<slug>'` for both modes; for
  // localized globals the `taggable_id` is the `_locales` row id (callers
  // pass it as `_localeId`).
  const taggableType = tablePrefix;
  if (isFlat && existingData) {
    const matchId = (existingData as any)._localeId ?? existingData.id;
    const tags = matchId ? await TagService.getTagsForEntity(taggableType, matchId) : [];
    Object.entries(globalDefinition.fields).forEach(([fieldName, fieldDef]) => {
      if ((fieldDef as any).type === 'tags') {
        existingData[fieldName] = tags;
      }
    });
  } else {
    for (const item of items) {
      const matchId = (item as any)._localeId ?? item.id;
      const tags = matchId ? await TagService.getTagsForEntity(taggableType, matchId) : [];
      Object.entries(globalDefinition.fields).forEach(([fieldName, fieldDef]) => {
        if ((fieldDef as any).type === 'tags') {
          item[fieldName] = tags;
        }
      });
    }
  }

  // Locale switcher inputs.
  let translatedLocales: string[] = [];
  if (isLocalized && localesTable) {
    const fkField = `${slug}_id`;
    if (isFlat) {
      const rows = await db
        .select({ locale: localesTable.locale })
        .from(localesTable)
        .where(eq(localesTable[fkField], slug));
      translatedLocales = rows.map((r: any) => r.locale as string);
    } else {
      translatedLocales = availableLocales;
    }
  }

  return {
    global: globalDefinition,
    items,
    existingData: isFlat ? existingData : null,
    pagination,
    localized: isLocalized,
    availableLocales,
    currentLocale,
    translatedLocales
  };
}
