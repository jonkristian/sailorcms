// No SvelteKit imports needed for this load function
import type { PageServerLoad } from './$types';
import type { CollectionDefinition } from '$sailor/generated/types';
import { fieldConfigurations } from '$sailor/generated/fields';

export const load: PageServerLoad = async () => {
  // Authentication and admin authorization handled by hooks

  // Map collections from field configurations to the format expected by the frontend
  const availableCollections = Object.entries(fieldConfigurations.collections).map(([slug, config]) => ({
    slug,
    name: config.name.plural,
    description: config.description
  }));

  return {
    collections: availableCollections
  };
};
