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
 * const seo = await extractSEO(post, { siteName: 'My Blog', basePath: '/articles/' });
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
}> & {
  [key: string]: any; // Allow any additional fields from collections/globals
};

export async function extractSEO(
  item: SEOItemInput,
  options: { siteName?: string; baseUrl?: string; basePath?: string } = {}
): Promise<SEOData> {
  const { siteName, baseUrl, basePath } = options;

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
  let ogImage = '';

  // Helper function to extract URL from different file object structures
  const getFileUrl = async (fileObj: unknown): Promise<string> => {
    if (!fileObj) return '';

    // Direct URL property (already resolved file object)
    if (typeof (fileObj as { url?: string }).url === 'string')
      return (fileObj as { url: string }).url;

    // Array of file objects (take first)
    if (Array.isArray(fileObj) && fileObj.length > 0) {
      return getFileUrl(fileObj[0]);
    }

    // File UUID string (needs resolution)
    if (typeof fileObj === 'string' && fileObj.match(/^[0-9a-f-]{36}$/i)) {
      try {
        return await getFile(fileObj);
      } catch (error) {
        console.warn('Failed to resolve file UUID:', fileObj, error);
        return '';
      }
    }

    // Direct URL string
    if (typeof fileObj === 'string' && fileObj.startsWith('http')) {
      return fileObj;
    }

    return '';
  };

  // Try to get OG image from multiple sources
  ogImage =
    (await getFileUrl(item.og_image)) ||
    (await getFileUrl(item.featured_image)) ||
    (await getFileUrl(item.image));

  // Canonical URL: custom canonical_url or generate from slug and basePath
  let canonical = item.canonical_url;
  if (!canonical && item.slug && baseUrl) {
    // Use basePath if provided, otherwise fallback to just slug
    if (basePath) {
      canonical = `${baseUrl.replace(/\/$/, '')}${basePath}${item.slug}`;
    } else {
      canonical = `${baseUrl.replace(/\/$/, '')}/${item.slug}`;
    }
  }

  return {
    title,
    description,
    ogTitle,
    ogDescription,
    ogImage,
    canonical,
    noindex: item.noindex === true,
    siteName
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
  const tags = [];

  // Basic meta tags
  if (seo.title) {
    tags.push(`<title>${escapeHtml(seo.title)}</title>`);
  }

  if (seo.description) {
    tags.push(`<meta name="description" content="${escapeHtml(seo.description)}" />`);
  }

  if (seo.canonical) {
    tags.push(`<link rel="canonical" href="${escapeHtml(seo.canonical)}" />`);
  }

  if (seo.noindex) {
    tags.push(`<meta name="robots" content="noindex, nofollow" />`);
  }

  // Open Graph tags
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
