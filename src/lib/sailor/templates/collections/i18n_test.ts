import type { CollectionDefinition } from 'sailorcms/core/types';

// Throwaway collection for smoke-testing the Phase 2a localized read path.
// Delete this file (and remove from index.ts) once we're confident the
// schema split + read API behave correctly end-to-end.
export const i18nTestCollection: CollectionDefinition = {
  name: {
    singular: 'I18n Test',
    plural: 'I18n Tests'
  },
  slug: 'i18n_test',
  description: 'Throwaway collection for testing localized reads',
  icon: 'Languages',
  localized: true,
  options: {
    titleField: 'title',
    seo: false,
    blocks: true,
    searchable: false
  },
  fields: {
    sort: {
      hidden: true
    },
    content: {
      type: 'wysiwyg',
      label: 'Content',
      position: 'main'
    },
    featured_image: {
      type: 'file',
      label: 'Featured Image',
      items: {
        fileType: 'image',
        accept: 'image/*'
      }
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
