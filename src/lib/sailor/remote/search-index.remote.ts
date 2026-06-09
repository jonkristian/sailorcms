// Admin endpoints for the /sailor/settings/search health view. Returns the
// operational snapshot (counts, last-updated, FTS availability) and exposes
// a "rebuild from scratch" trigger. Auth-gated to settings:read / update.

import { command, query, getRequestEvent } from '$app/server';
import { error } from '@sveltejs/kit';
import { SearchIndexService } from 'sailorcms/core/services/search-index.server';

export const getSearchIndexHealth = query('unchecked', async () => {
  const { locals } = getRequestEvent();
  if (!locals.user) throw error(401, 'Unauthorized');
  if (!(await locals.security.hasPermission('read', 'settings'))) {
    throw error(403, 'Forbidden');
  }
  try {
    const health = await SearchIndexService.getHealth();
    return { success: true as const, ...health };
  } catch (e) {
    console.error('Failed to read search index health:', e);
    return {
      success: false as const,
      error: e instanceof Error ? e.message : 'Failed to read search index health'
    };
  }
});

export const reindexSearchIndex = command('unchecked', async () => {
  const { locals } = getRequestEvent();
  if (!locals.user) throw error(401, 'Unauthorized');
  if (!(await locals.security.hasPermission('update', 'settings'))) {
    throw error(403, 'Forbidden');
  }
  try {
    const { indexed, skipped } = await SearchIndexService.reindexAll();
    return { success: true as const, indexed, skipped };
  } catch (e) {
    console.error('Search index rebuild failed:', e);
    return {
      success: false as const,
      error: e instanceof Error ? e.message : 'Failed to rebuild search index'
    };
  }
});
