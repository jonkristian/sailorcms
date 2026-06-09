// Collection-item loader for the admin edit page.
//
// Mirror of `core/data/persisters/collection-item.server.ts` on the read side.
// Loads a single collection item with all its child data — tags, relations,
// arrays, files, blocks — plus author user details, revisions, and locale
// switcher inputs for localized collections. Routes consume this and add
// admin-specific concerns (header actions, site URL, etc.) on top.
//
// Auth (read permission) is the caller's responsibility; this is a data
// primitive.

import { db } from '../../db/index.server';
import { sql, eq, and, desc, inArray } from 'drizzle-orm';
import * as schema from '$sailor/generated/schema';
import { fieldConfigurations } from '$sailor/generated/fields';
import { getCurrentTimestamp } from '../../utils/date';
import { TagService } from '../../services/tag.server';
import { loadBlockFields } from '../../content/blocks.server';
import { blockGroupsEnabled } from '$sailor/generated/block-groups';
import { loadFileFields } from './file-loader';
import { loadFileFields as loadNestedFileFields } from '../../../utils/data/loaders/file-loader';
import { toSnakeCase, childTableName } from '../../utils/string';
import { resolveRevisionsKeep } from '../../services/revisions.server';
import { getContentSettings } from '../../settings/i18n';
import { log } from '../../utils/logger';
import { randomUUID } from 'crypto';

import { reidNestedRows } from '../i18n-prefill.server';

export interface LoadCollectionItemOptions {
  slug: string;
  itemId: string;
  /** Pre-resolved user from the request context. Used to gate edit-permission UI. */
  user: { id: string } | null;
  /**
   * Locale for localized collections. Resolution order:
   *   1. This argument
   *   2. `content.i18n.default` from settings
   * Non-localized collections ignore the value.
   */
  locale?: string;
}

export interface LoadedCollectionItemRevision {
  id: string;
  /** Row this revision restores into. For localized collections this is a
   *  `_locales` row id (per-translation history); for non-localized, the
   *  main row id. The restore handler scopes by this — restoring a `nb-NO`
   *  revision never clobbers `en` content. */
  entity_id: string;
  /** BCP-47 locale tag when the revision belongs to a translation; `null`
   *  for non-localized collections. Used by the History dialog to label
   *  rows when the stream merges multiple locales. */
  locale: string | null;
  created_at: Date;
  created_by_id: string | null;
  created_by_name: string | null;
  created_by_email: string | null;
  data: Record<string, unknown>;
}

export interface LoadCollectionItemResult {
  page: Record<string, any>;
  isNewItem: boolean;
  collectionType: {
    id: string;
    name: { singular: string; plural: string };
    slug: string;
    description: string | null;
    fields: Record<string, any>;
    options: Record<string, any>;
    created_at: Date;
    updated_at: Date;
  };
  effectiveFields: Record<string, any>;
  availableBlocks: any[];
  blocks: any[];
  blockGroups: any[];
  hasBlocks: boolean;
  // Localization
  localized: boolean;
  availableLocales: string[];
  currentLocale: string | null;
  translatedLocales: string[];
  // Revisions
  revisions: LoadedCollectionItemRevision[];
}

/**
 * Throws `Error` with `notFound` boolean (caller maps to 404) when the
 * collection type doesn't exist. Returns a fully hydrated item otherwise —
 * either an existing row's data merged with all child fields, or a fresh
 * new-item shape with default values when no row exists.
 */
