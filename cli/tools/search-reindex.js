// Full rebuild of the search_index table from templates + entity rows.
//
// NOTE v1 scope: this CLI indexes top-level text fields only. Block content
// is NOT walked here — it gets populated incrementally by the SearchIndexService
// save hooks (added in a later step). Run `search:reindex` to get a clean
// baseline; block-level coverage catches up as items are saved.

import { sql, eq, and } from 'drizzle-orm';
import { pathToFileURL } from 'url';
import { existsSync, readdirSync } from 'fs';
import path from 'path';
import { createCliDbOrFail, getConsumerSchemaOrFail } from '../utils.js';

const TEXT_FIELD_TYPES = new Set(['string', 'text', 'textarea', 'wysiwyg', 'email', 'link']);

// Scan each template file directly instead of going through the barrel's
// `index.ts` — Node's strict ESM resolver doesn't rewrite `./posts` to
// `./posts.ts` inside the barrel, so importing files one-by-one avoids the
// broken intermediate re-exports.
async function loadDefinitionsFromDir(dir) {
  if (!existsSync(dir)) return {};
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && f !== 'index.ts');
  const defs = {};
  for (const file of files) {
    const mod = await import(pathToFileURL(path.join(dir, file)).href);
    for (const exp of Object.values(mod)) {
      if (
        exp &&
        typeof exp === 'object' &&
        typeof exp.slug === 'string' &&
        exp.fields &&
        typeof exp.fields === 'object'
      ) {
        defs[exp.slug] = exp;
      }
    }
  }
  return defs;
}

async function loadConsumerTemplates(targetDir) {
  const base = path.join(targetDir, 'src', 'lib', 'sailor', 'templates');
  if (!existsSync(base)) {
    throw new Error(
      'Sailor templates not found at src/lib/sailor/templates. Run "npx sailor core:init" first.'
    );
  }
  return {
    collectionDefinitions: await loadDefinitionsFromDir(path.join(base, 'collections')),
    globalDefinitions: await loadDefinitionsFromDir(path.join(base, 'globals'))
  };
}

function collectTextFieldNames(fields) {
  const out = [];
  for (const [name, field] of Object.entries(fields || {})) {
    const type = field?.type;
    if (!type || TEXT_FIELD_TYPES.has(type)) out.push(name);
  }
  return out;
}

function stripToPlainText(source) {
  if (!source || typeof source !== 'string') return '';
  let text = source;
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.includes('"type"')) {
    try {
      text = extractTipTapText(JSON.parse(trimmed));
    } catch {
      // fall through
    }
  }
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTipTapText(node) {
  if (!node) return '';
  if (typeof node.text === 'string') return node.text;
  if (Array.isArray(node.content)) {
    return node.content.map(extractTipTapText).filter(Boolean).join(' ');
  }
  return '';
}

function buildRowPayload(entityType, entityName, def, row, tagNames = []) {
  const parts = [];
  const topFields = collectTextFieldNames(def.fields ?? {});
  for (const f of topFields) {
    if (typeof row[f] === 'string') parts.push(stripToPlainText(row[f]));
  }
  for (const core of ['title', 'slug']) {
    if (!topFields.includes(core) && typeof row[core] === 'string') parts.push(row[core]);
  }
  if (tagNames.length) parts.push(tagNames.join(' '));
  const searchableText = parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  const updatedAt =
    row.updated_at instanceof Date
      ? row.updated_at
      : new Date(row.updated_at ?? row.created_at ?? Date.now());
  return {
    entity_type: entityType,
    entity_name: entityName,
    entity_id: row.id,
    title: typeof row.title === 'string' ? row.title : null,
    searchable_text: searchableText,
    status: typeof row.status === 'string' ? row.status : null,
    updated_at: updatedAt
  };
}

