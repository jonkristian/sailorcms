<script lang="ts" module>
  /** One translation row as returned by `includeTranslations: true` on
   *  `getCollections` / `getGlobals`. `slug` and `status` are nullable
   *  because the `_locales` row may have them unset (per-locale slug is
   *  optional on globals; status defaults to NULL until first save). */
  export type LanguageSwitcherTranslation = {
    locale: string;
    slug: string | null;
    status: string | null;
    /** Last-modified timestamp of this `_locales` row. When provided
     *  alongside `defaultLocale`, the switcher marks a chip stale (via
     *  `data-stale`) if its `updated_at` is older than the default
     *  locale's — i.e., the source has changed since this translation
     *  was last updated. Comes through `includeTranslations: true`. */
    updated_at?: Date | string | null;
  };
</script>

<script lang="ts">
  import { page } from '$app/state';
  import {
    buildLocaleHref as defaultBuildLocaleHref,
    type BuildLocaleHrefOptions
  } from 'sailorcms/utils/i18n';

  type Translation = LanguageSwitcherTranslation;

  interface Props {
    /** Per-locale translation rows for the current entity, as returned by
     *  `getCollections`/`getGlobals` with `includeTranslations: true`. Empty
     *  for non-localized entities or when no translations exist. */
    translations?: Translation[];
    /** Active content locale (BCP-47, e.g. `'nb-NO'`). The matching item
     *  gets `aria-current="page"`. */
    currentLocale: string;
    /** Locales to render. Pass `getContentLocales()` from `sailorcms/utils/i18n`
     *  (or a filtered subset) at the call site — the component intentionally
     *  doesn't import consumer settings itself to avoid `$sailor` alias
     *  resolution surprises in sibling-link dev setups. */
    locales: string[];
    /** Optional URL-alias map for path building (`{ 'nb-NO': 'no' }` etc.).
     *  Pass `getContentSettings().urlAliases` from `sailorcms/utils/i18n` if
     *  your project uses them. Used to derive the third arg of `buildHref`
     *  and the default `routeShape: 'flat'` href computation. */
    urlAliases?: Record<string, string>;
    /** Built-in routing convenience for `/[section]/[slug]` URLs. When set,
     *  the switcher detects the current `section` from `page.url.pathname`
     *  (first non-lang segment), then computes hrefs via `buildLocaleHref`
     *  internally — `buildHref` and the surrounding ~10 lines of consumer
     *  wrapper code become unnecessary. Pair with `defaultLocale` for the
     *  default-at-root URL strategy.
     *
     *  For non-flat URL shapes (nested sections, custom prefixes), leave
     *  this unset and provide `buildHref` directly.
     */
    routeShape?: 'flat';
    /** BCP-47 default locale — needed by `routeShape: 'flat'` to know when
     *  to omit the lang prefix (default-at-root strategy). Pass
     *  `getDefaultLocale()` from `sailorcms/utils/i18n`. */
    defaultLocale?: string;
    /** URL strategy for `routeShape: 'flat'` href computation. Defaults to
     *  `'default-at-root'`. Pass `getContentSettings().urlStrategy` from
     *  `sailorcms/utils/i18n` to wire the project's declared setting through
     *  — the component doesn't read settings itself (same workspace-context
     *  reason as `locales` / `urlAliases`). */
    urlStrategy?: 'default-at-root' | 'symmetric';
    /** Build the href for a given locale. Third arg is the URL form
     *  (`urlAliases` applied, e.g. `'no'` for `'nb-NO'`) — use it for path
     *  building. `locale` stays the BCP-47 code; `translation` is the row
     *  when available or `null` (fall back to home / slugless route).
     *  Optional when `routeShape: 'flat'` is set — the component computes
     *  hrefs itself via `buildLocaleHref`. Required otherwise. */
    buildHref?: (locale: string, translation: Translation | null, urlLang: string) => string;
    /** Override the default `Intl.DisplayNames` label (full mode) — receives
     *  the BCP-47 locale, returns the visible label string. */
    labelFor?: (locale: string) => string;
    /** Override the default short-label generator (compact mode). Default:
     *  URL alias if set (uppercased) else the locale's first subtag uppercased
     *  (e.g. `'nb-NO'` → `'NO'`, `'en'` → `'EN'`). */
    shortLabelFor?: (locale: string) => string;
    /** Override the default flag derivation. Default: region subtag → regional
     *  indicator emoji (e.g. `'nb-NO'` → 🇳🇴). Returns `''` when no region
     *  subtag exists (e.g. `'en'`) — consumer can supply via this callback. */
    flagFor?: (locale: string) => string;
    /** Render the short form (URL alias / first subtag) instead of the full
     *  language name. Default: false. */
    compact?: boolean;
    /** Prepend a country flag emoji to each item. Pairs with `compact` or
     *  full mode. Default: false. */
    showFlags?: boolean;
    /** Render configured locales that have no translation row (default: true).
     *  When false, the switcher only shows locales present in `translations`. */
    showMissing?: boolean;
    /** Hide the whole switcher when `translations` is empty (e.g. a route
     *  with no per-content translations: a search page, an unflipped
     *  collection's listing). Default: false — renders the locale chips
     *  anyway (with `data-available={false}` flags) so visitors can still
     *  jump between locales. Set to true on content routes where a
     *  no-translations item should hide the UI entirely. */
    hideIfNoTranslations?: boolean;
    class?: string;
  }

  let {
    translations = [],
    currentLocale,
    locales,
    urlAliases = {},
    routeShape,
    defaultLocale,
    urlStrategy = 'default-at-root',
    buildHref,
    labelFor,
    shortLabelFor,
    flagFor,
    compact = false,
    showFlags = false,
    showMissing = true,
    hideIfNoTranslations = false,
    class: className = ''
  }: Props = $props();

  /**
   * `routeShape: 'flat'` href builder — extracts the current section from
   * `page.url.pathname` (first non-lang segment) and feeds it into
   * `buildLocaleHref`. Replaces the ~10-line consumer wrapper that does
   * the same thing.
   */
  function flatRouteHref(
    locale: string,
    translation: Translation | null,
    _urlLang: string
  ): string {
    // Strip the current lang prefix to find the section. If the first
    // segment is in urlAliases' values OR matches the urlLang of any
    // configured locale, treat it as a lang prefix and shift past it.
    const parts = page.url.pathname.split('/').filter(Boolean);
    const aliasValues = new Set(Object.values(urlAliases));
    const configuredUrlLangs = new Set(locales.map((l) => urlAliases[l] ?? l));
    if (parts[0] && (aliasValues.has(parts[0]) || configuredUrlLangs.has(parts[0]))) {
      parts.shift();
    }
    const section = parts[0]; // may be undefined (home page)

    return defaultBuildLocaleHref({
      locale,
      // On the home page (no section), pass null so `buildLocaleHref` returns
      // just the locale prefix (`/` or `/{urlLang}`). Passing the translation
      // here would make the helper treat its slug as the path → `/about`
      // instead of `/` when home is rendered.
      translation: section ? translation : null,
      section,
      strategy: urlStrategy,
      defaultLocale,
      urlAliases
    } satisfies BuildLocaleHrefOptions);
  }

  const effectiveBuildHref = $derived(buildHref ?? (routeShape === 'flat' ? flatRouteHref : null));

  function defaultLabelFor(locale: string): string {
    try {
      const dn = new Intl.DisplayNames([locale], { type: 'language' });
      const label = dn.of(locale);
      return label ? label.charAt(0).toUpperCase() + label.slice(1) : locale;
    } catch {
      return locale;
    }
  }

  function defaultShortLabelFor(locale: string): string {
    const alias = urlAliases[locale];
    if (alias) return alias.toUpperCase();
    return locale.split('-')[0].toUpperCase();
  }

  /** Convert a 2-letter region subtag (`'NO'`) into a regional-indicator
   *  emoji pair (🇳🇴). Returns `''` for locales without a region subtag —
   *  consumer can supply via `flagFor` (no region = no flag is the safe
   *  default since "en → 🇬🇧 vs 🇺🇸" is contentious). */
  function defaultFlagFor(locale: string): string {
    const parts = locale.split('-');
    for (const part of parts.slice(1)) {
      if (/^[A-Z]{2}$/.test(part)) {
        return String.fromCodePoint(...[...part].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
      }
    }
    return '';
  }

  /** Compute a translation's staleness against the default locale's row.
   *  A translation is stale when its `updated_at` is strictly older than
   *  the default's — i.e., the source has been edited since this
   *  translation was last touched. Returns `false` when either timestamp
   *  is missing (can't decide), when there's no `defaultLocale`, or for
   *  the default locale's own row (the source can't be stale relative to
   *  itself). */
  function isStale(translation: Translation, defaultTranslation: Translation | null): boolean {
    if (!defaultLocale || !defaultTranslation) return false;
    if (translation.locale === defaultLocale) return false;
    const a = translation.updated_at;
    const b = defaultTranslation.updated_at;
    if (!a || !b) return false;
    return new Date(a).getTime() < new Date(b).getTime();
  }

  const items = $derived.by(() => {
    const byLocale = new Map(translations.map((t) => [t.locale, t]));
    const defaultTranslation = defaultLocale ? (byLocale.get(defaultLocale) ?? null) : null;
    const source = showMissing && locales.length > 0 ? locales : translations.map((t) => t.locale);
    const label = labelFor ?? defaultLabelFor;
    const shortLabel = shortLabelFor ?? defaultShortLabelFor;
    const flag = flagFor ?? defaultFlagFor;
    return source.map((locale) => {
      const translation = byLocale.get(locale) ?? null;
      const urlLang = urlAliases[locale] ?? locale;
      return {
        locale,
        translation,
        href: effectiveBuildHref
          ? effectiveBuildHref(locale, translation, urlLang)
          : // No buildHref + no routeShape — fall back to a slugless locale
            // root URL so the chip is still navigable. Consumer should set
            // one or the other.
            `/${urlLang}`,
        label: compact ? shortLabel(locale) : label(locale),
        flag: showFlags ? flag(locale) : '',
        isCurrent: locale === currentLocale,
        isAvailable: !!translation,
        isStale: translation ? isStale(translation, defaultTranslation) : false
      };
    });
  });
</script>

{#if items.length > 0 && !(hideIfNoTranslations && translations.length === 0)}
  <ul
    class={`sailor-language-switcher ${className}`.trim()}
    data-compact={compact ? '' : undefined}
    data-with-flags={showFlags ? '' : undefined}
  >
    {#each items as item (item.locale)}
      <li>
        <a
          href={item.href}
          hreflang={item.locale}
          lang={item.locale}
          aria-current={item.isCurrent ? 'page' : undefined}
          data-locale={item.locale}
          data-available={item.isAvailable}
          data-stale={item.isStale ? '' : undefined}
        >
          {#if item.flag}<span class="sailor-language-switcher__flag" aria-hidden="true"
              >{item.flag}</span
            >{/if}
          {item.label}
        </a>
      </li>
    {/each}
  </ul>
{/if}
