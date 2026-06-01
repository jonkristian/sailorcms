/**
 * Simple SEO utilities for Sailor CMS
 *
 * Works with collections that have `seo: true` enabled to automatically
 * get meta_title, meta_description, og_title, og_description, og_image,
 * canonical_url, and noindex fields.
 */

import { getFile } from '../files/server';
import type { SEOData, CollectionTypes, GlobalTypes } from '../types';

/**
 * Generate page title with site name
 *
 * @example
 * ```typescript
 * const title = generateTitle('About Us', 'My Site');
 * // Returns: "About Us | My Site"
 * ```
 */
export function generateTitle(pageTitle: string, siteName?: string, separator = '|'): string {
  if (!siteName || pageTitle.includes(siteName)) {
    return pageTitle;
  }
  return `${pageTitle} ${separator} ${siteName}`;
}

/**
 * Extract SEO data from a collection item with fallbacks
 *
 * @example
 * ```typescript
 * const post = await getCollection('posts', { slug: 'my-post' });
 * const seo = await extractSEO(post, { siteName: 'My Blog' });
 * ```
 */

// Type for any item that might have SEO fields - flexible to work with any content
// Uses intersection with generated types to ensure consistency
type SEOItemInput = Partial<{
  meta_title: string;
  title: string;
  meta_description: string;
  excerpt: string;
  description: string;
  og_title: string;
  og_description: string;
  og_image: unknown;
  featured_image: unknown;
  image: unknown;
  canonical_url: string;
  slug: string;
  noindex: boolean;
  // Used by og:type='article' enrichment — all optional. `author` is
  // intentionally absent: a row's `author` column tracks who last edited
  // it, not who wrote it, so we don't auto-publish it. Pass `authorName`
  // explicitly via options if a byline should appear.
  created_at: unknown;
  updated_at: unknown;
  published_at: unknown;
  tags: unknown;
}> & {
  [key: string]: any; // Allow any additional fields from collections/globals
};

function toIsoDate(value: unknown): string | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return isNaN(value.getTime()) ? undefined : value.toISOString();
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  return undefined;
}

function extractTagNames(item: SEOItemInput): string[] {
  const raw = item.tags;
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const t of raw) {
    if (typeof t === 'string') out.push(t);
    else if (t && typeof t === 'object') {
      const v =
        (t as { name?: string; title?: string; label?: string }).name ??
        (t as { title?: string }).title ??
        (t as { label?: string }).label;
      if (typeof v === 'string' && v) out.push(v);
    }
  }
  return out;
}

