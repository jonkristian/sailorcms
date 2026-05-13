import { db } from 'sailorcms/core/db/index.server';
import { sql, and, or, eq, desc, asc, inArray, type SQL } from 'drizzle-orm';
import * as schema from '$sailor/generated/schema';
import { getCollections } from './collections';
import { getGlobals } from './globals';
import { ensureFtsReady } from 'sailorcms/core/services/search-index.server';
import { collectionDefinitions } from '$sailor/templates/collections';
import { globalDefinitions } from '$sailor/templates/globals';
import type { FieldDefinition, Pagination } from 'sailorcms/core/types';

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
 * Frontend site search. Queries the `search_index` table (maintained by
 * SearchIndexService on save hooks). The index contains every entity that
 * hasn't explicitly opted out via `options.searchable: false`; this function
 * narrows results to entities the template marks `options.searchable: true`,
 * so consumer sites only see content the developer has opted in publicly.
 *
 * Admin search lives in a separate path and skips this filter.
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
export async function search(query: string, options: SearchOptions = {}): Promise<SearchResult> {
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
    console.error('search(): search_index table missing from schema. Run `npx sailor db:update`.');
    return { items: [], total: 0, totalByEntity: {}, hasMore: false };
  }

  const ftsAvailable = await ensureFtsReady();
  const ftsQuery = ftsAvailable ? toFtsQuery(trimmed) : '';

  // The index holds every entity that hasn't opted out — public search narrows
  // back down to those with `options.searchable: true` so consumer site
  // behavior is unchanged from the pre-admin-search world.
  const publicAllowlist = collectPublicSearchableKeys();
  if (publicAllowlist.size === 0) {
    return { items: [], total: 0, totalByEntity: {}, hasMore: false };
  }
  const inAllowlist = (m: MatchRow) => publicAllowlist.has(`${m.entity_type}:${m.entity_name}`);

  let matches: MatchRow[] = [];

  if (ftsQuery) {
    try {
      matches = (await fetchFtsMatches(ftsQuery, status, scope)).filter(inAllowlist);
    } catch (err) {
      console.error('search(): FTS query failed', err);
    }
  }

  // FTS can miss typos and substring intents ("tuling" vs "tulling",
  // "mail" vs "email"). If nothing came back, retry with LIKE so users
  // at least see plausible matches.
  if (matches.length === 0) {
    try {
      matches = (await fetchLikeMatches(table, trimmed, status, scope)).filter(inAllowlist);
    } catch (err) {
      console.error('search(): LIKE query failed', err);
      return { items: [], total: 0, totalByEntity: {}, hasMore: false };
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

function collectPublicSearchableKeys(): Set<string> {
  const keys = new Set<string>();
  for (const [name, def] of Object.entries(collectionDefinitions)) {
    if ((def as any)?.options?.searchable === true) keys.add(`collection:${name}`);
  }
  for (const [name, def] of Object.entries(globalDefinitions)) {
    if ((def as any)?.options?.searchable === true) keys.add(`global:${name}`);
  }
  return keys;
}

type MatchRow = {
  entity_type: 'collection' | 'global';
  entity_name: string;
  entity_id: string;
  title: string | null;
  searchable_text: string;
  status: string | null;
  updated_at: Date;
};

/**
 * FTS5 query path. Joins `search_index_fts` with `search_index`, ranks results
 * via BM25 with the title column weighted ~5× higher than searchable_text,
 * then falls back to `updated_at` as tiebreaker.
 *
 * BM25 returns negative numbers where more-negative = better match, so we
 * ORDER BY rank ASC.
 */
async function fetchFtsMatches(
  ftsQuery: string,
  status: string,
  scope: SearchScope | undefined
): Promise<MatchRow[]> {
  const filters: SQL[] = [sql`search_index_fts MATCH ${ftsQuery}`];
  const statusFilter = buildStatusFilterRaw(status);
  if (statusFilter) filters.push(statusFilter);
  const scopeFilter = buildScopeFilterRaw(scope);
  if (scopeFilter) filters.push(scopeFilter);

  const whereClause = filters.length > 1 ? sql.join(filters, sql` AND `) : filters[0];

  const rows: any = await db.all(sql`
    SELECT
      si.entity_type AS entity_type,
      si.entity_name AS entity_name,
      si.entity_id AS entity_id,
      si.title AS title,
      si.searchable_text AS searchable_text,
      si.status AS status,
      si.updated_at AS updated_at,
      bm25(search_index_fts, 5.0, 1.0) AS rank
    FROM search_index si
    JOIN search_index_fts ON
      search_index_fts.entity_type = si.entity_type
      AND search_index_fts.entity_name = si.entity_name
      AND search_index_fts.entity_id = si.entity_id
    WHERE ${whereClause}
    ORDER BY rank ASC, si.updated_at DESC
  `);
  return rows.map(normalizeMatchRow);
}

/**
 * LIKE fallback path. No relevance score available, so we approximate:
 * title matches rank above content-only matches, then `updated_at` tiebreaker.
 */
async function fetchLikeMatches(
  table: any,
  query: string,
  status: string,
  scope: SearchScope | undefined
): Promise<MatchRow[]> {
  const pattern = `%${escapeLike(query.toLowerCase())}%`;
  const matchCondition = or(
    sql`lower(${table.title}) like ${pattern}`,
    sql`lower(${table.searchable_text}) like ${pattern}`
  ) as SQL;

  const conditions: SQL[] = [matchCondition];
  if (status && status !== 'all') {
    conditions.push(
      or(
        eq(table.entity_type, 'global'),
        eq(table.status, status),
        sql`${table.status} is null`
      ) as SQL
    );
  }
  const scopeClause = buildScopeFilterBuilder(table, scope);
  if (scopeClause) conditions.push(scopeClause);

  const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];

  const rows = await db
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
    .orderBy(
      sql`CASE WHEN lower(${table.title}) like ${pattern} THEN 0 ELSE 1 END`,
      desc(table.updated_at)
    );
  return rows.map(normalizeMatchRow);
}

function normalizeMatchRow(r: any): MatchRow {
  return {
    entity_type: r.entity_type,
    entity_name: r.entity_name,
    entity_id: r.entity_id,
    title: r.title ?? null,
    searchable_text: r.searchable_text ?? '',
    status: r.status ?? null,
    updated_at: r.updated_at instanceof Date ? r.updated_at : new Date(r.updated_at)
  };
}

function buildStatusFilterRaw(status: string): SQL | null {
  if (!status || status === 'all') return null;
  // Globals bypass status; collections must match (or have NULL status).
  return sql`(si.entity_type = 'global' OR si.status = ${status} OR si.status IS NULL)`;
}

function buildScopeFilterRaw(scope: SearchScope | undefined): SQL | null {
  const cs = scope?.collections ?? [];
  const gs = scope?.globals ?? [];
  if (cs.length === 0 && gs.length === 0) return null;
  const branches: SQL[] = [];
  if (cs.length) {
    branches.push(
      sql`(si.entity_type = 'collection' AND si.entity_name IN (${sql.join(
        cs.map((n) => sql`${n}`),
        sql`, `
      )}))`
    );
  }
  if (gs.length) {
    branches.push(
      sql`(si.entity_type = 'global' AND si.entity_name IN (${sql.join(
        gs.map((n) => sql`${n}`),
        sql`, `
      )}))`
    );
  }
  return branches.length > 1 ? sql`(${sql.join(branches, sql` OR `)})` : branches[0];
}

function buildScopeFilterBuilder(table: any, scope: SearchScope | undefined): SQL | null {
  const cs = scope?.collections ?? [];
  const gs = scope?.globals ?? [];
  if (cs.length === 0 && gs.length === 0) return null;
  const branches: SQL[] = [];
  if (cs.length) {
    branches.push(and(eq(table.entity_type, 'collection'), inArray(table.entity_name, cs)) as SQL);
  }
  if (gs.length) {
    branches.push(and(eq(table.entity_type, 'global'), inArray(table.entity_name, gs)) as SQL);
  }
  return branches.length > 1 ? (or(...branches) as SQL) : branches[0];
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
  const registry = (
    entityType === 'collection' ? collectionDefinitions : globalDefinitions
  ) as Record<string, any>;
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
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
