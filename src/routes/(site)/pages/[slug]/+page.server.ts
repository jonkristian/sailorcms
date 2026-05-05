import { getCollections, getSiteSettings } from 'sailorcms/utils/index';
import { extractSEO, generateMetaTags } from 'sailorcms/utils/content/seo';
import type { CollectionsSingleResult } from 'sailorcms/utils/types';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  // Get single page by slug using new clean API
  const page = (await getCollections('pages', {
    itemSlug: params.slug,
    status: 'published',
    includeBlocks: true // Include blocks for page content
  })) as CollectionsSingleResult;

  if (!page) {
    throw error(404, 'Page not found');
  }

  // Get site configuration for proper site name
  const siteConfig = await getSiteSettings();

  const seoData = await extractSEO(page, {
    siteName: siteConfig.siteName || 'Sailor CMS'
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
