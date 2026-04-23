import { db } from '../../core/db/index.server';
import { sql, and, or, eq, desc, asc, inArray, type SQL } from 'drizzle-orm';
import * as schema from '../../generated/schema';
import { getCollections } from './collections';
import { getGlobals } from './globals';
import { ensureFtsReady } from '../../core/services/search-index.server';
import { collectionDefinitions } from '../../templates/collections';
import { globalDefinitions } from '../../templates/globals';
import type { FieldDefinition, Pagination } from '../../core/types';

type User = {
  id: string;
  email: string;
  name: string;
  role: string;
  image?: string | null;
};

export interface SearchScope {
  collections?: string[];
  globals?: string[];
}

export interface SearchOptions {
  scope?: SearchScope;
  limit?: number; // Default: 20
  offset?: number; // Default: 0
  status?: 'published' | 'draft' | 'all'; // Applies to collections. Default: 'published'
  user?: User | null;

  // Pagination URL generation (same shape as getCollections).
  // Populate `pagination` in the result when both `limit` and `baseUrl` are provided.
  baseUrl?: string;
  currentPage?: number;
}

export interface SearchResultItem {
  entityType: 'collection' | 'global';
  entityName: string;
  item: any;
  matchedFields: string[];
  snippet?: string;
}

export interface SearchResult {
  items: SearchResultItem[];
  total: number;
  totalByEntity: Record<string, number>;
  hasMore: boolean;
  pagination?: Pagination;
}

/**
 * Frontend site search. Queries the `search_index` table, which is maintained
 * by SearchIndexService on save hooks. Only entities with
 * `options.searchable: true` in their template appear in the index (and thus
 * in results).
 *
 * @example
 * ```typescript
 * const results = await search('hello', { user: locals.user });
 *
 * const results = await search('hello', {
 *   scope: { collections: ['posts'], globals: ['faq'] },
 *   limit: 10,
 *   user: locals.user
 * });
 * ```
 */
export async function search(
  query: string,
  options: SearchOptions = {}
): Promise<SearchResult> {
  const trimmed = query?.trim();
  if (!trimmed) {
    return { items: [], total: 0, totalByEntity: {}, hasMore: false };
  }

  const {
    scope,
    limit = 20,
    offset = 0,
    status = 'published',
    user,
    baseUrl,
    currentPage
  } = options;
  const table = (schema as any).searchIndex;
  if (!table) {
    console.error(
      'search(): search_index table missing from schema. Run `npx sailor db:update`.'
    );
    return { items: [], total: 0, totalByEntity: {}, hasMore: false };
  }

  const ftsAvailable = await ensureFtsReady();
  const conditions: SQL[] = [buildSearchCondition(table, trimmed, ftsAvailable)];

  if (status && status !== 'all') {
    // Status only applies to collections. Globals have no user-exposed draft
    // workflow in the admin UI, so their status (if any) is ignored here.
    conditions.push(
      or(
        eq(table.entity_type, 'global'),
        eq(table.status, status),
        sql`${table.status} is null`
      ) as SQL
    );
  }

  if (scope?.collections && scope.collections.length) {
    conditions.push(
      and(
        eq(table.entity_type, 'collection'),
        inArray(table.entity_name, scope.collections)
      ) as SQL
    );
  } else if (scope?.globals && !scope?.collections) {
    conditions.push(eq(table.entity_type, 'global') as SQL);
  }

  if (scope?.globals && scope.globals.length) {
    // If both collections + globals are scoped, widen: match either branch.
    // We already pushed a collection condition above; turn them into an OR.
    if (scope?.collections && scope.collections.length) {
      // pop the previous collection condition and replace with OR
      const collectionCond = conditions.pop() as SQL;
      const globalCond = and(
        eq(table.entity_type, 'global'),
        inArray(table.entity_name, scope.globals)
      ) as SQL;
      conditions.push(or(collectionCond, globalCond) as SQL);
    } else {
      conditions.push(
        and(
          eq(table.entity_type, 'global'),
          inArray(table.entity_name, scope.globals)
        ) as SQL
      );
    }
  }

  const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];

  let matches: Array<{
    entity_type: 'collection' | 'global';
    entity_name: string;
    entity_id: string;
    title: string | null;
    searchable_text: string;
    status: string | null;
    updated_at: Date;
  }> = [];
  try {
    matches = (await db
      .select({
        entity_type: table.entity_type,
        entity_name: table.entity_name,
        entity_id: table.entity_id,
        title: table.title,
        searchable_text: table.searchable_text,
        status: table.status,
        updated_at: table.updated_at
      })
      .from(table)
      .where(whereClause)
      .orderBy(desc(table.updated_at))) as any;
  } catch (err) {
    console.error('search(): query failed', err);
    return { items: [], total: 0, totalByEntity: {}, hasMore: false };
  }

  // FTS5 can miss typos and substring intents ("tuling" vs "tulling",
  // "mail" vs "email"). If the stemmed query returns nothing, retry with
  // LIKE so users at least see plausible matches.
  if (matches.length === 0 && ftsAvailable) {
    conditions[0] = buildSearchCondition(table, trimmed, false);
    const retryWhere = conditions.length > 1 ? and(...conditions) : conditions[0];
    try {
      matches = (await db
        .select({
          entity_type: table.entity_type,
          entity_name: table.entity_name,
          entity_id: table.entity_id,
          title: table.title,
          searchable_text: table.searchable_text,
          status: table.status,
          updated_at: table.updated_at
        })
        .from(table)
        .where(retryWhere)
        .orderBy(desc(table.updated_at))) as any;
    } catch (err) {
      console.error('search(): LIKE fallback failed', err);
    }
  }

  const total = matches.length;
  const totalByEntity: Record<string, number> = {};
  for (const m of matches) {
    totalByEntity[m.entity_name] = (totalByEntity[m.entity_name] ?? 0) + 1;
  }

  const page = matches.slice(offset, offset + limit);

  const items: SearchResultItem[] = [];
  for (const m of page) {
    const hydrated =
      m.entity_type === 'collection'
        ? await getCollections(m.entity_name, { itemId: m.entity_id, status, user })
        : await getGlobals(m.entity_name, { itemId: m.entity_id, user });
    if (!hydrated) continue;
    items.push({
      entityType: m.entity_type,
      entityName: m.entity_name,
      item: hydrated,
      matchedFields: findMatchedFields(m, trimmed),
      snippet: buildSnippetFromItem(m.entity_type, m.entity_name, hydrated, trimmed)
    });
  }

  const result: SearchResult = {
    items,
    total,
    totalByEntity,
    hasMore: offset + page.length < total
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

  return result;
}

