import type { GlobalDefinition } from '$sailor/core/types';

export const faqGlobal: GlobalDefinition = {
  name: {
    singular: 'FAQ',
    plural: 'FAQs'
  },
  slug: 'faq',
  description: 'Frequently asked questions',
  icon: 'HelpCircle',
  dataType: 'repeatable',
  options: {
    sortable: true,
    inline: true,
    titleField: 'title'
  },
  fields: {
    // Core fields auto-added by generator:
    // - title: string (required, used in CMS overviews)
    // - slug: string (required, unique, for URLs)
    // - status: enum (required, 'draft' | 'published' | 'archived')
    title: {
      label: 'Question',
      position: 'main'
    },
    answer: {
      type: 'textarea',
      label: 'Answer',
      required: true,
      position: 'main'
    },
    tags: {
      type: 'tags',
      label: 'Tags',
      position: 'sidebar',
      description: 'Tag this FAQ for better organization and filtering'
    },
    featured: {
      type: 'boolean',
      label: 'Featured',
      default: false,
      position: 'sidebar',
      description: 'Show this FAQ prominently on the page'
    }
  }
};
