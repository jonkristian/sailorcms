import type { GlobalDefinition } from '$sailor/core/types';

export const menusGlobal: GlobalDefinition = {
  name: {
    singular: 'Menu',
    plural: 'Menus'
  },
  slug: 'menus',
  description: 'Navigation menus for the site',
  icon: 'Menu',
  dataType: 'relational',
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
    items: {
      type: 'array',
      label: 'Menu Items',
      nestable: true,
      position: 'main',
      width: 'full',
      expandable: true,
      collapsible: true,
      items: {
        type: 'object',
        label: 'Menu Item',
        properties: {
          label: {
            type: 'string',
            label: 'Title',
            required: true
          },
          url: {
            type: 'string',
            label: 'URL',
            required: true
          },
          target: {
            type: 'select',
            label: 'Target',
            options: [
              { label: 'Same Window', value: '_self' },
              { label: 'New Window', value: '_blank' }
            ]
          }
        }
      }
    }
  }
};
