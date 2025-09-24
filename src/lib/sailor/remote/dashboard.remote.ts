// SvelteKit remote functions for dashboard data
import { query, getRequestEvent } from '$app/server';
import { db } from '$sailor/core/db/index.server';
import * as schema from '$sailor/generated/schema';
import { desc, count, eq } from 'drizzle-orm';
import { SystemSettingsService } from '$sailor/core/services/system-settings.server';
import { createACL } from '$sailor/core/rbac/acl';
import { getDashboardActivityLink } from '$sailor/core/utils/routing';

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
    alt?: string;
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

/**
 * Get dashboard data including stats, recent files, activity, and site info
 */
export const getDashboardData = query(async (): Promise<DashboardData> => {
  const { locals } = getRequestEvent();
  const acl = createACL(locals.user);

  try {
    // Check permissions for different resources
    const canViewUsers = await acl.hasAnyPermission('user', 'view');
    const canViewSettings = await acl.hasAnyPermission('settings', 'view');
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
        const collectionTable = (schema as any)[`collection_${collection.slug}`];
        if (collectionTable) {
          const recentItems = await db
            .select({
              id: collectionTable.id,
              title: collectionTable.title,
              created_at: collectionTable.created_at,
              updated_at: collectionTable.updated_at,
              author: collectionTable.author,
              last_modified_by: collectionTable.last_modified_by
            })
            .from(collectionTable)
            .orderBy(desc(collectionTable.updated_at))
            .limit(3);

          for (const item of recentItems) {
            // Get user who most recently modified the item (prioritize last_modified_by over author)
            let user = { name: 'Unknown User', email: '', image: undefined };
            const userId = item.last_modified_by || item.author;
            if (userId) {
              const userRecord = await db
                .select({
                  name: schema.users.name,
                  email: schema.users.email,
                  image: schema.users.image
                })
                .from(schema.users)
                .where(eq(schema.users.id, userId))
                .limit(1);
              if (userRecord[0]) {
                user = {
                  name: userRecord[0].name || 'Unknown User',
                  email: userRecord[0].email,
                  image: userRecord[0].image
                };
              }
            }

            const isCreated =
              new Date(item.created_at).getTime() === new Date(item.updated_at).getTime();
            const action = isCreated ? ('created' as const) : ('updated' as const);
            const description = isCreated
              ? `Created ${collection.name_plural.slice(0, -1).toLowerCase()}`
              : item.last_modified_by
                ? `Edited ${collection.name_plural.slice(0, -1).toLowerCase()}`
                : `Updated ${collection.name_plural.slice(0, -1).toLowerCase()}`;

            recentActivity.push({
              id: `${collection.slug}-${item.id}`,
              type: 'content' as const,
              action,
              title: item.title || 'Untitled',
              description,
              timestamp: new Date(item.updated_at),
              contentType: collection.name_plural.toLowerCase(),
              link: getDashboardActivityLink('collection', { slug: collection.slug }, item.id),
              user
            });
          }
        }
      } catch (error) {
        // Skip collections that don't have content tables yet
        continue;
      }
    }

    // Get recent content from global tables (all global types)
    for (const global of globalsForActivity) {
      try {
        if (global.data_type === 'flat') {
          // Flat globals: single record per global, link to /sailor/globals/{slug}
          const globalTable = (schema as any)[`global_${global.slug}`];
          if (globalTable) {
            const recentItems = await db
              .select({
                id: globalTable.id,
                created_at: globalTable.created_at,
                updated_at: globalTable.updated_at,
                author: globalTable.author,
                last_modified_by: globalTable.last_modified_by
              })
              .from(globalTable)
              .orderBy(desc(globalTable.updated_at))
              .limit(1); // Only one record for flat globals

            for (const item of recentItems) {
              // Get user who most recently modified the item
              let user = { name: 'Unknown User', email: '', image: undefined };
              const userId = item.last_modified_by || item.author;
              if (userId) {
                const userRecord = await db
                  .select({
                    name: schema.users.name,
                    email: schema.users.email,
                    image: schema.users.image
                  })
                  .from(schema.users)
                  .where(eq(schema.users.id, userId))
                  .limit(1);
                if (userRecord[0]) {
                  user = {
                    name: userRecord[0].name || 'Unknown User',
                    email: userRecord[0].email,
                    image: userRecord[0].image
                  };
                }
              }

              const isCreated =
                new Date(item.created_at).getTime() === new Date(item.updated_at).getTime();
              const action = isCreated ? ('created' as const) : ('updated' as const);
              const description = isCreated
                ? `Created ${global.name_singular.toLowerCase()}`
                : item.last_modified_by
                  ? `Edited ${global.name_singular.toLowerCase()}`
                  : `Updated ${global.name_singular.toLowerCase()}`;

              recentActivity.push({
                id: `${global.slug}-flat`,
                type: 'content' as const,
                action,
                title: global.name_singular, // Use global name for flat globals
                description,
                timestamp: new Date(item.updated_at),
                contentType: global.name_singular.toLowerCase(),
                link: getDashboardActivityLink('global', { slug: global.slug, data_type: 'flat' }),
                user
              });
            }
          }
        } else {
          // Regular globals: multiple records, link to /sailor/globals/{slug}/{id}
          const globalTable = (schema as any)[`global_${global.slug}`];
          if (globalTable) {
            const recentItems = await db
              .select({
                id: globalTable.id,
                title: globalTable.title,
                created_at: globalTable.created_at,
                updated_at: globalTable.updated_at,
                author: globalTable.author,
                last_modified_by: globalTable.last_modified_by
              })
              .from(globalTable)
              .orderBy(desc(globalTable.updated_at))
              .limit(2);

            for (const item of recentItems) {
              // Get user who most recently modified the item
              let user = { name: 'Unknown User', email: '', image: undefined };
              const userId = item.last_modified_by || item.author;
              if (userId) {
                const userRecord = await db
                  .select({
                    name: schema.users.name,
                    email: schema.users.email,
                    image: schema.users.image
                  })
                  .from(schema.users)
                  .where(eq(schema.users.id, userId))
                  .limit(1);
                if (userRecord[0]) {
                  user = {
                    name: userRecord[0].name || 'Unknown User',
                    email: userRecord[0].email,
                    image: userRecord[0].image
                  };
                }
              }

              const isCreated =
                new Date(item.created_at).getTime() === new Date(item.updated_at).getTime();
              const action = isCreated ? ('created' as const) : ('updated' as const);
              const description = isCreated
                ? `Created ${global.name_plural.slice(0, -1).toLowerCase()}`
                : item.last_modified_by
                  ? `Edited ${global.name_plural.slice(0, -1).toLowerCase()}`
                  : `Updated ${global.name_plural.slice(0, -1).toLowerCase()}`;

              recentActivity.push({
                id: `${global.slug}-${item.id}`,
                type: 'content' as const,
                action,
                title: item.title || 'Untitled',
                description,
                timestamp: new Date(item.updated_at),
                contentType: global.name_plural.toLowerCase(),
                link: getDashboardActivityLink('global', {
                  slug: global.slug,
                  data_type: 'repeatable'
                }),
                user
              });
            }
          }
        }
      } catch (error) {
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