async function reindexAll() {
  const targetDir = process.cwd();
  const db = await createCliDbOrFail(targetDir);
  const schema = await getConsumerSchemaOrFail(targetDir);
  const { collectionDefinitions, globalDefinitions } = await loadConsumerTemplates(targetDir);

  const searchIndex = schema.searchIndex;
  if (!searchIndex) {
    throw new Error(
      'search_index table missing from generated schema. Run `npx sailor db:update` first.'
    );
  }

  // Ensure FTS5 virtual table exists + is empty. Fails silently on non-SQLite;
  // search() will fall back to LIKE.
  let ftsAvailable = false;
  try {
    // Drop and recreate to guarantee trigram tokenizer (handles migration
    // from older porter-based builds).
    await db.run(sql`DROP TABLE IF EXISTS search_index_fts`);
    await db.run(sql`
      CREATE VIRTUAL TABLE search_index_fts USING fts5(
        entity_type UNINDEXED,
        entity_name UNINDEXED,
        entity_id UNINDEXED,
        title,
        searchable_text,
        tokenize = 'trigram'
      )
    `);
    ftsAvailable = true;
  } catch (err) {
    console.warn('⚠ FTS5 init skipped (likely non-SQLite backend):', err.message);
  }

  console.log('🧹 Clearing search_index...');
  await db.delete(searchIndex);
  if (ftsAvailable) {
    await db.run(sql`DELETE FROM search_index_fts`);
  }

  const { tags: tagsTable, taggables } = schema;
  // Query both the slug-qualified taggable_type and any bare-prefix fallback,
  // so tags stored by older/buggy write paths still surface in the index.
  async function loadTagNames(primaryType, taggableId, fallbackType) {
    if (!tagsTable || !taggables) return [];
    const types = fallbackType ? [primaryType, fallbackType] : [primaryType];
    const names = new Set();
    for (const t of types) {
      try {
        const rows = await db
          .select({ name: tagsTable.name })
          .from(taggables)
          .innerJoin(tagsTable, eq(taggables.tag_id, tagsTable.id))
          .where(and(eq(taggables.taggable_type, t), eq(taggables.taggable_id, taggableId)));
        for (const r of rows) if (r.name) names.add(r.name);
      } catch {
        // ignore
      }
    }
    return Array.from(names);
  }

  let indexed = 0;
  let skipped = 0;

  for (const [name, def] of Object.entries(collectionDefinitions)) {
    if (def?.options?.searchable !== true) continue;
    const table = schema[`collection_${name}`];
    if (!table) {
      console.warn(`⚠ collection_${name} not in schema; skipping`);
      continue;
    }
    const rows = await db.select().from(table);
    for (const row of rows) {
      try {
        const tagNames = await loadTagNames(`collection_${name}`, row.id, 'collection');
        const payload = buildRowPayload('collection', name, def, row, tagNames);
        await db.insert(searchIndex).values(payload);
        if (ftsAvailable) await insertFtsRow(payload);
        indexed++;
      } catch (err) {
        skipped++;
        console.warn(`⚠ collection:${name} id=${row.id} failed:`, err.message);
      }
    }
    console.log(`  • collection:${name} → ${rows.length} rows`);
  }

  for (const [name, def] of Object.entries(globalDefinitions)) {
    if (def?.options?.searchable !== true) continue;
    const table = schema[`global_${name}`];
    if (!table) {
      console.warn(`⚠ global_${name} not in schema; skipping`);
      continue;
    }
    const rows = await db.select().from(table);
    for (const row of rows) {
      try {
        const tagNames = await loadTagNames(`global_${name}`, row.id, 'global');
        const payload = buildRowPayload('global', name, def, row, tagNames);
        await db.insert(searchIndex).values(payload);
        if (ftsAvailable) await insertFtsRow(payload);
        indexed++;
      } catch (err) {
        skipped++;
        console.warn(`⚠ global:${name} id=${row.id} failed:`, err.message);
      }
    }
    console.log(`  • global:${name} → ${rows.length} rows`);
  }

  async function insertFtsRow(payload) {
    await db.run(sql`
      INSERT INTO search_index_fts (entity_type, entity_name, entity_id, title, searchable_text)
      VALUES (${payload.entity_type}, ${payload.entity_name}, ${payload.entity_id}, ${payload.title ?? ''}, ${payload.searchable_text})
    `);
  }

  return { indexed, skipped };
}

export function registerSearchReindex(program) {
  program
    .command('search:reindex')
    .description(
      'Rebuild the search_index table from all searchable entities (top-level fields only)'
    )
    .action(async () => {
      try {
        console.log('🔎 Rebuilding search index...');
        const { indexed, skipped } = await reindexAll();
        console.log(`✅ Search index rebuilt: ${indexed} indexed, ${skipped} skipped`);
      } catch (err) {
        console.error('❌ search:reindex failed:', err.message);
        process.exit(1);
      }
    });
}

if (process.argv[1] && process.argv[1].endsWith('search-reindex.js')) {
  reindexAll()
    .then(({ indexed, skipped }) => {
      console.log(`Done: ${indexed} indexed, ${skipped} skipped`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Error:', err);
      process.exit(1);
    });
}
