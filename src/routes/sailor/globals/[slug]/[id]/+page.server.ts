// Admin edit page for a single repeatable-global item.
//
// Thin wrapper around `loadGlobalItem` + `saveGlobalItem`. Auth + form action
// orchestration live here; all data load/save logic lives in the loader and
// persister.

import { error, redirect, fail } from '@sveltejs/kit';
import { loadGlobalItem } from 'sailorcms/core/data/loaders/global-item.server';
import { saveGlobalItem } from 'sailorcms/core/data/persisters/global-item.server';

export const load = async ({ params, locals, url }: any) => {
  if (!locals.user?.id) {
    throw redirect(303, '/sailor/auth/login');
  }

  const { slug, id } = params;

  let loaded;
  try {
    loaded = await loadGlobalItem({
      slug,
      itemId: id,
      user: { id: locals.user.id },
      locale: url.searchParams.get('locale') ?? undefined
    });
  } catch (err) {
    if (err && (err as any).notFound) {
      throw error(404, (err as Error).message);
    }
    throw error(500, err instanceof Error ? err.message : 'Failed to load global item');
  }

  // /new sentinel: loader generated a fresh UUID for repeatable items —
  // swap the URL so refresh / share / save all target the same row.
  if (id === 'new' && loaded.isNewItem && loaded.item?.id && loaded.item.id !== 'new') {
    const target = new URL(url);
    target.pathname = target.pathname.replace(/\/new$/, `/${loaded.item.id}`);
    throw redirect(307, target.pathname + target.search);
  }

  return {
    page: loaded.item,
    item: loaded.item,
    isNewItem: loaded.isNewItem,
    global: loaded.global,
    slug,
    localized: loaded.localized,
    availableLocales: loaded.availableLocales,
    currentLocale: loaded.currentLocale,
    translatedLocales: loaded.translatedLocales
  };
};

// Form-action save for repeatable global items. Thin wrapper around the
// `saveGlobalItem` persister — parse formData into a plain object, then hand
// off. Localized routing, identity/content split, arrays, files, tags, and
// search reindex all live in the persister.
export const actions = {
  save: async ({ request, params, locals }: { request: Request; params: any; locals: any }) => {
    if (!locals.user?.id) return fail(401, { error: 'Unauthorized' });

    const [canCreate, canUpdate] = await Promise.all([
      locals.security.hasPermission('create', 'content'),
      locals.security.hasPermission('update', 'content')
    ]);
    if (!canUpdate && !canCreate) {
      return fail(403, { error: 'Access denied: You do not have permission to update content' });
    }

    // Parse multipart formData → plain object, JSON-parsing entries that look
    // like JSON (arrays/objects come through as serialized strings).
    const formData = await request.formData();
    const data: Record<string, any> = {};
    for (const [key, value] of formData.entries()) {
      if (typeof value === 'string') {
        if (value.startsWith('[') || value.startsWith('{')) {
          try {
            data[key] = JSON.parse(value);
          } catch {
            data[key] = value;
          }
        } else {
          data[key] = value;
        }
      } else {
        data[key] = value;
      }
    }

    const result = await saveGlobalItem({
      globalSlug: params.slug,
      itemId: params.id,
      data,
      user: { id: locals.user.id },
      canCreate,
      canUpdate
    });

    if (!result.success) {
      return fail(500, { error: result.error ?? 'Failed to save global' });
    }
    return { success: true };
  }
};
