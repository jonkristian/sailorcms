export const richTextBlock = {
  name: 'Rich Text',
  slug: 'rich-text',
  description: 'Rich text content with formatting options',
  options: {
    titleField: 'content'
  },
  fields: {
    title: {
      hidden: true
    },
    sort: {
      hidden: true
    },
    content: {
      type: 'wysiwyg',
      required: true,
      label: 'Content'
    }
  }
};
