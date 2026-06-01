// Pure content-i18n config readers — sit alongside the rest of `core/settings`
// (settings types + loader) since they read the same generated module.
//
// No DB import, no server-only deps — safe to bundle for the client. Consumer
// code should import via `sailorcms/utils/i18n` (which re-exports these);
// admin/core code imports from here directly.

import * as generatedSettings from '$sailor/generated/settings';

/**
 * Resolve the project's content i18n config from `templates/settings.ts`.
 * Synchronous read of the generated module — no DB hit, no async cost.
 *
 * Content locales are deliberately decoupled from Paraglide's admin-UI
 * locales: a project can run the admin in English while authoring content
 * in 10 languages, or vice versa.
 */
export function getContentSettings() {
  const i18n = (generatedSettings as any).settings?.content?.i18n ?? {};
  return {
    locales: i18n.locales as string[] | undefined,
    defaultLocale: i18n.default as string | undefined,
    fallback: (i18n.fallback as 'default' | 'strict' | undefined) ?? 'default',
    urlAliases: (i18n.urlAliases as Record<string, string> | undefined) ?? {},
    urlStrategy:
      (i18n.urlStrategy as 'default-at-root' | 'symmetric' | undefined) ?? 'default-at-root'
  };
}

/**
 * Configured content locales (e.g. `['en', 'nb-NO']`). Empty array if i18n
 * isn't configured. Use for language switchers, sitemap loops, hreflang.
 */
export function getContentLocales(): string[] {
  return getContentSettings().locales ?? [];
}

/**
 * Like `getContentSettings().defaultLocale` but throws when not configured.
 * Use in places that require a default locale to function — param matchers,
 * loaders on localized routes, language switchers — so the failure is a
 * clear error at boot rather than a downstream null/undefined surprise.
 *
 * Use the plain `getContentSettings().defaultLocale` if you can handle the
 * undefined case yourself (e.g. an optional feature that gracefully degrades).
 */
export function getDefaultLocale(): string {
  const { defaultLocale } = getContentSettings();
  if (!defaultLocale) {
    throw new Error(
      'content.i18n.default is not configured in templates/settings.ts. ' +
        'Set it to a BCP-47 locale code (e.g. "en" or "nb-NO") to use the localized read/write paths.'
    );
  }
  return defaultLocale;
}

/**
 * URL segments for the configured content locales, applying
 * `content.i18n.urlAliases`. A locale without an alias uses its BCP-47
 * code unchanged. Example: with `locales: ['en', 'nb-NO']` and
 * `urlAliases: { 'nb-NO': 'no' }`, returns `['en', 'no']`.
 *
 * Use for `params` matchers, navigation menus, sitemap loops.
 */
export function getUrlLangs(): string[] {
  const { locales, urlAliases } = getContentSettings();
  if (!locales) return [];
  return locales.map((l) => urlAliases[l] ?? l);
}

/**
 * Convert a URL segment (e.g. `'no'`) to the BCP-47 content locale
 * (e.g. `'nb-NO'`). Returns the input unchanged if no alias matches
 * (which is correct when the URL segment IS the content code).
 *
 * Returns `null` if the input doesn't match any configured locale.
 */
export function urlToContentLocale(urlLang: string): string | null {
  const { locales, urlAliases } = getContentSettings();
  if (!locales) return null;
  for (const [content, alias] of Object.entries(urlAliases)) {
    if (alias === urlLang) {
      return locales.includes(content) ? content : null;
    }
  }
  return locales.includes(urlLang) ? urlLang : null;
}

/**
 * Convert a BCP-47 content locale (e.g. `'nb-NO'`) to its URL segment
 * (e.g. `'no'`). Returns the locale unchanged if no alias exists.
 */
export function contentToUrlLang(contentLocale: string): string {
  return getContentSettings().urlAliases[contentLocale] ?? contentLocale;
}

/**
 * Build a locale-aware href for the common case (`/[section]/[slug]`)
 * under either URL strategy. Returns the URL string ready to drop into an
 * `href` attribute or `<LanguageSwitcher>`'s `buildHref` callback.
 *
 * Use this for switchers + per-item links — consumers with weird route
 * shapes still hand-roll. For the recipe in docs §8:
 *
 * ```ts
 * import { buildLocaleHref } from 'sailorcms/utils/i18n';
 *
 * buildHref={(locale, translation) =>
 *   buildLocaleHref({ locale, translation, section: 'pages' })
 * }
 * ```
 *
 * Behavior:
 *   - `strategy: 'default-at-root'` (default) — default locale serves at `/`,
 *     non-default at `/<urlLang>/...`. SEO-safe shape from §8.
 *   - `strategy: 'symmetric'` — every locale gets `/<urlLang>/...`.
 *   - No `translation` (or `translation.slug` is null) — falls back to the
 *     section root (`/<urlLang>/<section>`) or the locale's site home (`/`
 *     or `/<urlLang>`) if no section is given.
 *
 * `defaultLocale` / `urlAliases` default to the configured values from
 * `getDefaultLocale()` / `getContentSettings().urlAliases`. Pass them
 * explicitly if you're rendering from a context that can't see settings
 * (e.g. inside a sailor-shipped component — pass the values down as
 * props to avoid `$sailor` alias resolution surprises).
 */
