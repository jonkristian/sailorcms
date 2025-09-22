import {
  getCollectionItem,
  getCollectionItems,
  extractSEO,
  generateMetaTags,
  getSiteSettings
} from '$sailor/utils/index';
import { getCollectionOptions } from '$sailor/core/utils/db.server';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url }) => {
  // Get blog post by slug using new clean API
  const post = await getCollectionItem('posts', {
    query: 'slug',
    value: params.slug,
    status: 'published'
  });

  if (!post) {
    throw error(404, 'Post not found');
  }

  // Get related posts (exclude current)
  const relatedPostsResult = await getCollectionItems('posts', {
    status: 'published',
    includeBlocks: false, // Better performance for related posts
    limit: 4 // Get 4 so we can filter out current and still have 3
  });

  const relatedPosts = relatedPostsResult.items.filter((p: any) => p.id !== post.id).slice(0, 3);

  // Get site configuration for proper site name
  const siteConfig = await getSiteSettings();

  // Generate SEO data using basePath from database
  const baseUrl = url.origin;
  const postsOptions = await getCollectionOptions('posts');
  const basePath = postsOptions?.basePath || '/posts/';

  const seoData = await extractSEO(post, {
    siteName: siteConfig.siteName || 'Sailor CMS',
    baseUrl,
    basePath
  });

  // Generate HTML meta tags for the head
  const metaTags = generateMetaTags(seoData);

  return {
    post, // Automatically includes .url property
    relatedPosts, // Each item automatically includes .url property
    seoData,
    metaTags,
    siteConfig
  };
};
