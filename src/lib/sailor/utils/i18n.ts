// Client-safe content i18n helpers — consumer-facing re-export of the pure
// config readers from `core/settings/i18n` plus a small client-only nav
// hook. Use this import path in any file shipped to the browser (param
// matchers, universal loaders, components) — `sailorcms/utils/data` pulls
// in `db` which breaks the client bundle.

import { afterNavigate, invalidate } from '$app/navigation';
import { page } from '$app/state';
import { CONTENT_LOCALE_DEP, extractTranslations } from '../core/settings/i18n';

export {
  getContentSettings,
  getContentLocales,
  getDefaultLocale,
  getUrlLangs,
  urlToContentLocale,
  contentToUrlLang,
  buildLocaleHref,
  buildLocaleHomeHref,
  buildLocalePath,
  defaultLangParamMatcher,
  extractTranslations,
  dependsOnContentLocale,
  CONTENT_LOCALE_DEP,
  type BuildLocaleHrefOptions
} from '../core/settings/i18n';

export { getHomeConfig } from '../core/settings/home';

/**
 * One-call bridge between sailor's server-side i18n machinery and the
 * client. On every SPA navigation, this:
 *
 *   1. Resolves the new request's content locale (BCP-47) from the URL via
 *      your `extractContentLocale` callback.
 *   2. Stamps `document.documentElement.lang` with that locale — keeps
 *      `<html lang>` correct after client-side nav (sailor's
 *      `transformPageChunk` only fires on the initial full-page response).
 *   3. Invalidates `CONTENT_LOCALE_DEP` if the locale changed since the
 *      last navigation — triggers re-runs of any loader that opted in via
 *      `dependsOnContentLocale(event)`.
 *
 * Replaces three pieces of consumer boilerplate (`<svelte:html>` for lang,
 * `$effect` for invalidate, hand-rolled `afterNavigate` for state diff).
 *
 * Call once at the root of your localized layout:
 * ```svelte
 * <script>
 *   import { watchContentLocale, urlToContentLocale, getDefaultLocale } from 'sailorcms/utils/i18n';
 *
 *   watchContentLocale((pathname) => {
 *     const seg = pathname.split('/')[1];
 *     return urlToContentLocale(seg) ?? getDefaultLocale();
 *   });
 * </script>
 * ```
 *
 * The callback should return the **BCP-47 content locale** (e.g. `'nb-NO'`),
 * not the URL form (`'no'`). That's the value `<html lang>` wants for SEO /
 * screen readers, and the value sailor stamps on the server too.
 *
 * Client-only — calling on the server is a no-op (`afterNavigate` doesn't
 * fire there).
 */
export function watchContentLocale(
  extractContentLocale: (pathname: string) => string | null | undefined
): void {
  let last: string | null = null;
  afterNavigate((nav) => {
    if (!nav.to) return;
    const next = extractContentLocale(nav.to.url.pathname) ?? null;
    if (typeof document !== 'undefined' && next) {
      document.documentElement.lang = next;
    }
    if (next !== last) {
      last = next;
      void invalidate(CONTENT_LOCALE_DEP);
    }
  });
}

/**
 * Reactive accessor for the current request's content translations. Reads
 * `page.data` via `$app/state` and runs `extractTranslations` on it —
 * use this in a Svelte component to skip the `$derived(extractTranslations(...))`
 * wiring:
 *
 * ```svelte
 * <script>
 *   import { getCurrentTranslations } from 'sailorcms/utils/i18n';
 * </script>
 *
 * <LanguageSwitcher translations={getCurrentTranslations()} ... />
 * ```
 *
 * Because `page` is a reactive proxy and the call reads `page.data`, Svelte's
 * template reactivity re-evaluates this whenever the page-data changes — so
 * `translations` stays in sync with route navigation without an explicit
 * `$derived` wrapper.
 *
 * Client + universal — meaningful only inside Svelte component scope. For
 * server load functions, use `extractTranslations(data)` directly with your
 * own data shape.
 */
export function getCurrentTranslations(): Array<{
  locale: string;
  slug: string | null;
  status: string | null;
  updated_at?: Date | string | null;
}> {
  return extractTranslations(page.data);
}
