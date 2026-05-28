// Admin list / flat-edit page for a global.
//
// Dual-purpose: renders FlatView for flat globals (in-place edit shape) OR
// list/inline/nested view for repeatable globals. Thin wrapper around
// `loadGlobalsForList` — auth + permissions resolution live here, all data
// load logic (including localized branching) lives in the loader.

import { error } from '@sveltejs/kit';
import { loadGlobalsForList } from 'sailorcms/core/data/loaders/global-list.server';

export const load = async ({ params, locals, url }: any) => {
  if (!(await locals.security.hasPermission('read', 'content'))) {
    throw error(403, 'Access denied: You do not have permission to view content');
  }

  const { slug } = params;

  let loaded;
  try {
    loaded = await loadGlobalsForList({
      slug,
      page: parseInt(url.searchParams.get('page') || '1'),
      pageSize: parseInt(url.searchParams.get('pageSize') || '20'),
      locale: url.searchParams.get('locale') ?? undefined
    });
  } catch (err) {
    if (err && (err as any).notFound) {
      throw error(404, (err as Error).message);
    }
    throw error(500, err instanceof Error ? err.message : 'Failed to load globals');
  }

  const permissions = {
    globals: {
      create: await locals.security.hasPermission('create', 'content'),
      update: await locals.security.hasPermission('update', 'content'),
      delete: await locals.security.hasPermission('delete', 'content'),
      view: await locals.security.hasPermission('read', 'content')
    }
  };

  return {
    global: loaded.global,
    items: loaded.items,
    existingData: loaded.existingData,
    pagination: loaded.pagination,
    permissions,
    localized: loaded.localized,
    availableLocales: loaded.availableLocales,
    currentLocale: loaded.currentLocale,
    translatedLocales: loaded.translatedLocales
  };
};
