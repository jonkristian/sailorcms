/**
 * Core routing utilities for Sailor CMS
 * Defines canonical URL patterns for different content types
 */

import type { CollectionTypes, GlobalTypes } from '../../generated/types';

/**
 * Generate the canonical URL for a global type
 */
export function getGlobalUrl(
  global: { slug: string; data_type?: string },
  itemId?: string
): string {
  if (global.data_type === 'flat') {
    // Flat globals: always go to /sailor/globals/{slug}
    return `/sailor/globals/${global.slug}`;
  } else {
    // Repeatable globals: go to list page or specific item
    if (itemId) {
      return `/sailor/globals/${global.slug}/${itemId}`;
    } else {
      return `/sailor/globals/${global.slug}`;
    }
  }
}

/**
 * Generate the canonical URL for a collection type
 */
export function getCollectionUrl(
  collection: { slug: string },
  itemId?: string
): string {
  if (itemId) {
    return `/sailor/collections/${collection.slug}/${itemId}`;
  } else {
    return `/sailor/collections/${collection.slug}`;
  }
}

/**
 * Generate dashboard activity link for content
 */
export function getDashboardActivityLink(
  type: 'collection' | 'global',
  entity: { slug: string; data_type?: string },
  itemId?: string
): string {
  if (type === 'collection') {
    return getCollectionUrl(entity, itemId);
  } else {
    return getGlobalUrl(entity, itemId);
  }
}
