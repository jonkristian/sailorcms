import type { CollectionDefinition } from '$sailor/core/types';

export const pagesCollection: CollectionDefinition = {
  name: {
    singular: 'Page',
    plural: 'Pages'
  },
  slug: 'pages',
  description: 'A collection of pages with flexible content blocks',
  icon: 'Layout',
  options: {
    titleField: 'title',
    seo: true,
    blocks: true, // Enable blocks for flexible page layouts
    sortable: true, // Enable sortable up/down reordering for pages
    nestable: true // Enable hierarchical parent-child relationships for pages
  },
  fields: {
    // Core fields auto-added by generator:
    // - title: string (required, used in CMS overviews)
    // - slug: string (required, unique, for URLs)
    // - status: enum (required, 'draft' | 'published' | 'archived')
    // - id: string (UUID primary key)
    // - sort: number (manual ordering)
    // - parent_id: string (for hierarchical relationships when nestable: true)
    // - created_at/updated_at: datetime (auto-managed)
    // - author: string (user ID)
    // - last_modified_by: string (user ID)
    title: {
      position: 'main'
    },
    content: {
      type: 'wysiwyg',
      showLabel: false,
      position: 'main'
    },
    featured_image: {
      type: 'file',
      label: 'Featured Image',
      file: {
        fileType: 'image',
        accept: 'image/*'
      }
    },
    excerpt: {
      type: 'textarea',
      label: 'Excerpt',
      description: 'Enter a short description of the page'
    },
    tags: {
      type: 'tags',
      label: 'Tags',
      description: 'Add tags to help organize and categorize this page'
    }
  }
};
