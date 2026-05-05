import { search } from 'sailorcms/utils/index';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
  const query = url.searchParams.get('q')?.trim() ?? '';
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);
  const limit = 10;

  if (!query) {
    return { query, results: null };
  }

  const results = await search(query, {
    limit,
    offset: (page - 1) * limit,
    currentPage: page,
    baseUrl: '/search',
    user: locals.user ?? null
  });

  return { query, results };
};
