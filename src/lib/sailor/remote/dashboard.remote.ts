// SvelteKit remote functions for dashboard data
import { query, getRequestEvent } from '$app/server';
import { db } from 'sailorcms/core/db/index.server';
import * as schema from '$sailor/generated/schema';
import { desc, count, eq, sql } from 'drizzle-orm';
import { SystemSettingsService } from 'sailorcms/core/services/settings.server';
import { getDashboardActivityLink } from 'sailorcms/core/utils/routing';
import { entityLabelJoin } from 'sailorcms/utils/data/entity-label.server';

interface DashboardStats {
  collections: number;
  globals: number;
  users: number;
  files: number;
}

interface DashboardData {
  stats: DashboardStats;
  recentFiles: Array<{
    id: string;
    name: string;
    mime_type: string;
    size: number;
    path: string;
    url: string;
    alt: string | null;
    title: string | null;
    description: string | null;
    created_at: Date;
    updated_at: Date;
  }>;
  recentUsers: Array<{
    id: string;
    name?: string;
    email: string;
    image?: string;
    role: 'admin' | 'editor' | 'viewer';
    created_at: Date;
    updated_at: Date;
  }>;
  recentActivity: Array<{
    id: string;
    type: 'content' | 'user' | 'settings';
    action: 'created' | 'updated' | 'deleted' | 'published' | 'viewed';
    title: string;
    description?: string;
    user: {
      name: string;
      email: string;
      image?: string;
    };
    timestamp: Date;
    contentType?: string;
    link?: string;
  }>;
  siteInfo: {
    name?: string;
    url?: string;
    description?: string;
  };
}

interface RecentEntityRow {
  id: string;
  title: string | null;
  created_at: Date;
  updated_at: Date;
  last_modified_by: string | null;
  modifier_name: string | null;
  modifier_email: string | null;
  modifier_image: string | null;
}

/**
 * Read the most recently touched rows of a collection/global with the
 * effective title, timestamps, and the user who last modified it (joined
 * in-query, not via N+1 lookups). Localized entities resolve title /
 * updated_at / last_modified_by from the default-locale `_locales` row when
 * present — see `entityLabelJoin` for the rule.
 */
async function readRecentEntityRows(
  kind: 'collection' | 'global',
  slug: string,
  limit: number
): Promise<RecentEntityRow[]> {
  const j = entityLabelJoin(kind, slug);
  if (!j.table) return [];

  const modifierId = sql<
    string | null
  >`COALESCE(${j.last_modified_by}, ${j.table.author ?? sql`NULL`})`;

  let q = db
    .select({
      id: j.table.id,
      title: j.title,
      created_at: j.table.created_at,
      updated_at: j.updated_at,
      last_modified_by: j.last_modified_by,
      modifier_name: schema.users.name,
      modifier_email: schema.users.email,
      modifier_image: schema.users.image
    })
    .from(j.table)
    .$dynamic();

  if (j.localesTable && j.joinCondition) {
    q = q.leftJoin(j.localesTable, j.joinCondition);
  }

  return (await q
    .leftJoin(schema.users, eq(schema.users.id, modifierId))
    .orderBy(desc(j.updated_at))
    .limit(limit)) as unknown as RecentEntityRow[];
}

interface BuildActivityOptions {
  idPrefix: string;
  entityLabel: string;
  contentTypeLabel: string;
  link: string;
  /** When false the entry id is just `idPrefix` (used for flat globals). */
  useIdInPrefix?: boolean;
}

/**
 * Drizzle decodes `integer('x', { mode: 'timestamp' })` to a Date when the
 * column is referenced directly, but a `COALESCE(...)` wrapping returns the
 * raw stored value (seconds since epoch). The localized branch of
 * `entityLabelJoin` uses COALESCE, so consumers can receive either shape.
 * Normalize both forms back to a Date.
 */
function toDate(value: Date | number | string | null | undefined): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') {
    // SQLite + drizzle timestamp mode stores seconds; anything beneath
    // ~year 5138 in seconds is below the millisecond threshold.
    return new Date(value < 1e11 ? value * 1000 : value);
  }
  return new Date(value);
}