export async function extractSEO(
  item: SEOItemInput,
  options: {
    siteName?: string;
    /** BCP-47 — pass `siteConfig.lang` from `getSiteSettings()`. The static
     *  site language; used as the og:locale fallback when `contentLocale`
     *  isn't provided (i.e. on non-localized sites). */
    siteLang?: string;
    /** BCP-47 content locale for the current request (e.g. `'nb-NO'`). On
     *  localized public sites pass `event.locals.contentLocale` (or the
     *  page-data equivalent) so og:locale matches what the visitor actually
     *  sees — without this, og:locale would always emit the static `siteLang`
     *  and crawlers tag every page with the same language regardless of which
     *  translation rendered. Takes precedence over `siteLang` for og:locale. */
    contentLocale?: string;
    /** og:type — defaults to 'website'. Pass 'article' for blog posts; the helper then auto-derives published_time / modified_time / tags from the item. */
    ogType?: string;
    /** Author display name surfaced as `<meta name=author>` and `article:author`. Pass explicitly — sailor never reads the item's `author` column for this, because that column tracks who last edited the row (which a migration or admin fix can desync from who actually wrote it). */
    authorName?: string;
    /** Absolute URL of the current page (e.g. `${origin}${url.pathname}`). Used as the canonical fallback when `item.canonical_url` is empty so localized pages don't share a single canonical with the default locale's URL — a silent SEO bug otherwise. */
    currentUrl?: string;
    /** Sibling translations of the current item — the same array passed to `<LanguageSwitcher>` / `<HreflangLinks>`. Drafts and the current locale are filtered out; the rest become `og:locale:alternate` tags. */
    translations?: Array<{ locale: string; status?: string | null }>;
  } = {}
): Promise<SEOData> {
  const {
    siteName,
    siteLang,
    contentLocale,
    ogType = 'website',
    authorName,
    currentUrl,
    translations
  } = options;

  // Title with fallbacks: meta_title > title
  let title = item.meta_title || item.title || 'Untitled';
  if (siteName) {
    title = generateTitle(title, siteName);
  }

  // Description with fallbacks: meta_description > excerpt > description
  const description = item.meta_description || item.excerpt || item.description || '';

  // Open Graph with fallbacks
  const ogTitle = item.og_title || item.meta_title || title;
  const ogDescription = item.og_description || item.meta_description || description;

  // OG Image with fallbacks: og_image > featured_image > image
  const ogImage =
    (await fileToUrl(item.og_image)) ||
    (await fileToUrl(item.featured_image)) ||
    (await fileToUrl(item.image));

  // Canonical URL: prefer the consumer's explicit `canonical_url`, fall back
  // to `currentUrl` (the absolute URL of the current request). Without the
  // fallback, localized pages share the default locale's canonical or emit
  // nothing — both are silent SEO bugs (Google collapses duplicates or
  // can't pick a representative). Pass nothing to keep the old opt-in
  // behavior; cross-domain / duplicate-content sites that don't want a
  // self-canonical baked in should just omit `currentUrl`.
  const canonical = item.canonical_url || currentUrl;

  // og:locale:alternate — one per OTHER published translation. Pass the same
  // array fed to <LanguageSwitcher>/<HreflangLinks>; drafts and the current
  // locale are filtered here so the metaTags blob stays consistent with the
  // hreflang tags emitted by the component.
  let localeAlternates: string[] | undefined;
  if (translations && translations.length) {
    const current = contentLocale || siteLang;
    const others = translations
      .filter((t) => t.status !== 'draft' && t.locale !== current)
      .map((t) => t.locale);
    if (others.length) localeAlternates = others;
  }

  // Article-specific enrichment — only meaningful when og:type === 'article'.
  // Always extracted (cheap) but only the meta-tag emitter gates on ogType.
  const publishedTime = toIsoDate(item.published_at) ?? toIsoDate(item.created_at);
  const modifiedTime = toIsoDate(item.updated_at);
  const tags = extractTagNames(item);

  return {
    title,
    description,
    ogTitle,
    ogDescription,
    ogImage,
    canonical,
    noindex: item.noindex === true,
    siteName,
    // `contentLocale` (request-specific, per-translation) wins over `siteLang`
    // (static admin setting). Localized sites get correct per-page og:locale;
    // non-localized sites keep the existing behavior via siteLang fallback.
    siteLang: contentLocale || siteLang,
    localeAlternates,
    ogType,
    publishedTime,
    modifiedTime,
    authorName,
    tags: tags.length ? tags : undefined
  };
}

/**
 * Generate HTML meta tags from SEO data
 *
 * @example
 * ```typescript
 * const seo = extractSEO(post, { siteName: 'My Blog' });
 * const metaTags = generateMetaTags(seo);
 * // Use in svelte:head: {@html metaTags}
 * ```
 */
