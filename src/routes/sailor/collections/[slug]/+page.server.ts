// Admin list page for a collection.
//
// Thin wrapper around `loadCollectionList` — auth + permissions resolution
// live here; the actual paginated query (localized + non-localized,
// nestable + flat) lives in the loader.

import { error } from '@sveltejs/kit';
import { loadCollectionList } from 'sailorcms/core/data/loaders/collection-list.server';

export const load = async ({ params, locals, url }: any) => {
  if (!(await locals.security.hasPermission('read', 'content'))) {
    throw error(403, 'Access denied: You do not have permission to view content');
  }

  const { slug } = params;

  let loaded;
  try {
    loaded = await loadCollectionList({
      slug,
      page: parseInt(url.searchParams.get('page') || '1'),
      pageSize: parseInt(url.searchParams.get('pageSize') || '20'),
      searchQuery: url.searchParams.get('search') ?? undefined,
      sortBy: url.searchParams.get('sortBy') ?? undefined,
      sortOrder: (url.searchParams.get('sortOrder') as 'asc' | 'desc' | null) ?? undefined
    });
  } catch (err) {
    if (err && (err as any).notFound) {
      throw error(404, (err as Error).message);
    }
    throw error(500, 'Failed to fetch collection items');
  }

  const permissions = {
    collections: {
      create: await locals.security.hasPermission('create', 'content'),
      update: await locals.security.hasPermission('update', 'content'),
      delete: await locals.security.hasPermission('delete', 'content'),
      view: await locals.security.hasPermission('read', 'content')
    }
  };

  return {
    collectionType: loaded.collectionType,
    items: loaded.items,
    pagination: loaded.pagination,
    permissions
  };
};
