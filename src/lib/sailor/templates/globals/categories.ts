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
        type: 'one-to-many',
        targetGlobal: 'categories'
      }
    },
    description: {
      type: 'text',
      label: 'Description',
      position: 'main',
      width: 'full'
    },
    image: {
      type: 'file',
      label: 'Image',
      position: 'main',
      width: 'full',
      items: {
        fileType: 'image',
        accept: 'image/*'
      }
    },
    status: {
      type: 'select',
      label: 'Status',
      position: 'sidebar',
      order: 3,
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Inactive', value: 'inactive' }
      ],
      default: 'active'
    }
  }
};