export function generateMetaTags(seo: SEOData): string {
  const tags: string[] = [];

  // Basic meta tags
  if (seo.title) {
    tags.push(`<title>${escapeHtml(seo.title)}</title>`);
  }

  if (seo.description) {
    tags.push(`<meta name="description" content="${escapeHtml(seo.description)}" />`);
  }

  if (seo.authorName) {
    tags.push(`<meta name="author" content="${escapeHtml(seo.authorName)}" />`);
  }

  if (seo.canonical) {
    tags.push(`<link rel="canonical" href="${escapeHtml(seo.canonical)}" />`);
  }

  if (seo.noindex) {
    tags.push(`<meta name="robots" content="noindex, nofollow" />`);
  }

  // Open Graph
  const ogType = seo.ogType || 'website';
  tags.push(`<meta property="og:type" content="${escapeHtml(ogType)}" />`);

  if (seo.ogTitle) {
    tags.push(`<meta property="og:title" content="${escapeHtml(seo.ogTitle)}" />`);
  }

  if (seo.ogDescription) {
    tags.push(`<meta property="og:description" content="${escapeHtml(seo.ogDescription)}" />`);
  }

  if (seo.ogImage) {
    tags.push(`<meta property="og:image" content="${escapeHtml(seo.ogImage)}" />`);
  }

  if (seo.canonical) {
    tags.push(`<meta property="og:url" content="${escapeHtml(seo.canonical)}" />`);
  }

  if (seo.siteName) {
    tags.push(`<meta property="og:site_name" content="${escapeHtml(seo.siteName)}" />`);
  }

  if (seo.siteLang) {
    // og:locale wants xx_YY format
    tags.push(
      `<meta property="og:locale" content="${escapeHtml(seo.siteLang.replace('-', '_'))}" />`
    );
  }

  if (seo.localeAlternates) {
    for (const locale of seo.localeAlternates) {
      tags.push(
        `<meta property="og:locale:alternate" content="${escapeHtml(locale.replace('-', '_'))}" />`
      );
    }
  }

  // article:* — only meaningful when og:type === 'article'
  if (ogType === 'article') {
    if (seo.publishedTime) {
      tags.push(
        `<meta property="article:published_time" content="${escapeHtml(seo.publishedTime)}" />`
      );
    }
    if (seo.modifiedTime) {
      tags.push(
        `<meta property="article:modified_time" content="${escapeHtml(seo.modifiedTime)}" />`
      );
    }
    if (seo.authorName) {
      tags.push(`<meta property="article:author" content="${escapeHtml(seo.authorName)}" />`);
    }
    if (seo.tags) {
      for (const t of seo.tags) {
        tags.push(`<meta property="article:tag" content="${escapeHtml(t)}" />`);
      }
    }
  }

  // Twitter Card tags
  tags.push(`<meta name="twitter:card" content="summary_large_image" />`);

  if (seo.ogTitle) {
    tags.push(`<meta name="twitter:title" content="${escapeHtml(seo.ogTitle)}" />`);
  }

  if (seo.ogDescription) {
    tags.push(`<meta name="twitter:description" content="${escapeHtml(seo.ogDescription)}" />`);
  }

  if (seo.ogImage) {
    tags.push(`<meta name="twitter:image" content="${escapeHtml(seo.ogImage)}" />`);
  }

  return tags.join('\n  ');
}

/**
 * Generate JSON-LD structured data for an item.
 *
 * Emits one or two `<script type="application/ld+json">` blocks:
 *   - Article / BlogPosting when `type: 'article'`
 *   - BreadcrumbList when `item.breadcrumbs` is populated (set
 *     `includeBreadcrumbs: true` on `getCollections()` to get them).
 *
 * Absolute URLs require `siteUrl` (passing `getSiteSettings().siteUrl` is the
 * canonical wiring). Without it, image / url / breadcrumb fields are skipped
 * gracefully — Google rejects relative URLs in JSON-LD, so it's safer to
 * omit than emit broken data.
 *
 * @example
 * ```typescript
 * const post = await getCollections('posts', { itemSlug, status: 'published', includeBreadcrumbs: true });
 * const siteConfig = await getSiteSettings();
 * const jsonLd = await generateJsonLd(post, {
 *   type: 'article',
 *   siteName: siteConfig.siteName,
 *   siteUrl: siteConfig.siteUrl,
 *   url: siteConfig.siteUrl ? `${siteConfig.siteUrl}${post.url}` : undefined
 * });
 * // {@html jsonLd} in <svelte:head>
 * ```
 */
