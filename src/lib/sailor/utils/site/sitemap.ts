// Localized sitemap generator. Reads collections via the public read API,
// builds per-locale `<url>` entries with `xhtml:link rel="alternate" hreflang`
// alternates (the Google-recommended shape: one `<url>` per language version,
// each carrying the full set of alternates so any crawled URL has complete
// hreflang context).
//
// Server-only — uses `getCollections` which pulls in the DB layer. Lives in
// `utils/site` rather than `utils/data` because it composes data reads into a
// site-level artifact, not a primitive query.

import { getCollections } from '../data/collections';
import { getContentSettings, buildLocaleHref, buildLocalePath } from '../../core/settings/i18n';
import { getHomeConfig } from '../../core/settings/home';

export type ChangeFreq = 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';

export interface SitemapCollectionEntry {
  /** Collection slug as declared in `templates/collections/`. */
  slug: string;
  /**
   * Where the items live in the public URL space — `'/blog'` for
   * `/blog/[slug]` routes, `'/'` for top-level `/[slug]` pages. Feeds into
   * `buildLocaleHref({ section, ... })` so the right locale prefix gets
   * applied per `urlStrategy`.
   */
  routePattern: string;
  /**
   * Slug of the item that represents the locale home (`/` and `/<urlLang>`).
   * Items matching this slug emit URLs at the locale root instead of
   * `/<section>/<slug>` — so a `pages` collection with a `'home'` item
   * doesn't get rendered as `/pages/home`.
   *
   * Usually you don't need to pass this per-collection — declare
   * `content.home = { collectionSlug, itemSlug }` in `templates/settings.ts`
   * once and the sitemap auto-applies it to the matching collection. The
   * per-call option stays as an override (e.g. `homeSlug: undefined`
   * explicitly to opt OUT of the global declaration for this collection).
   *
   * Same papercut family as `<HreflangLinks routeShape="home">` /
   * `<LanguageSwitcher routeShape="flat">` on the home page — the home
   * row carries a slug that the default `/<section>/<slug>` shape renders
   * wrong, so we special-case it.
   *
   * When set, the home item also pairs naturally with dropping
   * `extraUrls: [{ path: '/' }]` from your config — the home is now part
   * of the collection enumeration with full hreflang alternates.
   */
  homeSlug?: string;
  /** Optional `<changefreq>` value applied to every URL emitted for this
   *  collection. Omit unless your search-engine partner asks for it (most
   *  modern crawlers ignore it). */
  changefreq?: ChangeFreq;
  /** Optional `<priority>` value (0.0–1.0) applied to every URL for this
   *  collection. Same caveat as `changefreq`. */
  priority?: number;
  /**
   * Cap on items read from this collection. Defaults to 50,000 — the
   * per-sitemap URL limit in the sitemap spec. Set lower if you only want
   * a recent slice; raise + split into multiple sitemaps via a sitemap
   * index file if you exceed it.
   */
  limit?: number;
}

export interface SitemapExtraUrl {
  /** Path portion only (e.g. `'/about'`, `'/'`). The helper prepends `origin`. */
  path: string;
  /** When true, emits one `<url>` per configured content locale with full
   *  hreflang alternates. Use for static localized pages like the homepage
   *  or `/contact`. Defaults to false (single `<url>`, no alternates). */
  localized?: boolean;
  lastmod?: Date | string;
  changefreq?: ChangeFreq;
  priority?: number;
}

export interface GenerateLocalizedSitemapOptions {
  /** Absolute origin (e.g. `'https://example.com'`). Required — sitemap URLs
   *  must be absolute per the spec. Typically pass `url.origin` from your
   *  `+server.ts` handler. */
  origin: string;
  /** Collections to enumerate. Each is read with `includeTranslations: true`
   *  + `status: 'published'`; localized collections emit one `<url>` per
   *  available translation, non-localized emit one `<url>` per item. */
  collections?: SitemapCollectionEntry[];
  /** Static URLs that aren't backed by a collection (homepage, contact, etc.).
   *  Set `localized: true` on entries that should fan out to every locale. */
  extraUrls?: SitemapExtraUrl[];
  /**
   * Strict mode: only emit URLs for translations that carry a non-empty
   * slug (default `false`). Under the default (lenient), an auto-created or
   * empty `_locales` row still produces a `<url>` entry — useful as a
   * "this locale is coming" signal to crawlers, and the URL still resolves
   * under `fallback: 'default'`. Set `true` to drop the home-item slug
   * carve-out and require a concrete slug on every translation — production
   * sites whose translation sets have stabilized usually want this on so
   * the sitemap stops advertising placeholder URLs.
   *
   * Parallel to `fallback: 'strict'` on the data loaders — same word, same
   * intent ("only what's real"), different surface (write-time sitemap
   * filter vs read-time row resolution).
   */
  strictTranslations?: boolean;
}

