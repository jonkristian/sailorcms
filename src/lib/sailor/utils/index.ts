// Main barrel export - maintains backward compatibility
// Developers can import from '$sailor/utils' or from specific categories

// Data utilities (server-side)
export {
  getCollections,
  getGlobals,
  getAvailableGlobalTypes,
  globalTypeExists,
  getSiteSettings
} from './data';
export { search } from './data/search';
export type {
  CollectionItem,
  CollectionsOptions,
  CollectionsMultipleResult,
  CollectionsSingleResult,
  GlobalsMultipleResult,
  GlobalsOptions,
  GlobalsSingleResult,
  SearchScope,
  SearchOptions,
  SearchResultItem,
  SearchResult
} from './data';

// Content utilities (universal)
export { renderContent, getExcerpt } from './content';

// SEO utilities are server-side only - import directly from './content/seo' when needed
// export { extractSEO, generateMetaTags } from './content';

// File utilities (client-side)
export {
  getFile,
  getImage,
  isImage,
  getFileExtension,
  formatFileSize,
  setDefaultBreakpoints,
  getDefaultBreakpoints
} from './files';

// UI utilities (universal)
export {
  buildNavigationTree,
  generateBreadcrumbs,
  createPagination,
  formatDate,
  timeAgo,
  sortByDate,
  pluralize
} from './ui';

// Core utilities (re-exported for convenience)
export { debounce } from 'sailorcms/core/utils/debounce';
export { getRoleColor, copyUserId, shortenUserId } from 'sailorcms/core/utils/user';

// Types
export * from './types';
