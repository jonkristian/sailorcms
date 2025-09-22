import {
  getCollectionItem,
  extractSEO,
  generateMetaTags,
  getSiteSettings
} from '$sailor/utils/index';
import { getCollectionOptions } from '$sailor/core/utils/db.server';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url }) => {
  // Get single page by slug using new clean API
  const page = await getCollectionItem('pages', {
    query: 'slug',
    value: params.slug,
    status: 'published',
    includeBlocks: true // Include blocks for page content
  });

  if (!page) {
    throw error(404, 'Page not found');
  }

  // Get site configuration for proper site name
  const siteConfig = await getSiteSettings();

  // Generate SEO data using basePath from database
  const baseUrl = url.origin;
  const collectionOptions = await getCollectionOptions('pages');
  const basePath = collectionOptions?.basePath || '/';

  const seoData = await extractSEO(page, {
    siteName: siteConfig.siteName || 'Sailor CMS',
    baseUrl,
    basePath
  });

  // Generate HTML meta tags for the head
  const metaTags = generateMetaTags(seoData);

  return {
    page, // Automatically includes .url and .breadcrumbs properties
    blocks: page.blocks || [], // Blocks are loaded when withRelations: true
    seoData,
    metaTags
  };
};