// --- internals ---

/**
 * Build the WHERE clause fragment that matches `query` against a row in
 * `search_index`.
 *
 * - When FTS5 is available (SQLite / Turso), uses a correlated subquery
 *   against `search_index_fts` with the trigram tokenizer. Substring-friendly
 *   ("sail" finds "sailor", "mail" finds "email").
 * - Otherwise falls back to case-insensitive LIKE on title + searchable_text.
 *
 * Future backends (Postgres tsvector): add another branch here keyed on the
 * adapter type.
 */
function buildSearchCondition(table: any, query: string, ftsAvailable: boolean): SQL {
  if (ftsAvailable) {
    const ftsQuery = toFtsQuery(query);
    if (ftsQuery) {
      return sql`EXISTS (
        SELECT 1 FROM search_index_fts
        WHERE search_index_fts MATCH ${ftsQuery}
          AND search_index_fts.entity_type = ${table.entity_type}
          AND search_index_fts.entity_name = ${table.entity_name}
          AND search_index_fts.entity_id = ${table.entity_id}
      )` as SQL;
    }
  }
  const pattern = `%${escapeLike(query.toLowerCase())}%`;
  return or(
    sql`lower(${table.title}) like ${pattern}`,
    sql`lower(${table.searchable_text}) like ${pattern}`
  ) as SQL;
}

/**
 * Translate user input into an FTS5 query string. Strips FTS5 special
 * characters. Trigram tokenizer handles substrings natively, so no
 * trailing-prefix hack is needed. Empty return = "no searchable tokens",
 * caller should bypass FTS.
 */
function toFtsQuery(input: string): string {
  const tokens = input
    .split(/\s+/)
    .map((t) => t.replace(/["*()]/g, ''))
    .filter(Boolean);
  if (tokens.length === 0) return '';
  return tokens.join(' ');
}

/**
 * Build a snippet from the hydrated entity's own text fields, not from the
 * indexed searchable_text blob. Walks the template's text-typed fields in
 * declaration order; prefers one that contains the query, falls back to the
 * first non-empty field. Strips HTML and TipTap JSON.
 */
const TEXT_TYPES = new Set(['string', 'text', 'textarea', 'wysiwyg', 'email', 'link']);

function buildSnippetFromItem(
  entityType: 'collection' | 'global',
  entityName: string,
  item: any,
  query: string,
  windowSize = 160
): string {
  const registry = (entityType === 'collection'
    ? collectionDefinitions
    : globalDefinitions) as Record<string, any>;
  const def = registry[entityName];
  const fieldNames: string[] = [];
  if (def?.fields) {
    for (const [name, f] of Object.entries(def.fields)) {
      const type = (f as FieldDefinition).type;
      // Exclude title — it's already shown as the result header.
      if (name === 'title' || name === 'slug') continue;
      if (!type || TEXT_TYPES.has(type)) fieldNames.push(name);
    }
  }

  let firstNonEmpty = '';
  for (const name of fieldNames) {
    const text = stripToPlainText(item[name]);
    if (!text) continue;
    if (!firstNonEmpty) firstNonEmpty = text;
    if (text.toLowerCase().includes(query.toLowerCase())) {
      return windowAroundMatch(text, query, windowSize);
    }
  }
  if (firstNonEmpty) {
    return firstNonEmpty.length > windowSize
      ? firstNonEmpty.slice(0, windowSize).trim() + '…'
      : firstNonEmpty;
  }
  return '';
}

function stripToPlainText(source: any): string {
  if (!source || typeof source !== 'string') return '';
  let text = source;
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.includes('"type"')) {
    try {
      text = extractTipTapText(JSON.parse(trimmed));
    } catch {
      // fall through to HTML strip
    }
  }
  return text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractTipTapText(node: any): string {
  if (!node) return '';
  if (typeof node.text === 'string') return node.text;
  if (Array.isArray(node.content)) {
    return node.content.map(extractTipTapText).filter(Boolean).join(' ');
  }
  return '';
}

function windowAroundMatch(text: string, query: string, windowSize: number): string {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) {
    return text.length > windowSize ? text.slice(0, windowSize).trim() + '…' : text;
  }
  const half = Math.floor(windowSize / 2);
  const start = Math.max(0, idx - half);
  const end = Math.min(text.length, start + windowSize);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return prefix + text.slice(start, end).trim() + suffix;
}

function findMatchedFields(
  row: { title: string | null; searchable_text: string },
  query: string
): string[] {
  const q = query.toLowerCase();
  const matched: string[] = [];
  if (row.title && row.title.toLowerCase().includes(q)) matched.push('title');
  if (row.searchable_text && row.searchable_text.toLowerCase().includes(q)) {
    matched.push('content');
  }
  return matched;
}

function escapeLike(str: string): string {
  return str.replace(/[%_]/g, '');
}
