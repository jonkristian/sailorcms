import type { PageServerLoad } from './$types';
import { TagService } from 'sailorcms/core/services/tag.server';
import { log } from 'sailorcms/core/utils/logger';
import type { Pagination } from 'sailorcms/core/types';

export const load: PageServerLoad = async ({ url }) => {
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const pageSize = Math.max(1, Math.min(100, parseInt(url.searchParams.get('pageSize') || '20')));
  const searchQuery = url.searchParams.get('search')?.trim() || '';

  try {
    // Use service directly in load function since remote functions can't be called during SSR.
    // Stats stay site-wide (independent of search) so the cards keep showing total truth.
    const [{ tags, totalItems }, stats] = await Promise.all([
      TagService.getAllTagsWithUsagePaginated(page, pageSize, searchQuery),
      TagService.getTagStats()
    ]);
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const validPage = totalPages > 0 ? Math.min(page, totalPages) : 1;

    return {
      tags,
      stats,
      searchQuery,
      pagination: {
        page: validPage,
        pageSize,
        totalItems,
        totalPages,
        hasNextPage: validPage < totalPages,
        hasPreviousPage: validPage > 1
      } as Pagination
    };
  } catch (error) {
    log.error('Failed to load tags', {}, error as Error);
    return {
      tags: [],
      stats: { total: 0, inUse: 0, unused: 0 },
      searchQuery: '',
      pagination: null as Pagination | null
    };
  }
};