function buildActivityEntry(
  item: RecentEntityRow,
  opts: BuildActivityOptions
): {
  id: string;
  type: 'content';
  action: 'created' | 'updated';
  title: string;
  descriptionKey: 'created' | 'edited' | 'updated';
  entity: string;
  timestamp: Date;
  contentType: string;
  link: string;
  user: { name: string; email: string; image: string | undefined };
} {
  const created = toDate(item.created_at);
  const updated = toDate(item.updated_at);
  const isCreated = created && updated ? created.getTime() === updated.getTime() : false;
  const action = isCreated ? ('created' as const) : ('updated' as const);
  const descriptionKey = isCreated
    ? ('created' as const)
    : item.last_modified_by
      ? ('edited' as const)
      : ('updated' as const);

  return {
    id: opts.useIdInPrefix === false ? opts.idPrefix : `${opts.idPrefix}-${item.id}`,
    type: 'content',
    action,
    title: item.title || 'Untitled',
    descriptionKey,
    entity: opts.entityLabel,
    timestamp: updated ?? created ?? new Date(0),
    contentType: opts.contentTypeLabel,
    link: opts.link,
    user: {
      name: item.modifier_name || 'Unknown User',
      email: item.modifier_email || '',
      image: item.modifier_image ?? undefined
    }
  };
}

/**
 * Get dashboard data including stats, recent files, activity, and site info
 */
