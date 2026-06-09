import { db } from '../db/index.server';
import { and, eq, isNull, sql } from 'drizzle-orm';
import * as schema from '$sailor/generated/schema';
import { fieldConfigurations } from '$sailor/generated/fields';
import { collectionDefinitions } from '$sailor/templates/collections';
import { globalDefinitions } from '$sailor/templates/globals';
import { blockDefinitions } from '$sailor/templates/blocks';
import type { FieldDefinition } from '../types';
import { readGlobal, readCollection } from './data-read.server';
import { getContentSettings } from 'sailorcms/core/settings/i18n';
import { TagService } from './tag.server';

// Resolved lazily so the file typechecks even before `npx sailor db:update`
// has regenerated generated/schema.ts with the search_index table.
function getTable(): any {
  const t = (schema as any).searchIndex;
  if (!t) {
    throw new Error(
      'search_index table is missing from generated schema. Run `npx sailor db:update` to regenerate.'
    );
  }
  return t;
}

// FTS5 bootstrap — lazy and cached. Uses the trigram tokenizer (better than
// porter for CMS site search: handles substrings and partial words natively,
// e.g. "sail" finds "sailor", "mail" finds "email"). SQLite 3.34+ / libsql /
// Turso all include it.
//
// If an older porter-based table exists (from earlier versions), drop and
// recreate it — data is derived from `search_index` and will be rebuilt
// on the next save or `search:reindex`.
let ftsBootstrap: Promise<boolean> | null = null;

const FTS_CREATE_SQL = `CREATE VIRTUAL TABLE search_index_fts USING fts5(
  entity_type UNINDEXED,
  entity_name UNINDEXED,
  entity_id UNINDEXED,
  locale UNINDEXED,
  title,
  searchable_text,
  tokenize = 'trigram'
)`;

export async function ensureFtsReady(): Promise<boolean> {
  if (!ftsBootstrap) {
    ftsBootstrap = (async () => {
      try {
        const existing: any = await db.all(
          sql`SELECT sql FROM sqlite_master WHERE type='table' AND name='search_index_fts'`
        );
        const existingSql: string | undefined = existing?.[0]?.sql;
        const usesTrigram =
          typeof existingSql === 'string' && /tokenize\s*=\s*'trigram'/i.test(existingSql);
        // The locale column was added when localized collections landed —
        // older FTS tables (pre-i18n) are missing it. Detect and rebuild
        // for the same reasons we rebuild older porter-tokenized tables.
        const hasLocaleCol =
          typeof existingSql === 'string' && /[\s,]\s*locale\s+UNINDEXED/i.test(existingSql);

        const needsRebuild = !existingSql || !usesTrigram || !hasLocaleCol;

        if (existingSql && needsRebuild) {
          await db.run(sql`DROP TABLE search_index_fts`);
        }
        if (needsRebuild) {
          await db.run(sql.raw(FTS_CREATE_SQL));
          // Repopulate from search_index so existing entries are searchable
          // without waiting for the next save.
          await db.run(sql`
            INSERT INTO search_index_fts (entity_type, entity_name, entity_id, locale, title, searchable_text)
            SELECT entity_type, entity_name, entity_id, locale, coalesce(title, ''), searchable_text
            FROM search_index
          `);
        }
        return true;
      } catch (err) {
        console.warn('search_index: FTS5 init failed; falling back to LIKE queries.', err);
        return false;
      }
    })();
  }
  return ftsBootstrap;
}

const TEXT_FIELD_TYPES = new Set(['string', 'text', 'textarea', 'wysiwyg', 'email', 'link']);

type EntityType = 'collection' | 'global';

export interface SearchIndexEntry {
  entityType: EntityType;
  entityName: string;
  entityId: string;
  /**
   * BCP-47 locale code for localized collections (one row per item per locale).
   * Null for non-localized entities (one row per item, full stop).
   */
  locale: string | null;
  title: string | null;
  searchableText: string;
  status: string | null;
  updatedAt: Date;
}

