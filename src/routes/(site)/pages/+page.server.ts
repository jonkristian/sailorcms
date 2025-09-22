import { getCollectionItems } from '$sailor/utils/index';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  // Get all published pages using the utility function
  const result = await getCollectionItems('pages', {
    includeBlocks: false, // Skip relations for performance
    status: 'published',
    orderBy: 'created_at',
    order: 'desc'
  });

  return {
    pages: result.items // Each page automatically includes .url property
  };
};
