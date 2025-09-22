import { db } from '$sailor/core/db/index.server';
import { handleApiRequest } from '$sailor/core/ui/api';
import { createACL } from '$sailor/core/auth/acl';

export async function GET({ locals }: { locals: App.Locals }) {
  return handleApiRequest(async () => {
    // User authentication validated by hooks

    const acl = createACL(locals.user);

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
    // For navigation, show collections if user has ANY collection view permission
    const collections = [];
    if (await acl.hasAnyPermission('collection', 'view')) {
      collections.push(...allCollections);
    }

    // Filter globals based on user's view permission
    const globals = [];
    if (await acl.hasAnyPermission('global', 'view')) {
      globals.push(...allGlobals);
    }

    // Check if user can view settings
    const canViewSettings = await acl.can('view', 'settings');

    return { collections, globals, canViewSettings };
  }, 'Failed to load navigation data');
}