/**
 * Locale-aware WHERE clause for `search_index` lookups. Drizzle/SQLite
 * treats `column = NULL` as never true, so non-localized rows (locale IS
 * NULL) need explicit `isNull` rather than `eq(table.locale, null)`.
 */
function localeMatch(table: any, locale: string | null) {
  return locale === null ? isNull(table.locale) : eq(table.locale, locale);
}

export class SearchIndexService {
  static async upsert(entry: SearchIndexEntry): Promise<void> {
    const table = getTable();
    const existing = await db
      .select({ id: table.id })
      .from(table)
      .where(
        and(
          eq(table.entity_type, entry.entityType),
          eq(table.entity_name, entry.entityName),
          eq(table.entity_id, entry.entityId),
          localeMatch(table, entry.locale)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(table)
        .set({
          title: entry.title,
          searchable_text: entry.searchableText,
          status: entry.status,
          updated_at: entry.updatedAt
        })
        .where(eq(table.id, existing[0].id));
    } else {
      await db.insert(table).values({
        entity_type: entry.entityType,
        entity_name: entry.entityName,
        entity_id: entry.entityId,
        locale: entry.locale,
        title: entry.title,
        searchable_text: entry.searchableText,
        status: entry.status,
        updated_at: entry.updatedAt
      });
    }

    await syncFtsRow(entry);
  }

  static async delete(ref: {
    entityType: EntityType;
    entityName: string;
    entityId: string;
    /** Pass a locale to delete just that translation's row; omit/null to delete the non-localized row or every locale row for the item. */
    locale?: string | null;
  }): Promise<void> {
    const table = getTable();
    const conditions = [
      eq(table.entity_type, ref.entityType),
      eq(table.entity_name, ref.entityName),
      eq(table.entity_id, ref.entityId)
    ];
    if (ref.locale !== undefined) {
      conditions.push(localeMatch(table, ref.locale));
    }
    await db.delete(table).where(and(...conditions));
    await deleteFtsRow(ref.entityType, ref.entityName, ref.entityId, ref.locale);
  }

  /**
   * Re-index a single entity item. Removes the index row if the entity has
   * explicitly opted out (`options.searchable: false`) or the item no longer
   * exists. Everything else is indexed by default — admin search ranges over
   * the full index; `utils/data/search.ts` filters down to `searchable: true`
   * entities for public site search.
   */
  /**
   * Reindex one item. For non-localized entities this is a single row write.
   * For localized collections, `locale` controls scope:
   *   - Pass a specific locale → reindex just that translation's row
   *     (what the save handler does after a single-locale save).
   *   - Pass `undefined` → reindex every translation that exists in
   *     `content.i18n.locales` (full rebuild path).
   */
  static async reindexEntity(
    entityType: EntityType,
    entityName: string,
    entityId: string,
    locale?: string
  ): Promise<void> {
    const def = getDefinition(entityType, entityName);
    if (!def || def.options?.searchable === false) {
      await SearchIndexService.delete({ entityType, entityName, entityId });
      return;
    }

    const isLocalized =
      (entityType === 'collection' &&
        (fieldConfigurations as any).collections?.[entityName]?.localized === true) ||
      (entityType === 'global' &&
        (fieldConfigurations as any).globals?.[entityName]?.localized === true);

    if (!isLocalized) {
      // Single non-localized row.
      const item =
        entityType === 'collection'
          ? await readCollection(entityName, {
              itemId: entityId,
              status: 'all',
              includeBlocks: def.options?.blocks === true
            })
          : await readGlobal(entityName, { itemId: entityId, status: 'all' });

      if (!item) {
        await SearchIndexService.delete({ entityType, entityName, entityId, locale: null });
        return;
      }

      const tagNames = await loadTagNames(entityType, entityName, entityId);
      const blockTagsByBlockId = await loadBlockTagsForItem(entityType, def, item);
      const payload = buildEntry(
        entityType,
        entityName,
        def,
        item,
        null,
        tagNames,
        blockTagsByBlockId
      );
      await SearchIndexService.upsert(payload);
      return;
    }

    // Localized entity (collection or global). Iterate the requested locale
    // (single-locale save) or every configured content locale (full rebuild).
    const { locales } = getContentSettings();
    const localesToIndex = locale ? [locale] : (locales ?? []);

    for (const loc of localesToIndex) {
      const item: any =
        entityType === 'collection'
          ? await readCollection(entityName, {
              itemId: entityId,
              locale: loc,
              fallback: 'strict', // index only real translations, not fallback duplicates
              status: 'all',
              includeBlocks: def.options?.blocks === true
            })
          : await readGlobal(entityName, {
              itemId: entityId,
              locale: loc,
              fallback: 'strict',
              status: 'all'
            });

      if (!item) {
        // No translation for this locale — make sure any stale row is gone.
        await SearchIndexService.delete({ entityType, entityName, entityId, locale: loc });
        continue;
      }

      // Tags under `taggable_type = '<type>_<name>'` for both modes; for
      // localized items the `taggable_id` is the `_locales` row id,
      // surfaced as `item._localeId` by the localized read path.
      const tagsTaggableId = (item._localeId as string) ?? entityId;
      const tagNames = await loadTagNames(entityType, entityName, tagsTaggableId);
      const blockTagsByBlockId = await loadBlockTagsForItem(entityType, def, item);
      const payload = buildEntry(
        entityType,
        entityName,
        def,
        item,
        loc,
        tagNames,
        blockTagsByBlockId
      );
      await SearchIndexService.upsert(payload);
    }
  }

  /**
   * Full rebuild. Walks every entity + every item and upserts them. Entities
   * with `options.searchable: false` are skipped (explicit opt-out for huge or
   * sensitive collections); everything else is indexed.
   */
  static async reindexAll(): Promise<{ indexed: number; skipped: number }> {
    let indexed = 0;
    let skipped = 0;

    const { locales: contentLocales } = getContentSettings();

    for (const [name, def] of Object.entries(collectionDefinitions) as Array<[string, any]>) {
      if (def?.options?.searchable === false) continue;

      const isLocalized = (fieldConfigurations as any).collections?.[name]?.localized === true;

      if (!isLocalized) {
        const result = await readCollection(name, {
          status: 'all',
          includeBlocks: def.options?.blocks === true,
          limit: 10_000
        });
        const items = (result as any).items ?? [];
        for (const item of items) {
          try {
            const tagNames = await loadTagNames('collection', name, item.id);
            const blockTagsByBlockId = await loadBlockTagsForItem('collection', def, item);
            const payload = buildEntry(
              'collection',
              name,
              def,
              item,
              null,
              tagNames,
              blockTagsByBlockId
            );
            await SearchIndexService.upsert(payload);
            indexed++;
          } catch (err) {
            skipped++;
            console.warn(`reindex collection:${name} id=${item.id} failed:`, err);
          }
        }
        continue;
      }

      // Localized: one row per (item, locale). Iterate every configured
      // content locale and index whatever translations exist.
      for (const loc of contentLocales ?? []) {
        const result = await readCollection(name, {
          locale: loc,
          fallback: 'strict',
          status: 'all',
          includeBlocks: def.options?.blocks === true,
          limit: 10_000
        });
        const items = (result as any).items ?? [];
        for (const item of items) {
          try {
            const tagsTaggableId = (item._localeId as string) ?? item.id;
            const tagNames = await loadTagNames('collection', name, tagsTaggableId);
            const blockTagsByBlockId = await loadBlockTagsForItem('collection', def, item);
            const payload = buildEntry(
              'collection',
              name,
              def,
              item,
              loc,
              tagNames,
              blockTagsByBlockId
            );
            await SearchIndexService.upsert(payload);
            indexed++;
          } catch (err) {
            skipped++;
            console.warn(`reindex collection:${name}:${loc} id=${item.id} failed:`, err);
          }
        }
      }
    }

    for (const [name, def] of Object.entries(globalDefinitions) as Array<[string, any]>) {
      if (def?.options?.searchable === false) continue;

      const isLocalized = (fieldConfigurations as any).globals?.[name]?.localized === true;

      if (isLocalized) {
        // Localized globals iterate locales just like localized collections.
        for (const loc of contentLocales ?? []) {
          const result = await readGlobal(name, {
            locale: loc,
            fallback: 'strict',
            status: 'all',
            limit: 10_000
          });
          const items = (result as any).items ?? [];
          for (const item of items) {
            try {
              const tagsTaggableId = (item._localeId as string) ?? item.id;
              const tagNames = await loadTagNames('global', name, tagsTaggableId);
              const payload = buildEntry('global', name, def, item, loc, tagNames, {});
              await SearchIndexService.upsert(payload);
              indexed++;
            } catch (err) {
              skipped++;
              console.warn(`reindex global:${name}:${loc} id=${item.id} failed:`, err);
            }
          }
        }
        continue;
      }

      const result = await readGlobal(name, { status: 'all', limit: 10_000 });
      const items = (result as any).items ?? [];
      for (const item of items) {
        try {
          const tagNames = await loadTagNames('global', name, item.id);
          const payload = buildEntry('global', name, def, item, null, tagNames, {});
          await SearchIndexService.upsert(payload);
          indexed++;
        } catch (err) {
          skipped++;
          console.warn(`reindex global:${name} id=${item.id} failed:`, err);
        }
      }
    }

    return { indexed, skipped };
  }

  static async clear(): Promise<void> {
    const table = getTable();
    await db.delete(table);
    if (await ensureFtsReady()) {
      await db.run(sql`DELETE FROM search_index_fts`);
    }
  }

  /**
   * Operational snapshot of the search index. Used by the admin health UI
   * to show "what's indexed and when was it last touched" so operators can
   * tell at a glance whether the index is current.
   *
   * Returns total row count, per-entity breakdown, per-locale breakdown,
   * the most-recent updated_at across the whole index, and the FTS
   * availability flag (FTS5 may be unavailable on non-SQLite backends).
   */
  static async getHealth(): Promise<{
    totalRows: number;
    lastUpdatedAt: Date | null;
    ftsAvailable: boolean;
    perEntity: Array<{
      entityType: EntityType;
      entityName: string;
      count: number;
      lastUpdatedAt: Date | null;
      searchableInTemplate: boolean;
    }>;
    perLocale: Array<{ locale: string | null; count: number }>;
  }> {
    const table = getTable();

    const totalRowsRow: any = await db.all(sql`SELECT COUNT(*) AS n FROM ${table}`);
    const totalRows = Number(totalRowsRow?.[0]?.n ?? 0);

    const lastRow: any = await db.all(sql`SELECT MAX(updated_at) AS t FROM ${table}`);
    const lastRaw = lastRow?.[0]?.t;
    const lastUpdatedAt = lastRaw ? new Date(lastRaw) : null;

    const perEntityRaw: any = await db.all(sql`
      SELECT entity_type, entity_name, COUNT(*) AS count, MAX(updated_at) AS last
      FROM ${table}
      GROUP BY entity_type, entity_name
      ORDER BY entity_type, entity_name
    `);
    const perEntity = (perEntityRaw ?? []).map((r: any) => {
      const entityType = r.entity_type as EntityType;
      const entityName = String(r.entity_name);
      const def =
        entityType === 'collection'
          ? (collectionDefinitions as Record<string, any>)[entityName]
          : (globalDefinitions as Record<string, any>)[entityName];
      // Public allowlist: defaults to true unless explicitly opted out.
      // (Matches the indexer's behavior — searchable: false means skip.)
      const searchableInTemplate = def?.options?.searchable !== false;
      return {
        entityType,
        entityName,
        count: Number(r.count ?? 0),
        lastUpdatedAt: r.last ? new Date(r.last) : null,
        searchableInTemplate
      };
    });

    const perLocaleRaw: any = await db.all(sql`
      SELECT locale, COUNT(*) AS count
      FROM ${table}
      GROUP BY locale
      ORDER BY locale
    `);
    const perLocale = (perLocaleRaw ?? []).map((r: any) => ({
      locale: r.locale ?? null,
      count: Number(r.count ?? 0)
    }));

    const ftsAvailable = await ensureFtsReady();

    return { totalRows, lastUpdatedAt, ftsAvailable, perEntity, perLocale };
  }

  /**
   * Non-throwing wrappers for save/delete hook points. Index maintenance is
   * secondary to content writes — a failure here should never break the user's
   * save, just log.
   */
  static async onSaveSafe(
    entityType: EntityType,
    entityName: string,
    entityId: string,
    locale?: string
  ): Promise<void> {
    try {
      await SearchIndexService.reindexEntity(entityType, entityName, entityId, locale);
    } catch (err) {
      console.warn(
        `search_index: reindex failed for ${entityType}:${entityName} ${entityId}${locale ? `:${locale}` : ''}`,
        err
      );
    }
  }

  static async onDeleteSafe(
    entityType: EntityType,
    entityName: string,
    entityId: string,
    locale?: string
  ): Promise<void> {
    try {
      await SearchIndexService.delete({
        entityType,
        entityName,
        entityId,
        locale: locale ?? undefined
      });
    } catch (err) {
      console.warn(`search_index: delete failed for ${entityType}:${entityName} ${entityId}`, err);
    }
  }
}

// --- internals ---

function getDefinition(type: EntityType, name: string): any | undefined {
  const registry = (type === 'collection' ? collectionDefinitions : globalDefinitions) as Record<
    string,
    any
  >;
  return registry[name];
}

function buildEntry(
  entityType: EntityType,
  entityName: string,
  def: any,
  item: any,
  locale: string | null,
  tagNames: string[] = [],
  blockTagsByBlockId: Record<string, string[]> = {}
): SearchIndexEntry {
  const parts: string[] = [];

  // Walk the template's fields and pull every searchable bit of text — top-
  // level strings, array-row strings, file metadata (alt/title/description),
  // relation target labels (title/name/label). The hydrated item shape comes
  // from readCollection/readGlobal which auto-hydrate arrays, files, and
  // relations, so we don't have to re-query here.
  collectSearchableText(def.fields ?? {}, item, parts);

  // Always include title/slug if present even if not explicitly typed. Skip when
  // the template declares them as fields — collectSearchableText already pulled
  // them, and pushing again double-weights those terms in the FTS body.
  for (const coreField of ['title', 'slug']) {
    if ((def.fields ?? {})[coreField]) continue;
    const v = item[coreField];
    if (typeof v === 'string') parts.push(v);
  }

  // Blocks (collections only, when enabled) — walk each block's field schema
  // the same way as top-level fields.
  if (entityType === 'collection' && def.options?.blocks && Array.isArray(item.blocks)) {
    for (const block of item.blocks) {
      const blockDef = (blockDefinitions as Record<string, any>)[block.blockType];
      if (!blockDef) continue;
      collectSearchableText(blockDef.fields ?? {}, block, parts);
      const blockTags = blockTagsByBlockId[block.id];
      if (blockTags?.length) parts.push(blockTags.join(' '));
    }
  }

  // Tags
  if (tagNames.length) parts.push(tagNames.join(' '));

  const searchableText = parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  const title = typeof item.title === 'string' ? item.title : null;
  const status = typeof item.status === 'string' ? item.status : null;
  const updatedAt =
    item.updated_at instanceof Date ? item.updated_at : new Date(item.updated_at ?? Date.now());

  return {
    entityType,
    entityName,
    entityId: item.id,
    locale,
    title,
    searchableText,
    status,
    updatedAt
  };
}

async function syncFtsRow(entry: SearchIndexEntry): Promise<void> {
  if (!(await ensureFtsReady())) return;
  try {
    // Delete is locale-scoped so we don't wipe out the EN row when reindexing
    // the NB row (or vice versa). SQLite treats `= NULL` as never-true, so
    // non-localized rows match via `IS NULL`.
    if (entry.locale === null) {
      await db.run(sql`
        DELETE FROM search_index_fts
        WHERE entity_type = ${entry.entityType}
          AND entity_name = ${entry.entityName}
          AND entity_id = ${entry.entityId}
          AND locale IS NULL
      `);
    } else {
      await db.run(sql`
        DELETE FROM search_index_fts
        WHERE entity_type = ${entry.entityType}
          AND entity_name = ${entry.entityName}
          AND entity_id = ${entry.entityId}
          AND locale = ${entry.locale}
      `);
    }
    await db.run(sql`
      INSERT INTO search_index_fts (entity_type, entity_name, entity_id, locale, title, searchable_text)
      VALUES (${entry.entityType}, ${entry.entityName}, ${entry.entityId}, ${entry.locale}, ${entry.title ?? ''}, ${entry.searchableText})
    `);
  } catch (err) {
    console.warn('search_index_fts: upsert failed', err);
  }
}

async function deleteFtsRow(
  entityType: EntityType,
  entityName: string,
  entityId: string,
  locale?: string | null
): Promise<void> {
  if (!(await ensureFtsReady())) return;
  try {
    // `undefined` → delete every row for the item (any locale or NULL).
    // `null` → just the non-localized row. A string → just that locale.
    if (locale === undefined) {
      await db.run(sql`
        DELETE FROM search_index_fts
        WHERE entity_type = ${entityType}
          AND entity_name = ${entityName}
          AND entity_id = ${entityId}
      `);
    } else if (locale === null) {
      await db.run(sql`
        DELETE FROM search_index_fts
        WHERE entity_type = ${entityType}
          AND entity_name = ${entityName}
          AND entity_id = ${entityId}
          AND locale IS NULL
      `);
    } else {
      await db.run(sql`
        DELETE FROM search_index_fts
        WHERE entity_type = ${entityType}
          AND entity_name = ${entityName}
          AND entity_id = ${entityId}
          AND locale = ${locale}
      `);
    }
  } catch (err) {
    console.warn('search_index_fts: delete failed', err);
  }
}

async function loadTagNames(
  entityType: EntityType,
  entityName: string,
  entityId: string
): Promise<string[]> {
  const names = new Set<string>();
  const keys = [`${entityType}_${entityName}`];
  // Defensive: some older / buggy write paths saved global tags under bare 'global'.
  // Check both so legacy data still shows up in search.
  if (entityType === 'global') keys.push('global');
  for (const key of keys) {
    try {
      const tags = await TagService.getTagsForEntity(key, entityId);
      for (const t of tags) if (t.name) names.add(t.name);
    } catch {
      // ignore
    }
  }
  return Array.from(names);
}

/**
 * Load tags per block on a hydrated collection item. Each block's tags live
 * under `taggable_type = 'block_<blockType>'` and `taggable_id = <block.id>`.
 * Returns a map from block id → tag names for use inside `buildEntry`.
 */
async function loadBlockTagsForItem(
  entityType: EntityType,
  def: any,
  item: any
): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  if (entityType !== 'collection' || !def?.options?.blocks || !Array.isArray(item?.blocks)) {
    return out;
  }
  for (const block of item.blocks) {
    if (!block?.id || !block?.blockType) continue;
    try {
      const tags = await TagService.getTagsForEntity(`block_${block.blockType}`, block.id);
      const names = tags.map((t) => t.name).filter(Boolean) as string[];
      if (names.length) out[block.id] = names;
    } catch {
      // ignore — a bad taggable lookup shouldn't break the whole reindex
    }
  }
  return out;
}

