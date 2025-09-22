export const galleryBlock = {
  name: 'Gallery',
  slug: 'gallery',
  description: 'A grid of images',
  options: {
    titleField: 'title'
  },
  fields: {
    title: {
      type: 'string',
      label: 'Gallery Title'
    },
    images: {
      type: 'file',
      required: true,
      label: 'Images',
      file: {
        multiple: true,
        fileType: 'image',
        accept: 'image/*'
      }
    },
    sort: {
      hidden: true
    }
  }
};
