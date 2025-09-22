import { getCollectionItems } from '$sailor/utils/index';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
  // Example: Blog listing with pagination using new clean API
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = 10;

  // Get published posts with pagination using the new utility API
  const result = await getCollectionItems('posts', {
    status: 'published',
    includeBlocks: false, // Better performance for listing page
    limit,
    currentPage: page,
    orderBy: 'created_at',
    order: 'desc'
  });

  return {
    posts: result.items, // Items automatically include .url property
    pagination: result.pagination, // Pagination automatically included
    hasMore: result.hasMore,
    total: result.total
  };
};