/**
 * Generate an XML sitemap with `xhtml:link rel="alternate" hreflang"` alternates
 * for localized content. One-line consumer call from a `sitemap.xml/+server.ts`:
 *
 * ```ts
 * import { generateLocalizedSitemap } from 'sailorcms/utils/site';
 *
 * export const GET = async ({ url }) => {
 *   const xml = await generateLocalizedSitemap({
 *     origin: url.origin,
 *     collections: [
 *       { slug: 'pages', routePattern: '/' },
 *       { slug: 'posts', routePattern: '/blog' }
 *     ],
 *     extraUrls: [{ path: '/', localized: true, changefreq: 'weekly' }]
 *   });
 *   return new Response(xml, {
 *     headers: { 'Content-Type': 'application/xml; charset=utf-8' }
 *   });
 * };
 * ```
 *
 * Output: standard `<urlset>` with `xmlns:xhtml`. For localized items, emits
 * one `<url>` per available translation, each carrying the full set of
 * alternates (Google's documented pattern). Skips drafts. Non-localized
 * collections emit one plain `<url>` per item. Safe to call when i18n isn't
 * configured — it falls back to a single-locale sitemap.
 */
export async function generateLocalizedSitemap(
  options: GenerateLocalizedSitemapOptions
): Promise<string> {
  const { origin, collections = [], extraUrls = [], strictTranslations = false } = options;
  const { locales = [], defaultLocale, urlAliases = {}, urlStrategy } = getContentSettings();
  const hasI18n = Boolean(defaultLocale && locales.length > 0);
  const homeConfig = getHomeConfig();

  const entries: SitemapUrlEntry[] = [];

  for (const collection of collections) {
    // Per-call `homeSlug` wins if the key is present (any value — including
    // `undefined` — opts out of the global declaration for this entry).
    // Otherwise pick up the global `content.home` automatically when the
    // collection matches. Lets the sitemap stay zero-config for the common
    // case while leaving an explicit override path open.
    const hasExplicitHomeSlug = 'homeSlug' in collection;
    const resolvedHomeSlug = hasExplicitHomeSlug
      ? collection.homeSlug
      : homeConfig?.collectionSlug === collection.slug
        ? homeConfig.itemSlug
        : undefined;
    const resolvedCollection: SitemapCollectionEntry = hasExplicitHomeSlug
      ? collection
      : { ...collection, homeSlug: resolvedHomeSlug };
    const items = await readCollectionForSitemap(resolvedCollection);
    for (const item of items) {
      entries.push(
        ...itemToUrlEntries(item, resolvedCollection, {
          origin,
          locales,
          defaultLocale,
          urlAliases,
          urlStrategy,
          hasI18n,
          strictTranslations
        })
      );
    }
  }

  for (const extra of extraUrls) {
    if (extra.localized && hasI18n) {
      // extraUrls.path is a LITERAL URL pattern (`/blog`, `/contact`, `/`) —
      // route it through `buildLocalePath`, NOT `buildLocaleHref` (which
      // expects /<section>/<slug> and would glue path-as-section to
      // path-as-slug, emitting `/blog/blog`).
      const localized = (locale: string) =>
        buildLocalePath(extra.path, locale, {
          strategy: urlStrategy,
          defaultLocale: defaultLocale ?? undefined,
          urlAliases
        });
      const alternates: Array<{ hreflang: string; href: string }> = locales.map((locale) => ({
        hreflang: locale,
        href: `${origin}${localized(locale)}`
      }));
      if (defaultLocale && locales.includes(defaultLocale)) {
        alternates.push({ hreflang: 'x-default', href: `${origin}${localized(defaultLocale)}` });
      }
      for (const locale of locales) {
        entries.push({
          loc: `${origin}${localized(locale)}`,
          lastmod: formatLastmod(extra.lastmod),
          changefreq: extra.changefreq,
          priority: extra.priority,
          alternates
        });
      }
    } else {
      entries.push({
        loc: `${origin}${extra.path}`,
        lastmod: formatLastmod(extra.lastmod),
        changefreq: extra.changefreq,
        priority: extra.priority,
        alternates: []
      });
    }
  }

  return renderSitemapXml(dedupeByLoc(entries));
}

