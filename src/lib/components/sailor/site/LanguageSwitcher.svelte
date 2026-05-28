<script lang="ts" module>
  export type LanguageSwitcherTranslation = {
    locale: string;
    slug: string | null;
    status: string | null;
  };
</script>

<script lang="ts">
  import { settings as generatedSettings } from '$sailor/generated/settings';

  type Translation = LanguageSwitcherTranslation;

  interface Props {
    /** Per-locale translation rows for the current entity, as returned by
     *  `getCollections`/`getGlobals` with `includeTranslations: true`. Empty
     *  for non-localized entities or when no translations exist. */
    translations?: Translation[];
    /** Active content locale (BCP-47, e.g. `'nb-NO'`). The matching item
     *  gets `aria-current="page"`. */
    currentLocale: string;
    /** Locales to render. Defaults to `content.i18n.locales` from settings —
     *  consumer can override to filter or reorder. */
    locales?: string[];
    /** Build the href for a given locale. Third arg is the URL form
     *  (`content.i18n.urlAliases` applied, e.g. `'no'` for `'nb-NO'`) —
     *  use it for path building. `locale` stays the BCP-47 code; `translation`
     *  is the row when available or `null` (fall back to home / slugless route). */
    buildHref: (locale: string, translation: Translation | null, urlLang: string) => string;
    /** Override the default `Intl.DisplayNames` label. */
    labelFor?: (locale: string) => string;
    /** Render configured locales that have no translation row (default: true).
     *  When false, the switcher only shows locales present in `translations`. */
    showMissing?: boolean;
    class?: string;
  }

  const i18nSettings = (generatedSettings as any).settings?.content?.i18n ?? {};
  const urlAliases = (i18nSettings.urlAliases as Record<string, string> | undefined) ?? {};

  let {
    translations = [],
    currentLocale,
    locales = (i18nSettings.locales as string[] | undefined) ?? [],
    buildHref,
    labelFor,
    showMissing = true,
    class: className = ''
  }: Props = $props();

  function defaultLabelFor(locale: string): string {
    try {
      const dn = new Intl.DisplayNames([locale], { type: 'language' });
      const label = dn.of(locale);
      return label ? label.charAt(0).toUpperCase() + label.slice(1) : locale;
    } catch {
      return locale;
    }
  }

  const items = $derived.by(() => {
    const byLocale = new Map(translations.map((t) => [t.locale, t]));
    const source = showMissing && locales.length > 0 ? locales : translations.map((t) => t.locale);
    const label = labelFor ?? defaultLabelFor;
    return source.map((locale) => {
      const translation = byLocale.get(locale) ?? null;
      const urlLang = urlAliases[locale] ?? locale;
      return {
        locale,
        translation,
        href: buildHref(locale, translation, urlLang),
        label: label(locale),
        isCurrent: locale === currentLocale,
        isAvailable: !!translation
      };
    });
  });
</script>

{#if items.length > 0}
  <ul class={`sailor-language-switcher ${className}`.trim()}>
    {#each items as item (item.locale)}
      <li>
        <a
          href={item.href}
          hreflang={item.locale}
          lang={item.locale}
          aria-current={item.isCurrent ? 'page' : undefined}
          data-locale={item.locale}
          data-available={item.isAvailable}
        >
          {item.label}
        </a>
      </li>
    {/each}
  </ul>
{/if}
