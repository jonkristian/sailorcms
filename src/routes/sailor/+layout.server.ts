import type { LayoutServerLoad } from './$types';
import type { User } from '$sailor/generated/types';
import { db } from '$sailor/core/db/index.server';

export const load: LayoutServerLoad = async (event) => {
  const { locals } = event;

  let navData = {
    collections: [] as any[],
    globals: [] as any[],
    canViewSettings: false,
    canViewUsers: false,
    canViewFiles: false,
    canViewRecovery: false
  };

  try {
    const [
      allCollections,
      allGlobals,
      canReadContent,
      canViewSettings,
      canViewUsers,
      canViewFiles
    ] = await Promise.all([
      db.query.collectionTypes.findMany({
        orderBy: (collectionTypes: any, { desc }: any) => [desc(collectionTypes.updated_at)]
      }),
      db.query.globalTypes.findMany({
        orderBy: (globalTypes: any, { desc }: any) => [desc(globalTypes.updated_at)]
      }),
      locals.security.hasPermission('read', 'content'),
      locals.security.hasPermission('read', 'settings'),
      locals.security.hasPermission('read', 'users'),
      locals.security.hasPermission('read', 'files')
    ]);

    navData = {
      collections: canReadContent ? allCollections : [],
      globals: canReadContent ? allGlobals : [],
      canViewSettings,
      canViewUsers,
      canViewFiles,
      // Recovery is gated by content read — same baseline as the lists.
      canViewRecovery: canReadContent
    };
  } catch (error) {
    console.error('Error fetching navigation data:', error);
  }

  return {
    user: (locals?.user as User) || undefined,
    navData
  };
};
