import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { SearchIndexService } from 'sailorcms/core/services/search-index.server';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) throw error(401, 'Unauthorized');
  if (!(await locals.security.hasPermission('read', 'settings'))) {
    throw error(403, 'Forbidden');
  }

  try {
    const health = await SearchIndexService.getHealth();
    return { health };
  } catch (err) {
    return {
      health: null,
      error: err instanceof Error ? err.message : 'Failed to load search index health'
    };
  }
};
