import type { CollectionDefinition } from 'sailorcms/core/types';
import { postsCollection } from './posts';
import { pagesCollection } from './pages';
import { i18nTestCollection } from './i18n_test';

/**
 * Collection Definitions
 *
 * Collections are content types with multiple entries (posts, pages, products).
 * Core fields (title, slug, status, sort) are auto-added. Override using `override` property.
 */
export const collectionDefinitions: Record<string, CollectionDefinition> = {
  posts: postsCollection,
  pages: pagesCollection,
  i18n_test: i18nTestCollection
};