/**
 * Collapse same-`<loc>` entries to one — a stray `extraUrls: [{ path: '/' }]`
 * that overlaps with a collection's home item, or any other multi-source
 * collision, would otherwise emit duplicate URLs (Google Search Console
 * flags those as errors). For each collision, keep the entry with the
 * larger alternates set (a localized collection item with full hreflang
 * siblings beats a bare extraUrl). Order is preserved.
 */
function dedupeByLoc(entries: SitemapUrlEntry[]): SitemapUrlEntry[] {
  const byLoc = new Map<string, SitemapUrlEntry>();
  for (const entry of entries) {
    const existing = byLoc.get(entry.loc);
    if (!existing || entry.alternates.length > existing.alternates.length) {
      byLoc.set(entry.loc, entry);
    }
  }
  return Array.from(byLoc.values());
}

// --- internals ---

interface SitemapUrlEntry {
  loc: string;
  lastmod?: string;
  changefreq?: ChangeFreq;
  priority?: number;
  alternates: Array<{ hreflang: string; href: string }>;
}

interface CollectionItemForSitemap {
  slug?: string | null;
  updated_at?: Date | string | null;
  translations?: Array<{
    locale: string;
    slug: string | null;
    status: string | null;
    updated_at?: Date | string | null;
  }>;
}

async function readCollectionForSitemap(
  collection: SitemapCollectionEntry
): Promise<CollectionItemForSitemap[]> {
  const result = await getCollections(collection.slug, {
    status: 'published',
    includeTranslations: true,
    includeBlocks: false,
    limit: collection.limit ?? 50000
  });
  return (result as { items: CollectionItemForSitemap[] }).items ?? [];
}

function itemToUrlEntries(
  item: CollectionItemForSitemap,
  collection: SitemapCollectionEntry,
  ctx: {
    origin: string;
    locales: string[];
    defaultLocale: string | undefined;
    urlAliases: Record<string, string>;
    urlStrategy: 'default-at-root' | 'symmetric';
    hasI18n: boolean;
    strictTranslations: boolean;
  }
): SitemapUrlEntry[] {
  const lastmod = formatLastmod(item.updated_at);
  const section =
    collection.routePattern === '/' ? undefined : trimSlashes(collection.routePattern);
  // The home item gets locale-root URLs (/, /no) instead of /<section>/<slug>.
  // Match by either the main row slug (non-localized) or any translation
  // carrying homeSlug — homeSlug is an opt-in convention, so a loose match
  // is fine; consumers don't set it unless they mean it.
  const isHomeItem =
    !!collection.homeSlug &&
    (item.slug === collection.homeSlug ||
      !!item.translations?.some((t) => t.slug === collection.homeSlug));

  // Non-localized item OR site without i18n: one URL, no alternates. Skip
  // items without a slug (no public URL exists), unless this is the home
  // item (URL is `/` regardless of slug).
  if (!ctx.hasI18n || !item.translations || item.translations.length === 0) {
    if (!item.slug && !isHomeItem) return [];
    const path = isHomeItem ? '/' : section ? `/${section}/${item.slug}` : `/${item.slug}`;
    return [
      {
        loc: `${ctx.origin}${path}`,
        lastmod,
        changefreq: collection.changefreq,
        priority: collection.priority,
        alternates: []
      }
    ];
  }

  // Localized item: emit one <url> per published translation, each carrying
  // the full alternate set. Skip drafts; skip rows without a slug. The home
  // carve-out (`isHomeItem || t.slug !== null`) lets translations without a
  // slug ride along on home items since the URL doesn't use the slug —
  // strict mode (`strictTranslations: true`) drops that carve-out, so an
  // auto-created/empty translation stops emitting a "this locale is coming"
  // placeholder URL.
  const allowMissingSlug = !ctx.strictTranslations && isHomeItem;
  const published = item.translations.filter(
    (t) => t.status !== 'draft' && (allowMissingSlug || t.slug !== null)
  );
  if (published.length === 0) return [];

  const alternates = buildAlternates({
    locales: ctx.locales,
    defaultLocale: ctx.defaultLocale as string,
    urlAliases: ctx.urlAliases,
    urlStrategy: ctx.urlStrategy,
    origin: ctx.origin,
    section: isHomeItem ? undefined : section,
    translations: published,
    forceHome: isHomeItem
  });

  return published.map((t) => {
    const path = buildLocaleHref({
      locale: t.locale,
      // Home items coerce translation → null so any slug ('home', 'index')
      // the row carries is ignored and the helper returns the locale root.
      translation: isHomeItem ? null : t,
      section: isHomeItem ? undefined : section,
      strategy: ctx.urlStrategy,
      defaultLocale: ctx.defaultLocale as string,
      urlAliases: ctx.urlAliases
    });
    return {
      loc: `${ctx.origin}${path}`,
      // Per-translation freshness — the nb-NO URL's lastmod is when the
      // nb-NO row was last touched, not the parent's. Falls back to the
      // parent item's lastmod if the translation doesn't carry one (older
      // includeTranslations payload, defensive shape).
      lastmod: formatLastmod(t.updated_at) ?? lastmod,
      changefreq: collection.changefreq,
      priority: collection.priority,
      alternates
    };
  });
}