export async function generateJsonLd(
  item: SEOItemInput & { breadcrumbs?: Array<{ label: string; url: string }>; url?: string },
  options: {
    siteName?: string;
    /** Absolute origin (e.g. 'https://example.com') used to resolve relative paths into absolute URLs. */
    siteUrl?: string;
    /** Article schema when 'article'; nothing emitted for the page-level block on 'website'. Breadcrumbs emit regardless. */
    type?: 'article' | 'website';
    /** Canonical absolute URL of this page. Falls back to `siteUrl + item.url` when both are available. */
    url?: string;
    /** Author display name emitted as the Article's `author.name`. Pass explicitly — sailor doesn't auto-derive from `item.author`, since that column tracks who last edited the row, not who wrote it. */
    authorName?: string;
  } = {}
): Promise<string> {
  const { siteName, siteUrl, type = 'website', authorName } = options;
  const blocks: string[] = [];

  const absolutize = (path: string | undefined): string | undefined => {
    if (!path) return undefined;
    if (/^https?:\/\//i.test(path)) return path;
    if (!siteUrl) return undefined;
    const base = siteUrl.replace(/\/+$/, '');
    return path.startsWith('/') ? `${base}${path}` : `${base}/${path}`;
  };

  const pageUrl =
    options.url ??
    absolutize(typeof item.canonical_url === 'string' ? item.canonical_url : undefined) ??
    absolutize(item.url);

  if (type === 'article') {
    const headline = item.meta_title || item.title || 'Untitled';
    const description = item.meta_description || item.excerpt || item.description || undefined;
    const datePublished = toIsoDate(item.published_at) ?? toIsoDate(item.created_at);
    const dateModified = toIsoDate(item.updated_at);
    const tags = extractTagNames(item);

    // og_image / featured_image / image — same fallback chain as extractSEO
    let imageUrl: string | undefined;
    for (const candidate of [item.og_image, item.featured_image, item.image]) {
      const url = await fileToUrl(candidate);
      if (url) {
        imageUrl = absolutize(url) ?? (/^https?:\/\//i.test(url) ? url : undefined);
        if (imageUrl) break;
      }
    }

    const article: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline
    };
    if (description) article.description = description;
    if (imageUrl) article.image = imageUrl;
    if (datePublished) article.datePublished = datePublished;
    if (dateModified) article.dateModified = dateModified;
    if (authorName) article.author = { '@type': 'Person', name: authorName };
    if (siteName) article.publisher = { '@type': 'Organization', name: siteName };
    if (pageUrl) article.mainEntityOfPage = { '@type': 'WebPage', '@id': pageUrl };
    if (tags.length) article.keywords = tags.join(', ');

    blocks.push(renderJsonLdBlock(article));
  }

  if (Array.isArray(item.breadcrumbs) && item.breadcrumbs.length > 0 && siteUrl) {
    const itemListElement = item.breadcrumbs.map((crumb, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: crumb.label,
      item: absolutize(crumb.url)
    }));
    // Append the current page as the tail if we have a url + title for it
    if (pageUrl && (item.title || item.meta_title)) {
      itemListElement.push({
        '@type': 'ListItem',
        position: itemListElement.length + 1,
        name: item.meta_title || item.title || '',
        item: pageUrl
      });
    }
    const breadcrumbList = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement
    };
    blocks.push(renderJsonLdBlock(breadcrumbList));
  }

  return blocks.join('\n  ');
}

function renderJsonLdBlock(data: Record<string, unknown>): string {
  // JSON inside a <script> needs `</` escaped to avoid prematurely closing the tag.
  const json = JSON.stringify(data).replace(/<\//g, '<\\/');
  return `<script type="application/ld+json">${json}</script>`;
}

/** Same fallback shape as extractSEO's getFileUrl, but factored out so generateJsonLd reuses it. */
async function fileToUrl(fileObj: unknown): Promise<string> {
  if (!fileObj) return '';
  if (typeof (fileObj as { url?: string }).url === 'string')
    return (fileObj as { url: string }).url;
  if (Array.isArray(fileObj) && fileObj.length > 0) return fileToUrl(fileObj[0]);
  if (typeof fileObj === 'string' && fileObj.match(/^[0-9a-f-]{36}$/i)) {
    try {
      return await getFile(fileObj);
    } catch {
      return '';
    }
  }
  if (typeof fileObj === 'string' && fileObj.startsWith('http')) return fileObj;
  return '';
}

/**
 * Escape HTML entities for safe output
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