function collectTextFieldNames(fields: Record<string, FieldDefinition>): string[] {
  const out: string[] = [];
  for (const [name, field] of Object.entries(fields)) {
    const type = field?.type;
    // Untyped fields default to text-ish (e.g. `title: { position: 'main' }`)
    if (!type || TEXT_FIELD_TYPES.has(type)) out.push(name);
  }
  return out;
}

// File metadata keys folded into the index. Match `core` table columns on
// `files` — those are the only per-file fields editors can set with text
// they'd want to search by. Filename (`name`) is intentionally excluded:
// UUID-prefixed storage filenames pollute results without helping discovery.
const FILE_TEXT_KEYS = ['alt', 'title', 'description'];

// Relation target keys probed in order — first one that hits wins, so we
// don't double-index the same label under multiple keys. Most templates name
// their display field one of these; templates that don't will silently miss
// (acceptable — they can add the wanted field key to the target template).
const RELATION_LABEL_KEYS = ['title', 'name', 'label'];

/**
 * Recursively collect searchable text from a hydrated item against its
 * template field schema. Pushes plain-text fragments into `out` (the caller
 * joins + strips at the end).
 *
 * Walks four field-type families:
 *   - text-ish (string/text/textarea/wysiwyg/email/link) — push the value
 *   - array — recurse into each row using `field.items.properties`
 *   - file  — push `alt` / `title` / `description` from each hydrated file
 *   - relation — push the first matching `title` / `name` / `label` key
 *                from each hydrated target
 *
 * Untyped fields are treated as text-ish (matches the pre-extension behavior
 * for `title: { position: 'main' }` style declarations).
 */
