import { query, getRequestEvent } from '$app/server';
import { db } from 'sailorcms/core/db/index.server';
import * as schema from '$sailor/generated/schema';
import { sql, or, and, desc, asc, isNull, type SQL } from 'drizzle-orm';
import { collectionDefinitions } from '$sailor/templates/collections';
import { globalDefinitions } from '$sailor/templates/globals';
import { ensureFtsReady } from 'sailorcms/core/services/search-index.server';
import { getCollectionUrl, getGlobalUrl } from 'sailorcms/core/utils/routing';
import { m, locales, type Locale } from '$sailor/i18n';

// paraglide message functions are typed per-message; the haystack just
// needs a uniform signature to hold an array of mixed message functions.
// `Locale` (the union of available locales) is required for assignability
// against paraglide's typed `options.locale`.
type MessageFn = (inputs?: object, options?: { locale?: Locale }) => string;

/**
 * Admin-side omnibar search. Ranges over the full search index (no
 * `options.searchable` filter), includes drafts, and gates each entity
 * type by the caller's RBAC. Files and users are queried directly via
 * LIKE — they don't live in the FTS index but are small enough that
 * a single LIKE scan per request is fine. Destinations are a static,
 * permission-filtered admin route list with substring matching.
 */

export type AdminSearchGroup = 'content' | 'files' | 'users' | 'destinations';

export interface AdminSearchHit {
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  group: AdminSearchGroup;
}

export interface AdminSearchResult {
  content: AdminSearchHit[];
  files: AdminSearchHit[];
  users: AdminSearchHit[];
  destinations: AdminSearchHit[];
  total: number;
}

const PER_GROUP_LIMIT = 5;
// Destinations are a small, bounded, in-memory list — capping them at the
// same number as the variable-size groups (content/files/users) clips real
// hits when the query matches a parent name and surfaces all its children.
const DEST_LIMIT = 20;

export const adminSearch = query(
  'unchecked',
  async ({ q }: { q: string }): Promise<AdminSearchResult> => {
    const { locals } = getRequestEvent();
    const trimmed = (q ?? '').trim();
    const empty: AdminSearchResult = {
      content: [],
      files: [],
      users: [],
      destinations: [],
      total: 0
    };
    if (!trimmed || !locals.user) return empty;

    const [canContent, canFiles, canUsers, canSettings] = await Promise.all([
      locals.security.hasPermission('read', 'content'),
      locals.security.hasPermission('read', 'files'),
      locals.security.hasPermission('read', 'users'),
      locals.security.hasPermission('read', 'settings')
    ]);

    const [content, files, users] = await Promise.all([
      canContent ? searchContent(trimmed) : Promise.resolve<AdminSearchHit[]>([]),
      canFiles ? searchFiles(trimmed) : Promise.resolve<AdminSearchHit[]>([]),
      canUsers ? searchUsers(trimmed) : Promise.resolve<AdminSearchHit[]>([])
    ]);

    const destinations = matchDestinations(trimmed, {
      canFiles,
      canUsers,
      canSettings,
      canRecovery: canContent
    });

    return {
      content,
      files,
      users,
      destinations,
      total: content.length + files.length + users.length + destinations.length
    };
  }
);

// --- content -----------------------------------------------------------

