import { getCollections } from 'sailorcms/utils/index';
import type { CollectionsMultipleResult } from 'sailorcms/utils/types';
import type { Page } from '$sailor/generated/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  // Get all published pages using the utility function
  const result = (await getCollections('pages', {
    includeBlocks: false, // Skip relations for performance
    status: 'published',
    orderBy: 'created_at',
    order: 'desc'
  })) as CollectionsMultipleResult<Page>;

  return {
    pages: result.items // Each page automatically includes .url property
  };
};
