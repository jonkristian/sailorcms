<script lang="ts" module>
  /** One translation row, same shape as `<LanguageSwitcher>` consumes —
   *  comes from `getCollections` / `getGlobals` with `includeTranslations: true`. */
  export type HreflangTranslation = {
    locale: string;
    slug: string | null;
    status: string | null;
    /** Last-modified timestamp from the `_locales` row. Unused by this
     *  component (hreflang doesn't surface staleness), but included so
     *  consumers can pass the same `getCurrentTranslations()` payload
     *  they hand to `<LanguageSwitcher>` without trimming. */
    updated_at?: Date | string | null;
  };
</script>

<script lang="ts">
  import { page } from '$app/state';
  import {
    buildLocaleHref as defaultBuildLocaleHref,
    type BuildLocaleHrefOptions
  } from 'sailorcms/utils/i18n';

  type Translation = HreflangTranslation;

  interface Props {
    /** Per-locale translation rows for the current item — pair with
     *  `includeTranslations: true` on the loader's `getCollections`/`getGlobals`
     *  call. Only rows whose `status !== 'draft'` are emitted; rows whose
     *  `slug` is null are skipped when `section` is set (no URL exists). */
    translations: Translation[];
    /** BCP-47 default locale — the locale whose URL becomes the
     *  `<link hreflang="x-default">` target. Pass `getDefaultLocale()` from
     *  `sailorcms/utils/i18n`. */
    defaultLocale: string;
    /** URL-alias map (`{ 'nb-NO': 'no' }`). Pass `getContentSettings().urlAliases`
     *  if the project uses them; default `{}`. */
    urlAliases?: Record<string, string>;
    /** URL strategy — `'default-at-root'` (default; default locale at `/`,
     *  others prefixed) or `'symmetric'` (every locale prefixed). Pass
     *  `getContentSettings().urlStrategy` to thread the project's setting
     *  through. Component doesn't read settings itself for the same
     *  workspace-context reason as `<LanguageSwitcher>`. */
    urlStrategy?: 'default-at-root' | 'symmetric';
    /** Section prefix between locale and slug (e.g. `'blog'`, `'pages'`).
     *  Omit for top-level pages whose URL is just `/<slug>` (about, contact).
     *  For the home route, use `routeShape="home"` instead — the home's
     *  translations may carry a slug ('home', 'index') that the default
     *  `/<slug>` behavior would render incorrectly. */
    section?: string;
    /** Built-in shape for known URL patterns. Mirrors `<LanguageSwitcher>`'s
     *  convenience modes.
     *
     *   - `'home'` — every locale's alternate is its locale root (`/` for the
     *     default locale under `'default-at-root'`, `/<urlLang>` otherwise).
     *     Forces `translation: null` regardless of any slug the home row
     *     carries, so `<HreflangLinks routeShape="home">` on a layout serving
     *     the home page yields correct alternates without a `buildHref`
     *     override. Ignores `section`.
     *
     *  Drop unset for the default `/[section]/[slug]` behavior. */
    routeShape?: 'home';
    /** Absolute URL base — `https://example.com`. Hreflang URLs must be
     *  absolute (Google's spec); relative URLs are silently ignored.
     *  Defaults to `page.url.origin`, which is correct for most setups
     *  including reverse-proxied deployments where SvelteKit's `origin`
     *  comes from the request. Pass explicitly only if you need a
     *  canonical origin different from the request (e.g. CDN-served
     *  preview environments pointing at the production origin). */
    origin?: string;
    /** Custom href builder, overrides `buildLocaleHref`. Use for nested
     *  sections or non-flat URL shapes — same callback shape as
     *  `<LanguageSwitcher>`'s `buildHref`, but without the third
     *  `urlLang` arg (compute it yourself from `urlAliases` if needed). */
    buildHref?: (locale: string, translation: Translation) => string;
  }

  let {
    translations,
    defaultLocale,
    urlAliases = {},
    urlStrategy = 'default-at-root',
    section,
    routeShape,
    origin,
    buildHref
  }: Props = $props();

  const baseOrigin = $derived(origin ?? page.url.origin);

  const links = $derived.by(() => {
    // Skip drafts — they shouldn't be advertised as discoverable alternates.
    // Skip rows with null slug when section is set (would link to the locale
    // home as a "blog post alternate" — misleading). For top-level pages
    // (no section) and the home route, null slug is fine — locale root IS
    // the URL.
    const available = translations.filter(
      (t) => t.status !== 'draft' && (routeShape === 'home' || t.slug !== null || !section)
    );
    const toHref = (t: Translation): string => {
      if (buildHref) return `${baseOrigin}${buildHref(t.locale, t)}`;
      // routeShape='home' coerces translation to null so any slug the home
      // row carries ('home', 'index') is ignored and buildLocaleHref returns
      // the locale root. Same behavior as `buildLocaleHomeHref(locale)` but
      // pass the props explicitly — calling that helper here would re-read
      // sailor's own settings (workspace-context resolution from inside the
      // shipped component), same reason `locales`/`urlAliases` are props.
      const path = defaultBuildLocaleHref({
        locale: t.locale,
        translation: routeShape === 'home' ? null : t,
        section: routeShape === 'home' ? undefined : section,
        strategy: urlStrategy,
        defaultLocale,
        urlAliases
      } satisfies BuildLocaleHrefOptions);
      return `${baseOrigin}${path}`;
    };
    const items = available.map((t) => ({ hreflang: t.locale, href: toHref(t) }));
    // x-default — Google's recommendation is the default locale's URL when
    // available. Emit only if the default locale has a real translation row;
    // otherwise the signal is meaningless.
    const def = available.find((t) => t.locale === defaultLocale);
    if (def) {
      items.push({ hreflang: 'x-default', href: toHref(def) });
    }
    return items;
  });
</script>

<svelte:head>
  {#each links as link (link.hreflang)}
    <link rel="alternate" hreflang={link.hreflang} href={link.href} />
  {/each}
</svelte:head>
