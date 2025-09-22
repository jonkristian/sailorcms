// Server-side utilities
export {
  // Clean, modern API
  getCollectionItems, // Multiple items: getCollectionItems('posts', { query: 'children', value: 'parent-id' })
  getCollectionItem, // Single item: getCollectionItem('posts', { query: 'slug', value: 'my-post' })

  // Original complex function (for advanced usage)
  getCollection
} from './collections.server';
export {
  // Clean, modern API
  getGlobalItems, // Multiple items: getGlobalItems('menus', { query: 'slug', value: 'main' })
  getGlobalItem, // Single item: getGlobalItem('menus', { query: 'slug', value: 'main' })

  // Original complex function (for advanced usage)
  getGlobal
} from './globals.server';
export { getSiteSettings } from './site.server';

// Client-side utilities
export {
  getFile,
  getImage,
  isImage,
  getFileExtension,
  formatFileSize,
  setDefaultBreakpoints,
  getDefaultBreakpoints
} from './files';
export { getFileClient, getImageClient, copyToClipboard, downloadFile, throttle } from './browser';

// Universal utilities
export { renderContent, getExcerpt } from './content';
export { extractSEO, generateMetaTags } from './seo';
export { buildNavigationTree, generateBreadcrumbs, createPagination } from './navigation';
export { formatDate, timeAgo, sortByDate } from './datetime';
export { debounce } from '../core/utils/debounce';
export { getRoleColor, copyUserId, shortenUserId } from '../core/utils/user';

// Types
export * from './types';
