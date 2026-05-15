import { getCollections, getSiteSettings } from 'sailorcms/utils/index';
import { extractSEO, generateMetaTags, generateJsonLd } from 'sailorcms/utils/content/seo';
import type { CollectionsSingleResult, CollectionsMultipleResult } from 'sailorcms/utils/types';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  // Get blog post by slug using new clean API
  const post = (await getCollections('posts', {
    itemSlug: params.slug,
    status: 'published',
    includeAuthors: true // populates `post.author` with { id, name, email } for the byline below
  })) as CollectionsSingleResult;

  if (!post) {
    throw error(404, 'Post not found');
  }

  // Get related posts (exclude current)
  const relatedPostsResult = (await getCollections('posts', {
    status: 'published',
    includeBlocks: false, // Better performance for related posts
    limit: 4 // Get 4 so we can filter out current and still have 3
  })) as CollectionsMultipleResult;

  const relatedPosts = relatedPostsResult.items.filter((p) => p.id !== post.id).slice(0, 3);

  // Get site configuration for proper site name
  const siteConfig = await getSiteSettings();

  // Author byline is opt-in — sailor never auto-publishes the editor's name.
  // For a small personal blog where author === editor that's fine; on a multi-author
  // site you'd want a per-post `byline` field instead so it's stable across edits.
  const authorName =
    post.author && typeof post.author === 'object'
      ? (post.author as { name?: string }).name
      : undefined;

  const seoData = await extractSEO(post, {
    siteName: siteConfig.siteName || 'Sailor CMS',
    siteLang: siteConfig.siteLang,
    ogType: 'article',
    authorName
  });

  // Generate HTML meta tags for the head
  const metaTags = generateMetaTags(seoData);

  // JSON-LD structured data (BlogPosting + BreadcrumbList when breadcrumbs present)
  const jsonLd = await generateJsonLd(post, {
    type: 'article',
    siteName: siteConfig.siteName,
    siteUrl: siteConfig.siteUrl,
    authorName
  });

  return {
    post, // Automatically includes .url property
    relatedPosts, // Each item automatically includes .url property
    seoData,
    metaTags,
    jsonLd,
    siteConfig
  };
};
