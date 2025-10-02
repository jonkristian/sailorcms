export const servicesBlock = {
  name: 'Services Section',
  slug: 'services',
  description: 'A grid of services with images, titles, descriptions, and call-to-action buttons',
  options: {
    titleField: 'title'
  },
  fields: {
    title: {
      type: 'string',
      required: true,
      label: 'Section Title'
    },
    subtitle: {
      type: 'string',
      label: 'Section Subtitle'
    },
    services: {
      type: 'array',
      required: true,
      label: 'Services',
      items: {
        type: 'object',
        label: 'Service',
        properties: {
          title: {
            type: 'string',
            required: true,
            label: 'Title'
          },
          description: {
            type: 'text',
            required: true,
            label: 'Description'
          },
          image: {
            type: 'file',
            label: 'Image',
            items: {
              fileType: 'image'
            }
          },
          cta: {
            type: 'array',
            label: 'CTA Links',
            items: {
              type: 'object',
              label: 'Link',
              properties: {
                title: {
                  type: 'string',
                  label: 'Text'
                },
                link: {
                  type: 'string',
                  label: 'Link'
                }
              }
            }
          }
        }
      }
    },
    sort: {
      hidden: true
    }
  }
};