export interface BuildLocaleHrefOptions {
  /** Target BCP-47 locale (the locale this URL points at). */
  locale: string;
  /** Translation row for this locale, or `null` if no translation exists.
   *  When null/no slug, returns the section root or site home. */
  translation: { slug: string | null } | null;
  /** Section prefix between locale and slug (e.g. `'pages'`, `'blog'`).
   *  Omit for a home-page URL. */
  section?: string;
  /** URL strategy. Default `'default-at-root'`. */
  strategy?: 'default-at-root' | 'symmetric';
  /** BCP-47 default locale — only matters under `'default-at-root'`.
   *  Defaults to `getDefaultLocale()`. */
  defaultLocale?: string;
  /** URL-aliases map (`{ 'nb-NO': 'no' }` etc.). Defaults to
   *  `getContentSettings().urlAliases`. */
  urlAliases?: Record<string, string>;
}

export function buildLocaleHref(opts: BuildLocaleHrefOptions): string {
  const settings = getContentSettings();
  const {
    locale,
    translation,
    section,
    strategy = settings.urlStrategy,
    defaultLocale = settings.defaultLocale,
    urlAliases = settings.urlAliases
  } = opts;

  if (!defaultLocale) {
    throw new Error(
      'buildLocaleHref: no defaultLocale resolved. Set content.i18n.default in templates/settings.ts or pass defaultLocale explicitly.'
    );
  }

  const urlLang = urlAliases[locale] ?? locale;
  const isDefaultAtRoot = strategy === 'default-at-root' && locale === defaultLocale;
  const prefix = isDefaultAtRoot ? '' : `/${urlLang}`;

  const slug = translation?.slug ?? null;
  if (!slug) {
    if (section) return `${prefix}/${section}`;
    return prefix || '/';
  }
  return section ? `${prefix}/${section}/${slug}` : `${prefix}/${slug}`;
}

/**
 * Build the home/brand link for a target locale — `'/'` for the default
 * locale under `'default-at-root'`, `'/<urlLang>'` otherwise.
 *
 * One-liner sugar over `buildLocaleHref({ locale, translation: null })`.
 * Use in your layout's brand link, footer logo, anywhere you'd write
 * `lang === defaultLocale ? '/' : '/' + lang` by hand:
 *
 * ```svelte
 * <a href={buildLocaleHomeHref(data.locale)}>Logo</a>
 * ```
 *
 * Reads `urlStrategy` / `defaultLocale` / `urlAliases` from settings.
 */
export function buildLocaleHomeHref(locale: string): string {
  return buildLocaleHref({ locale, translation: null });
}

/**
 * Prefix a literal URL path with the locale's URL form. Use for one-off
 * links where you have a complete path string (e.g. a back-link, a related
 * post, an array of menu URLs) and don't want to decompose it into
 * `{ section, slug, translation }` just to feed `buildLocaleHref`:
 *
 * ```ts
 * buildLocalePath('/blog/' + slug, locale)
 * // → '/blog/<slug>' for default-locale under default-at-root
 * // → '/no/blog/<slug>' otherwise
 * ```
 *
 * Honors `urlStrategy` / `defaultLocale` / `urlAliases` from settings the
 * same way `buildLocaleHref` does. The path is treated as a literal URL —
 * `'/blog'` emits `/blog`, NOT `/blog/blog`. Use `buildLocaleHref` when you
 * have a translation row and want the slug substituted; use this when the
 * path is already final.
 */
