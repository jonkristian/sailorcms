import { getCollections } from '$sailor/utils/index';
import type { CollectionsMultipleResult } from '$sailor/utils/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
  // Example: Blog listing with pagination using new clean API
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = 10;
  const offset = (page - 1) * limit;

  // Get published posts with pagination using the new utility API
  const result = (await getCollections('posts', {
    status: 'published',
    includeBlocks: false, // Better performance for listing page
    limit,
    offset,
    orderBy: 'created_at',
    order: 'desc',
    baseUrl: '/blog',
    currentPage: page
  })) as CollectionsMultipleResult;

  return {
    posts: result.items, // Items automatically include .url property
    hasMore: result.hasMore,
    total: result.total,
    pagination: result.pagination
  };
};
