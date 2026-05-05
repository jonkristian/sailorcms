import type { LayoutServerLoad } from './$types';
import type { User } from '$sailor/generated/types';
import { db, users } from 'sailorcms/core/db/index.server';
import { eq } from 'drizzle-orm';

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

  // Better Auth's `getSession()` doesn't return columns it wasn't told about,
  // so even with `additionalFields: { preferences }` configured, sessions
  // already in flight might not include it until the user logs out / in.
  // Query the column directly here so date helpers downstream always see the
  // current value.
  let preferences: string | null = null;
  if (locals?.user?.id) {
    try {
      const row = await db.query.users.findFirst({
        where: eq(users.id, locals.user.id),
        columns: { preferences: true } as any
      });
      preferences = ((row as any)?.preferences as string | null | undefined) ?? null;
    } catch {
      // non-fatal — falls back to default locale
    }
  }

  return {
    user: locals?.user
      ? ({ ...(locals.user as object), preferences } as User & { preferences: string | null })
      : undefined,
    navData
  };
};