async function searchContent(q: string): Promise<AdminSearchHit[]> {
  const table = (schema as any).searchIndex;
  if (!table) return [];

  const ftsOk = await ensureFtsReady();
  const ftsQuery = ftsOk ? toFtsQuery(q) : '';

  let rows: any[] = [];

  if (ftsQuery) {
    try {
      // We over-fetch (multiplied by locales) and dedupe below, so localized
      // collections still produce PER_GROUP_LIMIT distinct items in the result.
      rows = (await db.all(sql`
        SELECT si.entity_type AS entity_type,
               si.entity_name AS entity_name,
               si.entity_id   AS entity_id,
               si.locale      AS locale,
               si.title       AS title,
               si.updated_at  AS updated_at,
               bm25(search_index_fts, 5.0, 1.0) AS rank
        FROM search_index si
        JOIN search_index_fts ON
          search_index_fts.entity_type = si.entity_type
          AND search_index_fts.entity_name = si.entity_name
          AND search_index_fts.entity_id = si.entity_id
          AND (
            search_index_fts.locale = si.locale
            OR (search_index_fts.locale IS NULL AND si.locale IS NULL)
          )
        WHERE search_index_fts MATCH ${ftsQuery}
        ORDER BY rank ASC, si.updated_at DESC
        LIMIT ${PER_GROUP_LIMIT * 4}
      `)) as any[];
    } catch (err) {
      console.warn('adminSearch: FTS query failed', err);
    }
  }

  if (rows.length === 0) {
    const pattern = `%${escapeLike(q.toLowerCase())}%`;
    rows = await db
      .select({
        entity_type: table.entity_type,
        entity_name: table.entity_name,
        entity_id: table.entity_id,
        locale: table.locale,
        title: table.title,
        updated_at: table.updated_at
      })
      .from(table)
      .where(
        or(
          sql`lower(${table.title}) like ${pattern}`,
          sql`lower(${table.searchable_text}) like ${pattern}`
        ) as SQL
      )
      .orderBy(desc(table.updated_at))
      .limit(PER_GROUP_LIMIT * 4);
  }

  // Dedupe per item: a translated post has one row per locale on search_index,
  // but admin search should show one hit per item. Keep the first match (=
  // best ranked from FTS, or most recently updated from LIKE) — that locale's
  // title is what the editor sees. The admin can then click through and use
  // the locale switcher on the edit page to find a different translation.
  const seen = new Set<string>();
  const deduped: any[] = [];
  for (const r of rows) {
    const key = `${r.entity_type}:${r.entity_name}:${r.entity_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(r);
    if (deduped.length >= PER_GROUP_LIMIT) break;
  }

  return deduped.map((r: any) => contentRowToHit(r)).filter((h): h is AdminSearchHit => h !== null);
}

function contentRowToHit(r: {
  entity_type: string;
  entity_name: string;
  entity_id: string;
  title: string | null;
}): AdminSearchHit | null {
  if (r.entity_type === 'collection') {
    const def = (collectionDefinitions as Record<string, any>)[r.entity_name];
    if (!def) return null;
    return {
      id: `collection:${r.entity_name}:${r.entity_id}`,
      title: r.title || '(untitled)',
      subtitle: def.name?.singular ?? r.entity_name,
      href: getCollectionUrl({ slug: r.entity_name }, r.entity_id),
      group: 'content'
    };
  }
  if (r.entity_type === 'global') {
    const def = (globalDefinitions as Record<string, any>)[r.entity_name];
    if (!def) return null;
    return {
      id: `global:${r.entity_name}:${r.entity_id}`,
      title: r.title || def.name?.singular || r.entity_name,
      subtitle: def.name?.singular ?? r.entity_name,
      // Routing helper expects `data_type` (snake_case); template uses `dataType`.
      href: getGlobalUrl({ slug: r.entity_name, data_type: def.dataType }, r.entity_id),
      group: 'content'
    };
  }
  return null;
}

// --- files -------------------------------------------------------------

async function searchFiles(q: string): Promise<AdminSearchHit[]> {
  const pattern = `%${escapeLike(q.toLowerCase())}%`;
  const rows = await db
    .select({
      id: schema.files.id,
      name: schema.files.name,
      alt: schema.files.alt,
      title: schema.files.title,
      mime_type: schema.files.mime_type
    })
    .from(schema.files)
    .where(
      and(
        isNull(schema.files.deleted_at),
        or(
          sql`lower(${schema.files.name}) like ${pattern}`,
          sql`lower(${schema.files.alt}) like ${pattern}`,
          sql`lower(${schema.files.title}) like ${pattern}`,
          sql`lower(${schema.files.description}) like ${pattern}`
        ) as SQL
      ) as SQL
    )
    .orderBy(desc(schema.files.updated_at))
    .limit(PER_GROUP_LIMIT);

  type FileRow = (typeof rows)[number];
  return rows.map((r: FileRow) => ({
    id: `file:${r.id}`,
    title: r.title || r.name,
    subtitle: r.mime_type,
    // `focus=<id>` is handled by media/+page.svelte to auto-open the
    // file edit dialog. Wired alongside the omnibar UI.
    href: `/sailor/media?focus=${r.id}`,
    group: 'files' as const
  }));
}

// --- users -------------------------------------------------------------

async function searchUsers(q: string): Promise<AdminSearchHit[]> {
  const pattern = `%${escapeLike(q.toLowerCase())}%`;
  const rows = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email
    })
    .from(schema.users)
    .where(
      or(
        sql`lower(${schema.users.name}) like ${pattern}`,
        sql`lower(${schema.users.email}) like ${pattern}`
      ) as SQL
    )
    .orderBy(asc(schema.users.name))
    .limit(PER_GROUP_LIMIT);

  type UserRow = (typeof rows)[number];
  return rows.map((r: UserRow) => ({
    id: `user:${r.id}`,
    title: r.name || r.email,
    subtitle: r.name ? r.email : undefined,
    href: `/sailor/users/${r.id}`,
    group: 'users' as const
  }));
}

// --- destinations ------------------------------------------------------

/**
 * Each destination holds *references* to its paraglide message functions,
 * not pre-resolved strings. We call them with the active locale for display
 * (title, breadcrumb parent) and with every locale for the search haystack —
 * so an English admin can type `epost` and still hit Mail, and a Norwegian
 * admin can type `mail` regardless of the active label.
 */
interface Destination {
  /** Main label — resolved via active locale to title the hit. */
  label: MessageFn;
  /** Optional breadcrumb parent — resolved via active locale to render dimmed before the title. */
  parent?: MessageFn;
  /** Extra context (description, aliases) folded into the haystack across all locales. */
  extras?: MessageFn[];
  href: string;
  visible: boolean;
}

function matchDestinations(
  q: string,
  flags: {
    canFiles: boolean;
    canUsers: boolean;
    canSettings: boolean;
    canRecovery: boolean;
  }
): AdminSearchHit[] {
  const all: Destination[] = [
    {
      label: m.nav_dashboard,
      extras: [m.nav_dashboard_aliases],
      href: '/sailor',
      visible: true
    },
    {
      label: m.nav_user_account,
      extras: [m.nav_user_account_aliases],
      href: '/sailor/account',
      visible: true
    },
    {
      label: m.nav_media_library,
      extras: [m.nav_media_library_aliases],
      href: '/sailor/media',
      visible: flags.canFiles
    },
    {
      label: m.nav_users,
      extras: [m.nav_users_aliases],
      href: '/sailor/users',
      visible: flags.canUsers
    },
    {
      label: m.nav_recovery,
      extras: [m.nav_recovery_aliases],
      href: '/sailor/recovery',
      visible: flags.canRecovery
    },
    {
      label: m.nav_settings,
      extras: [m.nav_settings_aliases],
      href: '/sailor/settings',
      visible: flags.canSettings
    },
    {
      label: m.settings_nav_mail_label,
      parent: m.nav_settings,
      extras: [m.settings_nav_mail_description, m.settings_nav_mail_aliases],
      href: '/sailor/settings/mail',
      visible: flags.canSettings
    },
    {
      label: m.settings_nav_roles_label,
      parent: m.nav_settings,
      extras: [m.settings_nav_roles_description, m.settings_nav_roles_aliases],
      href: '/sailor/settings/roles',
      visible: flags.canSettings
    },
    {
      label: m.settings_nav_storage_label,
      parent: m.nav_settings,
      extras: [m.settings_nav_storage_description, m.settings_nav_storage_aliases],
      href: '/sailor/settings/storage',
      visible: flags.canSettings
    },
    {
      label: m.settings_nav_tags_label,
      parent: m.nav_settings,
      extras: [m.settings_nav_tags_description, m.settings_nav_tags_aliases],
      href: '/sailor/settings/tags',
      visible: flags.canSettings
    },
    {
      label: m.settings_nav_database_label,
      parent: m.nav_settings,
      extras: [m.settings_nav_database_description, m.settings_nav_database_aliases],
      href: '/sailor/settings/database',
      visible: flags.canSettings
    },
    {
      label: m.settings_nav_import_label,
      parent: m.nav_settings,
      extras: [m.settings_nav_import_description, m.settings_nav_import_aliases],
      href: '/sailor/settings/import',
      visible: flags.canSettings
    },
    {
      label: m.nav_get_help,
      extras: [m.nav_get_help_aliases],
      href: '/sailor/help',
      visible: true
    }
  ];

  const tokens = normalize(q).split(' ').filter(Boolean);
  if (tokens.length === 0) return [];
  return all
    .filter((d) => d.visible && tokens.every((tok) => destHaystack(d).includes(tok)))
    .slice(0, DEST_LIMIT)
    .map((d) => ({
      id: `dest:${d.href}`,
      title: d.label(),
      subtitle: d.parent?.(),
      href: d.href,
      group: 'destinations' as const
    }));
}

// --- helpers -----------------------------------------------------------

function toFtsQuery(input: string): string {
  const tokens = input
    .split(/\s+/)
    .map((t) => t.replace(/["*()]/g, ''))
    .filter(Boolean);
  return tokens.join(' ');
}

function escapeLike(s: string): string {
  return s.replace(/[%_]/g, '');
}

/**
 * Lowercase, strip combining diacritics (NFD then drop the marks), and
 * collapse anything non-alphanumeric to single spaces so substring matching
 * is insensitive to hyphens, slashes, dots, and accents. "E-post" → "e post",
 * "Brúker" → "bruker", "Settings / Mail" → "settings mail".
 */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD') // decompose accents so `\p{M}` can strip them
    .replace(/\p{M}/gu, '') // strip combining diacritics after NFD
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim();
}

/**
 * Per-destination match corpus, computed across every available locale —
 * so an English admin can type `epost` and a Norwegian admin can type
 * `mail` regardless of which locale is active for display. Commas in alias
 * strings ("e-post,epost,utboks") become spaces before normalization so
 * each synonym becomes its own token.
 */
function destHaystack(d: Destination): string {
  const sources: MessageFn[] = [d.label, ...(d.parent ? [d.parent] : []), ...(d.extras ?? [])];
  const parts: string[] = [];
  for (const fn of sources) {
    for (const locale of locales) {
      try {
        const v = fn({}, { locale });
        if (v) parts.push(v.replace(/,/g, ' '));
      } catch {
        // ignore — a missing key in one locale shouldn't drop the destination
      }
    }
  }
  return normalize(parts.join(' '));
}
