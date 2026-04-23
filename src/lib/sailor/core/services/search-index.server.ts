import { db } from '../db/index.server';
import { and, eq, sql } from 'drizzle-orm';
import * as schema from '../../generated/schema';
import { collectionDefinitions } from '../../templates/collections';
import { globalDefinitions } from '../../templates/globals';
import { blockDefinitions } from '../../templates/blocks';
import type { FieldDefinition } from '../types';
import { getCollections } from '../../utils/data/collections';
import { getGlobals } from '../../utils/data/globals';
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

        if (existingSql && !usesTrigram) {
          await db.run(sql`DROP TABLE search_index_fts`);
        }
        if (!existingSql || !usesTrigram) {
          await db.run(sql.raw(FTS_CREATE_SQL));
          // Repopulate from search_index so existing entries are searchable
          // without waiting for the next save.
          await db.run(sql`
            INSERT INTO search_index_fts (entity_type, entity_name, entity_id, title, searchable_text)
            SELECT entity_type, entity_name, entity_id, coalesce(title, ''), searchable_text
            FROM search_index
          `);
        }
        return true;
      } catch (err) {
        console.warn(
          'search_index: FTS5 init failed; falling back to LIKE queries.',
          err
        );
        return false;
      }
    })();
  }
  return ftsBootstrap;
}

const TEXT_FIELD_TYPES = new Set([
  'string',
  'text',
  'textarea',
  'wysiwyg',
  'email',
  'link'
]);

type EntityType = 'collection' | 'global';