function collectSearchableText(
  fields: Record<string, FieldDefinition>,
  source: Record<string, any>,
  out: string[]
): void {
  for (const [name, field] of Object.entries(fields)) {
    const type = field?.type;
    const value = source?.[name];

    if (!type || TEXT_FIELD_TYPES.has(type)) {
      if (typeof value === 'string') out.push(stripToPlainText(value));
      continue;
    }

    if (type === 'array' && Array.isArray(value)) {
      const itemFields = (field as any).items?.properties as
        | Record<string, FieldDefinition>
        | undefined;
      if (itemFields) {
        for (const row of value) {
          if (row && typeof row === 'object') {
            collectSearchableText(itemFields, row, out);
          }
        }
      }
      continue;
    }

    if (type === 'file') {
      const files = Array.isArray(value) ? value : value ? [value] : [];
      for (const f of files) {
        if (!f || typeof f !== 'object') continue;
        for (const key of FILE_TEXT_KEYS) {
          const v = (f as any)[key];
          if (typeof v === 'string' && v.trim()) out.push(v);
        }
      }
      continue;
    }

    if (type === 'relation') {
      const targets = Array.isArray(value) ? value : value ? [value] : [];
      for (const t of targets) {
        if (!t || typeof t !== 'object') continue;
        for (const key of RELATION_LABEL_KEYS) {
          const v = (t as any)[key];
          if (typeof v === 'string' && v.trim()) {
            out.push(v);
            break;
          }
        }
      }
      continue;
    }
  }
}

function stripToPlainText(source: string): string {
  if (!source) return '';
  let text = source;
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.includes('"type"')) {
    try {
      text = extractTextFromTiptap(JSON.parse(trimmed));
    } catch {
      // fall through to HTML strip
    }
  }
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTextFromTiptap(node: any): string {
  if (!node) return '';
  if (typeof node.text === 'string') return node.text;
  if (Array.isArray(node.content)) {
    return node.content.map(extractTextFromTiptap).filter(Boolean).join(' ');
  }
  return '';
}
