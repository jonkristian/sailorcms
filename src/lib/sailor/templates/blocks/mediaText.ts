export const mediaTextBlock = {
  name: 'Media Text Section',
  slug: 'media-text',
  description: 'A section with a title, subtitle, and image on the left or right',
  options: {
    titleField: 'title'
  },
  fields: {
    title: {
      type: 'string',
      required: true,
      label: 'Title'
    },
    subtitle: {
      type: 'string',
      label: 'Subtitle'
    },
    content: {
      type: 'wysiwyg',
      label: 'Content'
    },
    image: {
      type: 'file',
      label: 'Image',
      items: {
        fileType: 'image'
      }
    },
    image_position: {
      type: 'select',
      label: 'Image Position',
      options: [
        { label: 'Left', value: 'left' },
        { label: 'Right', value: 'right' }
      ]
    },
    sort: {
      hidden: true
    }
  }
};
