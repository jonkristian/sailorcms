export const featuresBlock = {
  name: 'Features Section',
  slug: 'features',
  description: 'A grid of features with icons, titles, and descriptions',
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
    features: {
      type: 'array',
      required: true,
      label: 'Features',
      items: {
        type: 'object',
        label: 'Feature',
        properties: {
          title: {
            type: 'string',
            required: true,
            label: 'Feature Title'
          },
          subtitle: {
            type: 'string',
            label: 'Feature Subtitle'
          },
          content: {
            type: 'text',
            required: true,
            label: 'Feature Content'
          },
          icon: {
            type: 'string',
            label: 'Icon Name'
          },
          cta: {
            type: 'array',
            label: 'CTA Links',
            items: {
              type: 'object',
              label: 'CTA Link',
              properties: {
                title: {
                  type: 'string',
                  required: true,
                  label: 'Title'
                },
                link: {
                  type: 'string',
                  required: true,
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
