// SvelteKit remote functions for navigation data
import { query, getRequestEvent } from '$app/server';
import { db } from '$sailor/core/db/index.server';

interface NavigationData {
  collections: Array<{
    id: string;
    slug: string;
    name_singular: string;
    name_plural: string;
    description?: string;
    updated_at: Date;
  }>;
  globals: Array<{
    id: string;
    slug: string;
    name_singular: string;
    name_plural: string;
    description?: string;
    data_type: string;
    updated_at: Date;
  }>;
  canViewSettings: boolean;
  canViewUsers: boolean;
  canViewFiles: boolean;
}

/**
 * Get navigation data including collections, globals, and user permissions
 */
export const getNavigationData = query(async (): Promise<NavigationData> => {
  const { locals } = getRequestEvent();

  try {
    // Get collections and globals for the sidebar in parallel
    const [allCollections, allGlobals] = await Promise.all([
      db.query.collectionTypes.findMany({
        orderBy: (collectionTypes: any, { desc }: any) => [desc(collectionTypes.updated_at)]
      }),
      db.query.globalTypes.findMany({
        orderBy: (globalTypes: any, { desc }: any) => [desc(globalTypes.updated_at)]
      })
    ]);

    // Filter collections based on user's view permission
    const collections = [];
    if (await locals.security.hasPermission('read', 'content')) {
      collections.push(...allCollections);
    }

    // Filter globals based on user's view permission
    const globals = [];
    if (await locals.security.hasPermission('read', 'content')) {
      globals.push(...allGlobals);
    }

    // Check if user can view settings, users, and files
    const [canViewSettings, canViewUsers, canViewFiles] = await Promise.all([
      locals.security.hasPermission('read', 'settings'),
      locals.security.hasPermission('read', 'users'),
      locals.security.hasPermission('read', 'files')
    ]);

    return {
      collections,
      globals,
      canViewSettings,
      canViewUsers,
      canViewFiles
    };
  } catch (error) {
    console.error('Error fetching navigation data:', error);

    // Return fallback data
    return {
      collections: [],
      globals: [],
      canViewSettings: false,
      canViewUsers: false,
      canViewFiles: false
    };
  }
});