// Admin edit page for a single collection item.
//
// Thin wrapper around `loadCollectionItem` — auth + admin-specific concerns
// (header actions, site URL) live here, the actual data load lives in the
// loader. Localized + non-localized branching all happens inside the loader.

import { error, redirect } from '@sveltejs/kit';
import { SystemSettingsService } from 'sailorcms/core/services/settings.server';
import { loadCollectionItem } from 'sailorcms/core/data/loaders/collection-item.server';
import type { PageServerLoad } from './$types';
import { m } from '$sailor/i18n';
import type { CollectionTypes, BlockTypes } from '$sailor/generated/types';

export const load: PageServerLoad = async ({ params, locals, url }) => {
  // Check permission to view content
  if (!(await locals.security.hasPermission('read', 'content'))) {
    throw error(403, 'Access denied: You do not have permission to view content');
  }

  const { slug, id } = params;

  let loaded;
  try {
    loaded = await loadCollectionItem({
      slug,
      itemId: id,
      user: locals.user ? { id: locals.user.id } : null,
      locale: url.searchParams.get('locale') ?? undefined
    });
  } catch (err) {
    if (err && (err as any).notFound) {
      throw error(404, (err as Error).message);
    }
    throw error(500, err instanceof Error ? err.message : 'Failed to load collection item');
  }

  // For /new the loader generates a fresh UUID and stamps it on page.id.
  // Replace the URL with the real id so refresh / share / save all target
  // the same row and the save flow doesn't need a post-create redirect.
  if (id === 'new' && loaded.isNewItem && loaded.page?.id) {
    const target = new URL(url);
    target.pathname = target.pathname.replace(/\/new$/, `/${loaded.page.id}`);
    throw redirect(307, target.pathname + target.search);
  }

  // For edit routes, check if user can update this specific item
  if (!loaded.isNewItem) {
    const canUpdate = await locals.security.hasPermission('update', 'content');
    if (!canUpdate) {
      throw error(403, 'You do not have permission to update this content');
    }
  }

  // Get site URL for SEO canonical URL generation
  const siteUrl = await SystemSettingsService.getSetting('site.url');

  // Setup header actions
  const headerActions = [];

  // Always add payload preview action (left side)
  headerActions.push({
    type: 'payload-preview',
    props: {
      type: 'collection',
      id: String(loaded.page.id || ''),
      slug,
      title: m.payload_title_collection(),
      fields: loaded.effectiveFields,
      initialPayload: {
        ...loaded.page,
        blocks: loaded.blocks.map((block: any) => ({
          id: block.id,
          blockType: block.blockType,
          content: block.data,
          sort: block.data.sort
        }))
      }
    }
  });

  // Add preview link if not a new item and has slug (left side)
  if (!loaded.isNewItem && loaded.page.slug) {
    // Prefer canonical_url override when set; otherwise fall back to basePath + slug
    let previewUrl: string;
    const canonical =
      typeof loaded.page.canonical_url === 'string' ? loaded.page.canonical_url.trim() : '';
    if (canonical) {
      previewUrl = canonical;
    } else {
      let basePath = loaded.collectionType.options?.basePath || `/${slug}/`;
      if (!basePath.startsWith('/')) basePath = `/${basePath}`;
      if (!basePath.endsWith('/')) basePath = `${basePath}/`;
      const normalizedSlug = loaded.page.slug.startsWith('/')
        ? loaded.page.slug.slice(1)
        : loaded.page.slug;
      previewUrl = `${basePath}${normalizedSlug}`;
    }
    headerActions.push({
      type: 'preview-link',
      props: {
        href: previewUrl,
        title: m.payload_title_preview()
      }
    });
  }

  // Add save button as last action (right side)
  headerActions.push({
    type: 'save-button',
    props: {
      text: loaded.isNewItem ? m.common_create() : m.common_save(),
      submittingText: loaded.isNewItem ? m.common_creating() : m.common_saving(),
      submitting: false, // Will be updated client-side
      formId: 'collection-form' // Submit the form instead
    }
  });

  return {
    page: {
      ...loaded.page,
      blocks: loaded.blocks,
      blockGroups: loaded.blockGroups
    } as CollectionTypes[keyof CollectionTypes] & {
      blocks: BlockTypes[keyof BlockTypes][];
    } & Record<string, any>,
    isNewItem: loaded.isNewItem,
    collectionType: loaded.collectionType,
    availableBlocks: loaded.availableBlocks,
    slug,
    hasBlocks: loaded.hasBlocks,
    siteUrl: siteUrl || '',
    headerActions,
    revisions: loaded.revisions,
    localized: loaded.localized,
    availableLocales: loaded.availableLocales,
    currentLocale: loaded.currentLocale,
    translatedLocales: loaded.translatedLocales
  };
};
