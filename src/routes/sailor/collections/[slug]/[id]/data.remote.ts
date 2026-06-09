// SvelteKit remote functions for individual collection items.
//
// Thin wrapper around the `saveCollectionItem` persister — auth and request
// context (locals.user, permissions) are resolved here, then the save itself
// runs in the data-layer primitive. Localized vs non-localized branching
// lives in the persister, not here.

import { command, getRequestEvent } from '$app/server';
import { saveCollectionItem as saveCollectionItemPersister } from 'sailorcms/core/data/persisters/collection-item.server';

/**
 * Save collection item (create or update). Routes through the
 * `saveCollectionItem` persister in `core/data/persisters/`.
 */
export const saveCollectionItem = command(
  'unchecked',
  async ({
    collectionSlug,
    itemId,
    formData
  }: {
    collectionSlug: string;
    itemId: string;
    formData: Record<string, any>;
  }) => {
    const { locals } = getRequestEvent();

    // Resolve permissions once and pass through — the persister is a data
    // primitive and doesn't reach into request locals.
    const [canCreate, canUpdate] = await Promise.all([
      locals.security.hasPermission('create', 'content'),
      locals.security.hasPermission('update', 'content')
    ]);

    return await saveCollectionItemPersister({
      collectionSlug,
      itemId,
      formData,
      user: locals.user ?? null,
      canCreate,
      canUpdate
    });
  }
);