export function buildLocalePath(
  path: string,
  locale: string,
  opts?: {
    strategy?: 'default-at-root' | 'symmetric';
    defaultLocale?: string;
    urlAliases?: Record<string, string>;
  }
): string {
  const settings = getContentSettings();
  const strategy = opts?.strategy ?? settings.urlStrategy;
  const defaultLocale = opts?.defaultLocale ?? settings.defaultLocale;
  const urlAliases = opts?.urlAliases ?? settings.urlAliases;

  if (!defaultLocale) {
    throw new Error(
      'buildLocalePath: no defaultLocale resolved. Set content.i18n.default in templates/settings.ts or pass defaultLocale explicitly.'
    );
  }

  const urlLang = urlAliases[locale] ?? locale;
  const isDefaultAtRoot = strategy === 'default-at-root' && locale === defaultLocale;
  const prefix = isDefaultAtRoot ? '' : `/${urlLang}`;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const body = normalized === '/' ? '' : normalized;
  return `${prefix}${body}` || '/';
}

/**
 * Default `lang` param matcher for SvelteKit, strategy-aware.
 *
 * Reads `content.i18n.urlStrategy` from settings:
 *   - `'default-at-root'` (default): refuses the default locale's URL form so
 *     `/about` is the only valid URL for default-locale pages (avoids the
 *     `/en/about` duplicate-content trap).
 *   - `'symmetric'`: accepts every configured URL form including the default.
 *
 * Drop into `src/params/lang.ts`:
 *
 * ```ts
 * import type { ParamMatcher } from '@sveltejs/kit';
 * import { defaultLangParamMatcher } from 'sailorcms/utils/i18n';
 *
 * export const match: ParamMatcher = defaultLangParamMatcher;
 * ```
 *
 * Replaces the hand-rolled matcher from docs §8 — same behavior, one line.
 */
export const defaultLangParamMatcher = (param: string): boolean => {
  const settings = getContentSettings();
  const strategy = settings.urlStrategy;
  const defaultUrl = settings.defaultLocale
    ? (settings.urlAliases[settings.defaultLocale] ?? settings.defaultLocale)
    : '';
  if (strategy === 'default-at-root' && param === defaultUrl) {
    return false;
  }
  return urlToContentLocale(param) !== null;
};

/**
 * Dependency tag used by sailor to signal "this request's resolved content
 * locale has changed." `handleSailorHooks` stamps this on the event when
 * `resolveContentLocale` is configured; consumer loaders can register the
 * same dep via `dependsOnContentLocale(event)` to opt into re-running on
 * locale change without the manual `void event.params.lang` ceremony.
 */
export const CONTENT_LOCALE_DEP = 'sailor:content-locale';

/**
 * Walk `page.data` (or any layout/page data object) and return the first
 * `translations` array we find — either as a direct top-level property
 * (`data.translations`) or one level deep (`data.page.translations`,
 * `data.post.translations`, etc.). Returns `[]` when no translations array
 * exists, so `<LanguageSwitcher>` renders the "all missing" state safely.
 *
 * Erases the `data?.page?.translations ?? data?.post?.translations ?? ...`
 * fallback chain from every localized layout. Pair with
 * `includeTranslations: true` on the loader's `getCollections`/`getGlobals`
 * call so the array shows up where this helper looks.
 *
 * Use in a layout:
 * ```svelte
 * import { page } from '$app/state';
 * import { extractTranslations } from 'sailorcms/utils/i18n';
 *
 * const translations = $derived(extractTranslations(page.data));
 * ```
 */
export function extractTranslations(data: Record<string, any> | null | undefined): Array<{
  locale: string;
  slug: string | null;
  status: string | null;
  updated_at?: Date | string | null;
}> {
  if (!data || typeof data !== 'object') return [];
  // Top-level direct property — the simplest convention for loaders that
  // want to feed the switcher independent of any specific item key.
  if (Array.isArray((data as any).translations)) {
    return (data as any).translations;
  }
  // One level deep — the typical shape (data.page / data.post / data.home,
  // each carrying their own `.translations` from `includeTranslations: true`).
  for (const value of Object.values(data)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const t = (value as any).translations;
      if (Array.isArray(t)) return t;
    }
  }
  return [];
}

/**
 * Declare that a load function depends on the active content locale.
 * SvelteKit re-runs the load when the locale changes (server-side
 * navigation between locale prefixes, or explicit `invalidate(...)`).
 *
 * Usage:
 * ```ts
 * import { dependsOnContentLocale } from 'sailorcms/utils/i18n';
 *
 * export const load = async (event) => {
 *   dependsOnContentLocale(event);
 *   // ...your load logic, reading event.locals.contentLocale...
 * };
 * ```
 *
 * Equivalent to `event.depends('sailor:content-locale')`. The helper exists
 * so consumers don't hardcode the magic string and so the convention is
 * grep-able.
 */
export function dependsOnContentLocale(event: { depends: (id: string) => void }): void {
  event.depends(CONTENT_LOCALE_DEP);
}
