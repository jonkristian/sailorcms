import type { GlobalDefinition } from '$sailor/core/types';

export const detailsGlobal: GlobalDefinition = {
  name: {
    singular: 'Site Details',
    plural: 'Site Details'
  },
  slug: 'details',
  description: 'Various static information for your website',
  icon: 'Globe',
  dataType: 'flat',
  fields: {
    email: {
      type: 'string',
      label: 'Contact Email',
      position: 'main'
    },
    address: {
      type: 'wysiwyg',
      label: 'Address',
      position: 'main'
    },
    socialMedia: {
      type: 'array',
      label: 'Social Media Links',
      position: 'main',
      order: 2,
      description: 'Add links to your social media profiles',
      items: {
        type: 'object',
        label: 'Social Media Platform',
        properties: {
          title: {
            type: 'string',
            label: 'Platform Name',
            required: true
          },
          url: {
            type: 'string',
            label: 'URL',
            required: true
          }
        }
      }
    },
    footerText: {
      type: 'string',
      label: 'Footer Copyright Text',
      position: 'main',
      description: 'Custom text to display in the footer'
    }
  }
};
