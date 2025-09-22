import type { GlobalDefinition } from '$sailor/core/types';

export const categoriesGlobal: GlobalDefinition = {
  name: {
    singular: 'Category',
    plural: 'Categories'
  },
  slug: 'categories',
  description: 'A global taxonomy for organizing content',
  icon: 'FolderTree',
  dataType: 'repeatable',
  options: {
    sortable: true,
    nestable: true
  },
  fields: {
    // Core fields auto-added by generator:
    // - title: string (required, used in CMS overviews)
    // - slug: string (required, unique, for URLs)
    // - status: enum (required, 'draft' | 'published' | 'archived')
    title: {
      label: 'Name',
      position: 'sidebar'
    },
    parent_id: {
      type: 'relation',
      label: 'Parent Category',
      position: 'sidebar',
      description: 'Select a parent category to create a hierarchy',
      relation: {
        type: 'one-to-one',
        targetGlobal: 'categories'
      }
    },
    description: {
      type: 'text',
      label: 'Description',
      position: 'main',
      width: 'full'
    },
    status: {
      position: 'sidebar',
      order: 3,
      override: {
        type: 'select',
        options: [
          { label: 'Active', value: 'active' },
          { label: 'Inactive', value: 'inactive' }
        ],
        default: 'active'
      }
    }
  }
};