function buildAlternates(args: {
  locales: string[];
  defaultLocale: string;
  urlAliases: Record<string, string>;
  urlStrategy: 'default-at-root' | 'symmetric';
  origin: string;
  section: string | undefined;
  translations: Array<{
    locale: string;
    slug: string | null;
    status: string | null;
    updated_at?: Date | string | null;
  }>;
  /** Coerce translation→null for every entry so all alternates resolve to
   *  the locale root — used for sitemap rows representing the home item.
   *  Set by `itemToUrlEntries` when `collection.homeSlug` matches. */
  forceHome?: boolean;
}): Array<{ hreflang: string; href: string }> {
  const byLocale = new Map(args.translations.map((t) => [t.locale, t]));
  const hrefFor = (t: { locale: string; slug: string | null }): string => {
    const path = buildLocaleHref({
      locale: t.locale,
      translation: args.forceHome ? null : t,
      section: args.forceHome ? undefined : args.section,
      strategy: args.urlStrategy,
      defaultLocale: args.defaultLocale,
      urlAliases: args.urlAliases
    });
    return `${args.origin}${path}`;
  };
  const alternates: Array<{ hreflang: string; href: string }> = [];
  for (const t of args.translations) {
    alternates.push({ hreflang: t.locale, href: hrefFor(t) });
  }
  const def = byLocale.get(args.defaultLocale);
  if (def) {
    alternates.push({ hreflang: 'x-default', href: hrefFor(def) });
  }
  return alternates;
}

function renderSitemapXml(entries: SitemapUrlEntry[]): string {
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">'
  ];
  for (const entry of entries) {
    lines.push('  <url>');
    lines.push(`    <loc>${escapeXml(entry.loc)}</loc>`);
    if (entry.lastmod) lines.push(`    <lastmod>${entry.lastmod}</lastmod>`);
    if (entry.changefreq) lines.push(`    <changefreq>${entry.changefreq}</changefreq>`);
    if (entry.priority !== undefined) {
      lines.push(`    <priority>${entry.priority.toFixed(1)}</priority>`);
    }
    for (const alt of entry.alternates) {
      lines.push(
        `    <xhtml:link rel="alternate" hreflang="${escapeXml(alt.hreflang)}" href="${escapeXml(alt.href)}"/>`
      );
    }
    lines.push('  </url>');
  }
  lines.push('</urlset>');
  return lines.join('\n');
}

function formatLastmod(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  // W3C Datetime — date-only form is valid and sufficient for sitemaps.
  return d.toISOString().slice(0, 10);
}

function trimSlashes(s: string): string {
  return s.replace(/^\/+|\/+$/g, '');
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
