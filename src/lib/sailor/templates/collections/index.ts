import type { CollectionDefinition } from '$sailor/core/types';
import { postsCollection } from './posts';
import { pagesCollection } from './pages';

/**
 * Collection Definitions
 *
 * Collections are content types with multiple entries (posts, pages, products).
 * Core fields (title, slug, status, sort) are auto-added. Override using `override` property.
 */
export const collectionDefinitions: Record<string, CollectionDefinition> = {
  posts: postsCollection,
  pages: pagesCollection
};