export async function loadCollectionItem(
  opts: LoadCollectionItemOptions
): Promise<LoadCollectionItemResult> {
  const { slug, locale } = opts;
  let itemId = opts.itemId;

  // Get collection definition and block types from database in parallel
  const [collectionTypeRow, blockTypesResult] = await Promise.all([
    db.query.collectionTypes.findFirst({
      where: (collectionTypes: any, { eq }: any) => eq(collectionTypes.slug, slug)
    }),
    db.query.blockTypes.findMany()
  ]);

  if (!collectionTypeRow) {
    const err = new Error('Collection not found') as Error & { notFound?: boolean };
    err.notFound = true;
    throw err;
  }

  const effectiveFields = JSON.parse(collectionTypeRow.schema);

  const collectionDefinition = {
    id: collectionTypeRow.id,
    name: {
      singular: collectionTypeRow.name_singular,
      plural: collectionTypeRow.name_plural
    },
    slug: collectionTypeRow.slug,
    description: collectionTypeRow.description,
    fields: effectiveFields,
    options: collectionTypeRow.options ? JSON.parse(collectionTypeRow.options) : {},
    created_at: collectionTypeRow.created_at,
    updated_at: collectionTypeRow.updated_at
  };

  const availableBlocks: Record<string, any> = {};
  for (const blockType of blockTypesResult) {
    availableBlocks[blockType.slug] = {
      name: blockType.name,
      slug: blockType.slug,
      description: blockType.description,
      fields: JSON.parse(blockType.schema)
    };
  }

  // Get the collection table dynamically
  const collectionTable = schema[`collection_${slug}` as keyof typeof schema];
  if (!collectionTable) {
    const err = new Error(`Collection table for '${slug}' not found`) as Error & {
      notFound?: boolean;
    };
    err.notFound = true;
    throw err;
  }

  // Localized collections store editable content on a sibling `<slug>_locales`
  // table. Detect once up front, then thread `tablePrefix` + `entityId`
  // through the existing loaders so each tag/relation/array/file/block query
  // targets the right scope.
  const isLocalized = (fieldConfigurations as any).collections?.[slug]?.localized === true;
  const localesTable = isLocalized
    ? (schema[`collection_${slug}_locales` as keyof typeof schema] as any)
    : null;
  const { locales: contentLocales, defaultLocale } = getContentSettings();

  if (isLocalized && (!contentLocales || contentLocales.length === 0 || !defaultLocale)) {
    const err = new Error(
      `Collection '${slug}' is marked \`localized: true\` but \`content.i18n.locales\` / \`content.i18n.default\` aren't configured in \`templates/settings.ts\`. Add e.g. \`content: { i18n: { locales: ['en', 'nb-NO'], default: 'en' } }\`.`
    );
    throw err;
  }

  const currentLocale: string | null = isLocalized ? locale || defaultLocale || null : null;
  const availableLocales = isLocalized ? (contentLocales as string[]) : [];

  // Resolve the route param: try as an id first (UUIDs), then fall back to
  // slug lookup so pretty URLs like /collections/posts/fixed-audit-post
  // work alongside /collections/posts/<uuid>. For localized collections the
  // slug lives on the `_locales` sibling — join to find it. Both URL forms
  // continue to work post-resolve (no auto-canonicalization).
  let existingItems = await db
    .select()
    .from(collectionTable)
    .where(eq((collectionTable as any).id, itemId))
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
    } else if ((collectionTable as any).slug) {
      const row = await db
        .select({ id: (collectionTable as any).id })
        .from(collectionTable)
        .where(eq((collectionTable as any).slug, itemId))
        .limit(1);
      resolvedId = (row[0]?.id as string) ?? null;
    }
    if (resolvedId) {
      itemId = resolvedId;
      existingItems = await db
        .select()
        .from(collectionTable)
        .where(eq((collectionTable as any).id, itemId))
        .limit(1);
    }
  }

  let page: Record<string, any>;
  let isNewItem = false;
  const blocks: any[] = [];
  const blockGroups: any[] = [];

  if (existingItems.length === 0) {
    isNewItem = true;
    const defaultTitle = `New ${collectionDefinition.name.singular}`;
    // Generate the row's eventual UUID upfront so the client submits a real
    // id on save and the URL can redirect to /[id]. Using the route param
    // (`itemId === 'new'`) would persist the literal 'new' string as the
    // row's id, breaking list-row links and PK-conflicting any second
    // create. Existing items: `itemId` is the real id from the URL — keep it.
    const newId = itemId === 'new' ? randomUUID() : itemId;
    page = {
      id: newId,
      title: defaultTitle,
      slug: '',
      status: 'draft',
      created_at: getCurrentTimestamp(),
      updated_at: getCurrentTimestamp()
    };

    // Initialize empty arrays for tag fields
    for (const [fieldName, fieldDef] of Object.entries(collectionDefinition.fields)) {
      if ((fieldDef as any).type === 'tags') {
        page[fieldName] = [];
      }
    }

    // Initialize SEO fields if SEO is enabled
    if (collectionDefinition.options.seo) {
      const { SEO_FIELDS } = await import('../../types');
      Object.keys(SEO_FIELDS).forEach((seoField) => {
        page[seoField] = '';
      });
    }

    // For localized collections, stamp the active locale so the save handler
    // knows which `_locales` row to create on first save.
    if (isLocalized && currentLocale) {
      page.locale = currentLocale;
    }
  } else {
    page = existingItems[0] as Record<string, any>;

    // For localized: merge in the `_locales` row for the active locale, with
    // prefill from default-locale (clone-on-create UX) when the requested
    // locale has no row yet.
    let prefillFromLocaleRowId: string | null = null;
    if (isLocalized && localesTable && currentLocale) {
      const fkField = `${slug}_id`;
      const localeRows = await db
        .select()
        .from(localesTable)
        .where(and(eq(localesTable[fkField], itemId), eq(localesTable.locale, currentLocale)))
        .limit(1);
      if (localeRows.length > 0) {
        const localeRow = localeRows[0] as Record<string, any>;
        const { id: localeRowId, [fkField]: _ignored, ...localeContent } = localeRow;
        page = { ...page, ...localeContent, _localeId: localeRowId, locale: currentLocale };
      } else if (currentLocale !== defaultLocale) {
        const defaultRows = await db
          .select()
          .from(localesTable)
          .where(
            and(eq(localesTable[fkField], itemId), eq(localesTable.locale, defaultLocale as string))
          )
          .limit(1);
        if (defaultRows.length > 0) {
          const defaultRow = defaultRows[0] as Record<string, any>;
          const { id: defaultRowId, [fkField]: _ignored, ...defaultContent } = defaultRow;
          page = {
            ...page,
            ...defaultContent,
            _localeId: null,
            locale: currentLocale,
            _localePrefilledFrom: defaultLocale
          };
          prefillFromLocaleRowId = defaultRowId as string;
        } else {
          page._localeId = null;
          page.locale = currentLocale;
        }
      } else {
        page._localeId = null;
        page.locale = currentLocale;
      }
    }

    // Child tables anchor on `collection_<slug>` for both modes. For
    // localized items the FK columns point at the `_locales` row id —
    // surfaced as `_localeId` on the page. When prefilling a brand-new
    // translation we read from the default-locale row's id.
    const tablePrefix = `collection_${slug}`;
    const junctionPrefix = slug;
    const entityId = (page as any)._localeId ?? prefillFromLocaleRowId ?? itemId;

    // Load tags
    try {
      const entityTags = entityId ? await TagService.getTagsForEntity(tablePrefix, entityId) : [];
      for (const [fieldName, fieldDef] of Object.entries(collectionDefinition.fields)) {
        if ((fieldDef as any).type === 'tags') {
          page[fieldName] = entityTags;
        }
      }
    } catch (error) {
      log.warn('Failed to load tags for collection item', { id: itemId, error });
      for (const [fieldName, fieldDef] of Object.entries(collectionDefinition.fields)) {
        if ((fieldDef as any).type === 'tags') {
          page[fieldName] = [];
        }
      }
    }

    // Load relation data for collection fields
    for (const [fieldName, fieldDef] of Object.entries(collectionDefinition.fields)) {
      if ((fieldDef as any).type === 'relation') {
        const relType = (fieldDef as any).relation?.type;
        // For single FK relations (one-to-one, one-to-many) resolve server-side to avoid client loops
        if (relType === 'one-to-one' || relType === 'one-to-many') {
          const targetId = page[fieldName];
          if (targetId) {
            try {
              const { getRelationItem } = await import('../../../remote/relations.remote');
              const scope = (fieldDef as any).relation?.targetGlobal ? 'global' : 'collection';
              const slugArg =
                (fieldDef as any).relation?.targetGlobal ||
                (fieldDef as any).relation?.targetCollection;
              const res = await getRelationItem({ scope, slug: slugArg, id: String(targetId) });
              if (res.success && res.item) {
                page[fieldName] = JSON.stringify(res.item);
              }
            } catch {
              // Ignore and leave as id
            }
          }
          continue;
        }
        // Use the correct junction table naming convention.
        const junctionTableName =
          (fieldDef as any).relation?.through || `junction_${junctionPrefix}_${fieldName}`;
        const targetGlobal = (fieldDef as any).relation?.targetGlobal;
        const targetCollection = (fieldDef as any).relation?.targetCollection;

        try {
          const relationResult = await db.run(
            sql`SELECT target_id FROM ${sql.identifier(junctionTableName)} WHERE collection_id = ${entityId}`
          );

          const targetIds = relationResult.rows.map((row: any) => row.target_id);

          if (targetIds.length > 0) {
            let targetTable: string;
            if (targetGlobal) {
              targetTable = `global_${targetGlobal}`;
            } else if (targetCollection) {
              targetTable = `collection_${targetCollection}`;
            } else {
              page[fieldName] = JSON.stringify(targetIds);
              continue;
            }

            const targetResult = await db.run(
              sql`SELECT id, title FROM ${sql.identifier(targetTable)} WHERE id IN (${sql.join(
                targetIds.map((tid: any) => sql`${tid}`),
                sql`, `
              )})`
            );

            const relationItems = targetResult.rows.map((row: any) => ({
              id: row.id,
              title: row.title
            }));
            page[fieldName] = relationItems;
          } else {
            page[fieldName] = [];
          }
        } catch {
          page[fieldName] = [];
        }
      }
    }

    // Load array fields for collection
    for (const [fieldName, fieldDef] of Object.entries(collectionDefinition.fields)) {
      if ((fieldDef as any).type === 'array') {
        try {
          const arrayTableName = childTableName(tablePrefix, fieldName);
          const arrayResult = await db.run(
            sql`SELECT * FROM ${sql.identifier(arrayTableName)} WHERE collection_id = ${entityId} ORDER BY "sort"`
          );
          page[fieldName] = arrayResult.rows || [];
        } catch (error) {
          page[fieldName] = [];
        }
      }
    }

    // Load file fields for collection (loader honors page._localeId for parent_id)
    await loadFileFields(page, collectionDefinition.fields, tablePrefix);

    // Files nested inside array items: separate pass per row.
    for (const [fieldName, fieldDef] of Object.entries(collectionDefinition.fields)) {
      if ((fieldDef as any).type !== 'array') continue;
      const itemsProperties = (fieldDef as any).items?.properties;
      if (!itemsProperties) continue;

      const fileKeys: Array<[string, string]> = Object.entries(itemsProperties)
        .filter(([, def]) => (def as any).type === 'file')
        .map(([key]) => [key, toSnakeCase(key)]);

      if (fileKeys.length === 0) continue;

      const arrayTableName = childTableName(tablePrefix, fieldName);
      const rows = (page[fieldName] as any[]) || [];
      for (const row of rows) {
        for (const [k, snakeK] of fileKeys) {
          delete row[k];
          if (snakeK !== k) delete row[snakeK];
        }
        await loadNestedFileFields(row, itemsProperties, arrayTableName, false);
      }
    }

    // Get raw blocks data for each block type using dynamic schemas. For
    // localized collections the block junction's `collection_id` references
    // the `_locales` row id.
    for (const [blockSlug, blockDef] of Object.entries(availableBlocks)) {
      try {
        const blocksResult = await db.run(
          sql`SELECT * FROM ${sql.identifier(`block_${blockSlug}`)} WHERE collection_id = ${entityId} ORDER BY "sort"`
        );

        for (const block of blocksResult.rows) {
          await loadBlockFields(block, blockSlug, blockDef.fields || {});

          let relationData: any[] = [];
          const arrayField = Object.entries(blockDef.fields || {}).find(
            ([_, fieldDef]: [string, any]) => fieldDef.type === 'array'
          );

          if (arrayField) {
            const [fieldName] = arrayField;
            relationData = block[fieldName] || [];
          }

          // Get file relations for each file field
          const fileRelations: Record<string, any[]> = {};
          const fileFields = Object.entries(blockDef.fields || {}).filter(
            ([_, fieldDef]: [string, any]) => fieldDef.type === 'file'
          );

          for (const [fieldName] of fileFields) {
            try {
              const fileResult = await db.run(
                sql`SELECT file_id FROM ${sql.identifier(childTableName(`block_${blockSlug}`, fieldName))} WHERE parent_id = ${block.id} AND (parent_type = 'block' OR parent_type IS NULL OR parent_type = '') ORDER BY "sort"`
              );
              fileRelations[fieldName] = fileResult.rows.map((row: any) => row.file_id);
            } catch {
              fileRelations[fieldName] = [];
            }
          }

          blocks.push({
            id: block.id,
            blockType: blockSlug,
            blockSchema: blockDef,
            data: block,
            relations: relationData,
            fileRelations: fileRelations
          });
        }
      } catch {
        log.warn(`Block table block_${blockSlug} doesn't exist yet, skipping`, { blockSlug });
      }
    }

    // Sort by sort
    blocks.sort((a, b) => a.data.sort - b.data.sort);

    // Block groups: structural containers scoped by collection_id (the
    // `_locales` row id for localized collections). Returned flat alongside
    // blocks; the editor reassembles the tree from each block's group_id.
    // Skipped entirely when the feature is disabled (no block_groups table).
    if (blockGroupsEnabled) {
      try {
        const groupsResult = await db.run(
          sql`SELECT * FROM ${sql.identifier('block_groups')} WHERE collection_id = ${entityId} AND deleted_at IS NULL ORDER BY "sort"`
        );
        blockGroups.push(...groupsResult.rows);
      } catch {
        log.warn('block_groups table not available yet, skipping');
      }
    }
  }

  // Prefill-from-default-locale clones content as a starting draft for the
  // new translation. The save path uses `INSERT OR REPLACE` keyed on row id,
  // so reusing the default-locale's ids would re-point existing rows at the
  // new locale on save (moving the block off the source translation instead
  // of cloning it). Assign fresh UUIDs here so the save inserts new rows and
  // the source translation keeps its own. Done in the loader (not by
  // dropping ids and letting the persister fill in) so the form has stable
  // keys for {#each} / drag-reorder between load and save.
  if ((page as any)._localePrefilledFrom) {
    // Re-ID groups first and build an old→new map so child blocks can repoint
    // their group_id to the freshly-cloned group rows.
    const groupIdRemap = new Map<string, string>();
    for (const group of blockGroups) {
      const newGroupId = randomUUID();
      if (group.id) groupIdRemap.set(String(group.id), newGroupId);
      group.id = newGroupId;
    }
    for (const block of blocks) {
      const newId = randomUUID();
      block.id = newId;
      if (block.data && typeof block.data === 'object') {
        (block.data as any).id = newId;
        const oldGroupId = (block.data as any).group_id;
        if (oldGroupId && groupIdRemap.has(String(oldGroupId))) {
          (block.data as any).group_id = groupIdRemap.get(String(oldGroupId));
        }
      }
      reidNestedRows(block.data);
    }
    for (const fieldName of Object.keys(collectionDefinition.fields || {})) {
      const fieldDef: any = (collectionDefinition.fields as any)[fieldName];
      if (fieldDef?.type === 'array' && Array.isArray((page as any)[fieldName])) {
        for (const row of (page as any)[fieldName]) {
          if (row && typeof row === 'object') {
            row.id = randomUUID();
            reidNestedRows(row);
          }
        }
      }
    }
  }

  // Load user names for author and last_modified_by fields
  if (!isNewItem) {
    try {
      if (page.author) {
        const authorUser = await db.query.users.findFirst({
          where: (users: any, { eq }: any) => eq(users.id, page.author),
          columns: { name: true, email: true }
        });
        page.author_name = authorUser?.name || null;
        page.author_email = authorUser?.email || null;
      }

      if (page.last_modified_by) {
        const lastModifiedUser = await db.query.users.findFirst({
          where: (users: any, { eq }: any) => eq(users.id, page.last_modified_by),
          columns: { name: true, email: true }
        });
        page.last_modified_by_name = lastModifiedUser?.name || null;
        page.last_modified_by_email = lastModifiedUser?.email || null;
      }
    } catch (error) {
      log.warn('Failed to load user names', { error });
    }
  }

  // For localized collections, look up every sibling `_locales` row id/locale
  // for this parent — feeds both `translatedLocales` (the switcher) AND the
  // cross-locale revisions stream below. One query, two consumers.
  let translatedLocales: string[] = [];
  let localeRowMap: Map<string, string> = new Map(); // entity_id → locale
  if (isLocalized && !isNewItem && localesTable) {
    try {
      const rows = await db
        .select({ id: (localesTable as any).id, locale: localesTable.locale })
        .from(localesTable)
        .where(eq(localesTable[`${slug}_id`], itemId));
      translatedLocales = rows.map((r: any) => r.locale as string);
      localeRowMap = new Map(rows.map((r: any) => [r.id as string, r.locale as string]));
    } catch (err) {
      log.warn('Failed to load translated locales', { slug, id: itemId, err });
    }
  }

  // Revisions are scoped per-row: for localized collections, one stream per
  // `_locales` row (each translation owns its history — restoring the nb-NO
  // revision never clobbers en content). The History dialog merges them
  // chronologically here so admins see the full per-item story in one place;
  // each row carries its own `entity_id` so the restore handler stays scoped.
  const revisionEntityIds = isLocalized
    ? Array.from(localeRowMap.keys())
    : page.id
      ? [String(page.id)]
      : [];
  let revisions: LoadedCollectionItemRevision[] = [];
  if (
    !isNewItem &&
    revisionEntityIds.length > 0 &&
    resolveRevisionsKeep(collectionDefinition.options?.revisions) !== null
  ) {
    try {
      const rows = await db
        .select({
          id: schema.revisions.id,
          entity_id: schema.revisions.entity_id,
          data: schema.revisions.data,
          created_at: schema.revisions.created_at,
          created_by_id: schema.revisions.created_by,
          created_by_name: schema.users.name,
          created_by_email: schema.users.email
        })
        .from(schema.revisions)
        .leftJoin(schema.users, eq(schema.users.id, schema.revisions.created_by))
        .where(
          and(
            eq(schema.revisions.entity_type, `collection:${slug}`),
            revisionEntityIds.length === 1
              ? eq(schema.revisions.entity_id, revisionEntityIds[0])
              : inArray(schema.revisions.entity_id, revisionEntityIds)
          )
        )
        .orderBy(desc(schema.revisions.created_at))
        .limit(50);
      revisions = rows.map((r: (typeof rows)[number]) => {
        let parsed: Record<string, unknown> = {};
        try {
          const v = JSON.parse(r.data);
          if (v && typeof v === 'object') parsed = v as Record<string, unknown>;
        } catch {
          // leave as empty object
        }
        return {
          id: r.id,
          entity_id: r.entity_id,
          locale: isLocalized ? (localeRowMap.get(r.entity_id) ?? null) : null,
          created_at: r.created_at as Date,
          created_by_id: r.created_by_id,
          created_by_name: r.created_by_name,
          created_by_email: r.created_by_email,
          data: parsed
        };
      });
    } catch (err) {
      log.error('Failed to load revisions for page', { slug, id: page.id }, err as Error);
    }
  }

  return {
    page,
    isNewItem,
    collectionType: collectionDefinition,
    effectiveFields,
    availableBlocks: Object.values(availableBlocks),
    blocks,
    blockGroups,
    hasBlocks: collectionDefinition.options?.blocks !== false,
    localized: isLocalized,
    availableLocales,
    currentLocale,
    translatedLocales,
    revisions
  };
}
