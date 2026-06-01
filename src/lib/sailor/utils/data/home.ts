// `content.home` resolver — bridges the static declaration (collectionSlug
// + itemSlug) into a fetched item. Server-only (calls `getCollections`,
// which hits the DB). Consumers wanting just the declaration should reach
// for `getHomeConfig()` from `sailorcms/utils/i18n` (client-safe).

import { getHomeConfig } from '../../core/settings/home';
import { getCollections } from './collections';
import type { CollectionsOptions, CollectionsSingleResult } from './collections';
import type { CollectionTypes } from '$sailor/generated/types';

/**
 * Resolve the configured home item to a real row. Returns `null` when
 * `content.home` isn't declared, when the configured collection / slug
 * doesn't exist, or (for localized collections under `fallback: 'strict'`)
 * when the requested locale has no row.
 *
 * Pass `includeTranslations: true` on the home route's loader so
 * `<HreflangLinks>` and the language switcher get sibling translations
 * without an extra query.
 *
 * ```ts
 * // src/routes/(site)/+page.server.ts
 * export const load = async (event) => {
 *   const home = await getHomeItem({
 *     locale: event.locals.contentLocale,
 *     includeTranslations: true
 *   });
 *   if (!home) error(404, 'No home item configured');
 *   return { home };
 * };
 * ```
 */
export async function getHomeItem<T extends CollectionTypes = CollectionTypes>(
  options: Omit<CollectionsOptions, 'itemSlug' | 'itemId'> = {}
): Promise<CollectionsSingleResult<T>> {
  const config = getHomeConfig();
  if (!config) return null;
  return getCollections<T>(config.collectionSlug, {
    ...options,
    itemSlug: config.itemSlug
  });
}

/**
 * Event-aware sugar over `getHomeItem` — picks `locale` off
 * `event.locals.contentLocale`, `user` off `event.locals.user`, and stamps
 * the `'sailor:content-locale'` dependency tag so a locale switch
 * re-invalidates the load. Mirrors `getCollectionsFor`.
 *
 * ```ts
 * export const load = async (event) => {
 *   const home = await getHomeItemFor(event, { includeTranslations: true });
 *   if (!home) error(404);
 *   return { home };
 * };
 * ```
 */
export async function getHomeItemFor<T extends CollectionTypes = CollectionTypes>(
  event: { locals: App.Locals; depends?: (id: string) => void },
  options: Omit<CollectionsOptions, 'itemSlug' | 'itemId'> = {}
): Promise<CollectionsSingleResult<T>> {
  if (typeof event.depends === 'function') {
    try {
      event.depends('sailor:content-locale');
    } catch {
      // depends() may throw if called outside a load context — ignore.
    }
  }
  return getHomeItem<T>({
    ...options,
    locale: options.locale ?? event.locals.contentLocale,
    user: options.user ?? (event.locals.user as any) ?? null
  });
}
