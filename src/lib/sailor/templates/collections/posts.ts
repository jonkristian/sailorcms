import type { CollectionDefinition } from '$sailor/core/types';

export const postsCollection: CollectionDefinition = {
  name: {
    singular: 'Post',
    plural: 'Posts'
  },
  slug: 'posts',
  description: 'A collection of blog posts with rich text content',
  icon: 'FileText',
  options: {
    titleField: 'title',
    seo: true,
    blocks: false, // Disable blocks for simple post structure
    basePath: '/blog/' // Preview links will use /blog/slug instead of /posts/slug
  },
  fields: {
    // Core fields auto-added by generator:
    // - title: string (required, used in CMS overviews)
    // - slug: string (required, unique, for URLs)
    // - status: enum (required, 'draft' | 'published' | 'archived')
    // - id: string (UUID primary key)
    // - sort: number (manual ordering)
    // - created_at/updated_at: datetime (auto-managed)
    // - author: string (user ID)
    // - last_modified_by: string (user ID)
    sort: {
      hidden: true
    },
    content: {
      type: 'wysiwyg',
      label: 'Content',
      showLabel: false,
      position: 'main'
    },
    excerpt: {
      type: 'textarea',
      label: 'Excerpt',
      position: 'main'
    },
    categories: {
      type: 'relation',
      label: 'Categories',
      relation: {
        type: 'many-to-many',
        targetGlobal: 'categories'
      }
    },
    tags: {
      type: 'tags',
      label: 'Tags'
    }
  }
};
