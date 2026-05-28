import { getCollections, getSiteSettings } from 'sailorcms/utils/index';
import { extractSEO, generateMetaTags, generateJsonLd } from 'sailorcms/utils/content/seo';
import type { CollectionsSingleResult } from 'sailorcms/utils/types';
import type { Page } from '$sailor/generated/types';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  // Get single page by slug using new clean API
  const page = (await getCollections('pages', {
    itemSlug: params.slug,
    status: 'published',
    includeBlocks: true // Include blocks for page content
  })) as CollectionsSingleResult<Page>;

  if (!page) {
    throw error(404, 'Page not found');
  }

  // Get site configuration for proper site name
  const siteConfig = await getSiteSettings();

  const seoData = await extractSEO(page, {
    siteName: siteConfig.siteName || 'Sailor CMS',
    siteLang: siteConfig.siteLang
    // ogType defaults to 'website' — pages aren't articles
  });

  // Generate HTML meta tags for the head
  const metaTags = generateMetaTags(seoData);

  // JSON-LD: BreadcrumbList only (no Article block for plain pages)
  const jsonLd = await generateJsonLd(page, {
    siteName: siteConfig.siteName,
    siteUrl: siteConfig.siteUrl
  });

  return {
    page, // Automatically includes .url and .breadcrumbs properties
    blocks: page.blocks || [], // Blocks are loaded when withRelations: true
    seoData,
    metaTags,
    jsonLd
  };
};