export interface SearchIndexEntry {
  entityType: EntityType;
  entityName: string;
  entityId: string;
  title: string | null;
  searchableText: string;
  status: string | null;
  updatedAt: Date;
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
          eq(table.entity_id, entry.entityId)
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
  }): Promise<void> {
    const table = getTable();
    await db
      .delete(table)
      .where(
        and(
          eq(table.entity_type, ref.entityType),
          eq(table.entity_name, ref.entityName),
          eq(table.entity_id, ref.entityId)
        )
      );
    await deleteFtsRow(ref.entityType, ref.entityName, ref.entityId);
  }

  /**
   * Re-index a single entity item. Removes the index row if the entity is no
   * longer searchable or the item no longer exists.
   */
  static async reindexEntity(
    entityType: EntityType,
    entityName: string,
    entityId: string
  ): Promise<void> {
    const def = getDefinition(entityType, entityName);
    if (!def || def.options?.searchable !== true) {
      await SearchIndexService.delete({ entityType, entityName, entityId });
      return;
    }

    let item: any = null;
    if (entityType === 'collection') {
      item = await getCollections(entityName, {
        itemId: entityId,
        status: 'all',
        includeBlocks: def.options?.blocks === true
      });
    } else {
      item = await getGlobals(entityName, { itemId: entityId });
    }

    if (!item) {
      await SearchIndexService.delete({ entityType, entityName, entityId });
      return;
    }

    const tagNames = await loadTagNames(entityType, entityName, entityId);
    const payload = buildEntry(entityType, entityName, def, item, tagNames);
    await SearchIndexService.upsert(payload);
  }

  /**
   * Full rebuild. Walks every searchable entity + every item and upserts them.
   * Entries for non-searchable or missing items are left as-is; clear the table
   * first if you want a pristine rebuild (the CLI does this).
   */
  static async reindexAll(): Promise<{ indexed: number; skipped: number }> {
    let indexed = 0;
    let skipped = 0;

    for (const [name, def] of Object.entries(collectionDefinitions) as Array<
      [string, any]
    >) {
      if (def?.options?.searchable !== true) continue;
      const result = await getCollections(name, {
        status: 'all',
        includeBlocks: def.options?.blocks === true,
        limit: 10_000
      });
      const items = (result as any).items ?? [];
      for (const item of items) {
        try {
          const tagNames = await loadTagNames('collection', name, item.id);
          const payload = buildEntry('collection', name, def, item, tagNames);
          await SearchIndexService.upsert(payload);
          indexed++;
        } catch (err) {
          skipped++;
          console.warn(`reindex collection:${name} id=${item.id} failed:`, err);
        }
      }
    }

    for (const [name, def] of Object.entries(globalDefinitions) as Array<
      [string, any]
    >) {
      if (def?.options?.searchable !== true) continue;
      const result = await getGlobals(name);
      const items = (result as any).items ?? [];
      for (const item of items) {
        try {
          const tagNames = await loadTagNames('global', name, item.id);
          const payload = buildEntry('global', name, def, item, tagNames);
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
   * Non-throwing wrappers for save/delete hook points. Index maintenance is
   * secondary to content writes — a failure here should never break the user's
   * save, just log.
   */
  static async onSaveSafe(
    entityType: EntityType,
    entityName: string,
    entityId: string
  ): Promise<void> {
    try {
      await SearchIndexService.reindexEntity(entityType, entityName, entityId);
    } catch (err) {
      console.warn(
        `search_index: reindex failed for ${entityType}:${entityName} ${entityId}`,
        err
      );
    }
  }

  static async onDeleteSafe(
    entityType: EntityType,
    entityName: string,
    entityId: string
  ): Promise<void> {
    try {
      await SearchIndexService.delete({ entityType, entityName, entityId });
    } catch (err) {
      console.warn(
        `search_index: delete failed for ${entityType}:${entityName} ${entityId}`,
        err
      );
    }
  }
}

// --- internals ---

function getDefinition(type: EntityType, name: string): any | undefined {
  const registry = (type === 'collection'
    ? collectionDefinitions
    : globalDefinitions) as Record<string, any>;
  return registry[name];
}

function buildEntry(
  entityType: EntityType,
  entityName: string,
  def: any,
  item: any,
  tagNames: string[] = []
): SearchIndexEntry {
  const parts: string[] = [];

  // Top-level text fields from the template
  const topFields = collectTextFieldNames(def.fields ?? {});
  for (const f of topFields) {
    const v = item[f];
    if (typeof v === 'string') parts.push(stripToPlainText(v));
  }

  // Always include title/slug if present even if not explicitly typed
  for (const coreField of ['title', 'slug']) {
    if (topFields.includes(coreField)) continue;
    const v = item[coreField];
    if (typeof v === 'string') parts.push(v);
  }

  // Blocks (collections only, when enabled)
  if (entityType === 'collection' && def.options?.blocks && Array.isArray(item.blocks)) {
    for (const block of item.blocks) {
      const blockDef = (blockDefinitions as Record<string, any>)[block.blockType];
      if (!blockDef) continue;
      const blockFields = collectTextFieldNames(blockDef.fields ?? {});
      for (const f of blockFields) {
        const v = block[f];
        if (typeof v === 'string') parts.push(stripToPlainText(v));
      }
    }
  }

  // Tags
  if (tagNames.length) parts.push(tagNames.join(' '));

  const searchableText = parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  const title = typeof item.title === 'string' ? item.title : null;
  const status = typeof item.status === 'string' ? item.status : null;
  const updatedAt = item.updated_at instanceof Date
    ? item.updated_at
    : new Date(item.updated_at ?? Date.now());

  return {
    entityType,
    entityName,
    entityId: item.id,
    title,
    searchableText,
    status,
    updatedAt
  };
}

async function syncFtsRow(entry: SearchIndexEntry): Promise<void> {
  if (!(await ensureFtsReady())) return;
  try {
    await db.run(sql`
      DELETE FROM search_index_fts
      WHERE entity_type = ${entry.entityType}
        AND entity_name = ${entry.entityName}
        AND entity_id = ${entry.entityId}
    `);
    await db.run(sql`
      INSERT INTO search_index_fts (entity_type, entity_name, entity_id, title, searchable_text)
      VALUES (${entry.entityType}, ${entry.entityName}, ${entry.entityId}, ${entry.title ?? ''}, ${entry.searchableText})
    `);
  } catch (err) {
    console.warn('search_index_fts: upsert failed', err);
  }
}

async function deleteFtsRow(
  entityType: EntityType,
  entityName: string,
  entityId: string
): Promise<void> {
  if (!(await ensureFtsReady())) return;
  try {
    await db.run(sql`
      DELETE FROM search_index_fts
      WHERE entity_type = ${entityType}
        AND entity_name = ${entityName}
        AND entity_id = ${entityId}
    `);
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

function collectTextFieldNames(fields: Record<string, FieldDefinition>): string[] {
  const out: string[] = [];
  for (const [name, field] of Object.entries(fields)) {
    const type = field?.type;
    // Untyped fields default to text-ish (e.g. `title: { position: 'main' }`)
    if (!type || TEXT_FIELD_TYPES.has(type)) out.push(name);
  }
  return out;
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
