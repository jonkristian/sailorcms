// `content.home` declaration reader. Sits alongside i18n in `core/settings`
// since both read the same generated module. Sync, no DB, no server-only
// deps — safe to bundle for the client. Consumer code imports via
// `sailorcms/utils/i18n` (re-export); admin/core code imports from here.
//
// Companion async helper `getHomeItem()` (server-only) lives in
// `utils/data/home.ts` and resolves this declaration into a real item.

import * as generatedSettings from '$sailor/generated/settings';
import type { ContentHomeSettings } from './types';

/**
 * Resolve the project's home-page declaration from `templates/settings.ts`.
 * Returns `null` when `content.home` isn't configured — features that key
 * off "is there a home item?" (sitemap auto-detection, hreflang home
 * routes, the `getHomeItem` server helper) can branch cleanly.
 *
 * Both fields are required; partial declarations are treated as unset.
 */
export function getHomeConfig(): ContentHomeSettings | null {
  const home = (generatedSettings as any).settings?.content?.home;
  if (!home || typeof home !== 'object') return null;
  const { collectionSlug, itemSlug } = home as Partial<ContentHomeSettings>;
  if (typeof collectionSlug !== 'string' || !collectionSlug) return null;
  if (typeof itemSlug !== 'string' || !itemSlug) return null;
  return { collectionSlug, itemSlug };
}
