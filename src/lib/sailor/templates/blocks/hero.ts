export const heroBlock = {
  name: 'Hero Section',
  slug: 'hero',
  description: 'A full-width hero section with title, subtitle, and optional image',
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
    background_image: {
      type: 'file',
      label: 'Background Image',
      file: {
        fileType: 'image',
        accept: 'image/*'
      }
    },
    sort: {
      hidden: true
    }
  }
};
