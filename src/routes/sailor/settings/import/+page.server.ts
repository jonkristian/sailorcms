// No SvelteKit imports needed for this load function
import { db } from '$sailor/core/db/index.server';
import type { PageServerLoad } from './$types';
import type { CollectionType } from '$sailor/generated/types';

export const load: PageServerLoad = async () => {
  // Authentication and admin authorization handled by hooks

  // Load collections for the import interface
  const collections = await db.query.collectionTypes.findMany({
    orderBy: (ct: any, { desc }: any) => [desc(ct.updated_at)]
  });

  // Map collections to the format expected by the frontend
  const availableCollections = collections.map((collection: CollectionType) => ({
    slug: collection.slug,
    name: collection.name_plural,
    description: collection.description
  }));

  return {
    collections: availableCollections
  };
};