export const getDashboardData = query(async (): Promise<DashboardData> => {
  const { locals } = getRequestEvent();
  try {
    // Check permissions for different resources
    const canViewUsers = await locals.security.hasPermission('read', 'users');
    const canViewSettings = await locals.security.hasPermission('read', 'settings');
    // Build queries based on permissions
    const queries = [
      // Stats queries (always show collections and globals)
      db
        .select({ count: count() })
        .from(schema.collectionTypes)
        .then((r: any) => r[0]?.count || 0),
      db
        .select({ count: count() })
        .from(schema.globalTypes)
        .then((r: any) => r[0]?.count || 0),
      // Only show user count if user can view users
      canViewUsers
        ? db
            .select({ count: count() })
            .from(schema.users)
            .then((r: any) => r[0]?.count || 0)
        : Promise.resolve(0),
      // Files count (most users can see this)
      db
        .select({ count: count() })
        .from(schema.files)
        .then((r: any) => r[0]?.count || 0),

      // Recent files
      db
        .select({
          id: schema.files.id,
          name: schema.files.name,
          mime_type: schema.files.mime_type,
          size: schema.files.size,
          path: schema.files.path,
          url: schema.files.url,
          alt: schema.files.alt,
          // The dashboard opens the same edit modal as the media library, and
          // that modal writes back every field it holds. Omitting these would
          // load them as empty and blank them on the first save.
          title: schema.files.title,
          description: schema.files.description,
          created_at: schema.files.created_at,
          updated_at: schema.files.updated_at
        })
        .from(schema.files)
        .orderBy(desc(schema.files.created_at))
        .limit(8),

      // Recent users (only if user can view users)
      canViewUsers
        ? db
            .select({
              id: schema.users.id,
              name: schema.users.name,
              email: schema.users.email,
              image: schema.users.image,
              role: schema.users.role,
              created_at: schema.users.created_at,
              updated_at: schema.users.updated_at
            })
            .from(schema.users)
            .orderBy(desc(schema.users.created_at))
            .limit(4)
        : Promise.resolve([]),

      // Get collection types for building activity queries
      db
        .select({
          id: schema.collectionTypes.id,
          name_singular: schema.collectionTypes.name_singular,
          name_plural: schema.collectionTypes.name_plural,
          slug: schema.collectionTypes.slug
        })
        .from(schema.collectionTypes)
        .limit(10),

      // Get global types for building activity queries
      db
        .select({
          id: schema.globalTypes.id,
          name_singular: schema.globalTypes.name_singular,
          name_plural: schema.globalTypes.name_plural,
          slug: schema.globalTypes.slug,
          data_type: schema.globalTypes.data_type
        })
        .from(schema.globalTypes)
        .limit(5),

      // Site settings (public info - always available)
      Promise.all([
        SystemSettingsService.getSetting('site.name'),
        SystemSettingsService.getSetting('site.url'),
        SystemSettingsService.getSetting('site.description')
      ])
    ];

    const [
      collectionsCount,
      globalsCount,
      usersCount,
      filesCount,
      recentFiles,
      recentUsers,
      collectionsForActivity,
      globalsForActivity,
      siteSettings
    ] = await Promise.all(queries);

    // Build stats
    const stats: DashboardStats = {
      collections: collectionsCount,
      globals: globalsCount,
      users: usersCount,
      files: filesCount
    };

    // Build recent activity from actual content changes
    const recentActivity = [];

    // Get recent content from collection tables
    for (const collection of collectionsForActivity) {
      try {
        const items = await readRecentEntityRows('collection', collection.slug, 3);
        for (const item of items) {
          recentActivity.push(
            buildActivityEntry(item, {
              idPrefix: collection.slug,
              entityLabel: collection.name_singular.toLowerCase(),
              contentTypeLabel: collection.name_plural.toLowerCase(),
              link: getDashboardActivityLink('collection', { slug: collection.slug }, item.id)
            })
          );
        }
      } catch {
        // Skip collections that don't have content tables yet
        continue;
      }
    }

    // Get recent content from global tables (all global types)
    for (const global of globalsForActivity) {
      try {
        if (global.data_type === 'flat') {
          // Flat globals: single record per global, link to /sailor/globals/{slug}.
          // Flat globals have no `title` column — substitute the global name.
          const items = await readRecentEntityRows('global', global.slug, 1);
          for (const item of items) {
            recentActivity.push(
              buildActivityEntry(
                { ...item, title: global.name_singular },
                {
                  idPrefix: `${global.slug}-flat`,
                  useIdInPrefix: false,
                  entityLabel: global.name_singular.toLowerCase(),
                  contentTypeLabel: global.name_singular.toLowerCase(),
                  link: getDashboardActivityLink('global', { slug: global.slug, data_type: 'flat' })
                }
              )
            );
          }
        } else {
          // Repeatable globals: multiple records, link to /sailor/globals/{slug}/{id}
          const items = await readRecentEntityRows('global', global.slug, 2);
          for (const item of items) {
            recentActivity.push(
              buildActivityEntry(item, {
                idPrefix: global.slug,
                entityLabel: global.name_singular.toLowerCase(),
                contentTypeLabel: global.name_plural.toLowerCase(),
                link: getDashboardActivityLink('global', {
                  slug: global.slug,
                  data_type: 'repeatable'
                })
              })
            );
          }
        }
      } catch {
        // Skip globals that don't have content tables yet
        continue;
      }
    }

    // Sort activities by timestamp (most recent first)
    recentActivity.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // Build site info
    const [siteName, siteUrl, siteDescription] = siteSettings;
    const siteInfo = {
      name: siteName || undefined,
      url: siteUrl || undefined,
      description: siteDescription || undefined
    };

    return {
      stats,
      recentFiles: recentFiles.map((file: any) => ({
        ...file,
        created_at: new Date(file.created_at),
        updated_at: new Date(file.updated_at)
      })),
      recentUsers: recentUsers.map((user: any) => ({
        ...user,
        role: user.role || 'viewer', // Default to 'viewer' if no role is set
        created_at: new Date(user.created_at),
        updated_at: new Date(user.updated_at)
      })),
      recentActivity: recentActivity.slice(0, 10),
      siteInfo
    };
  } catch (error) {
    console.error('Error fetching dashboard data:', error);

    // Return fallback data
    return {
      stats: {
        collections: 0,
        globals: 0,
        users: 0,
        files: 0
      },
      recentFiles: [],
      recentUsers: [],
      recentActivity: [],
      siteInfo: {}
    };
  }
});
