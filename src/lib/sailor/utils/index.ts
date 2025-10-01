// Main barrel export - maintains backward compatibility
// Developers can import from '$sailor/utils' or from specific categories

// Data utilities (server-side)
export {
  getCollections,
  getGlobals,
  getAvailableGlobalTypes,
  globalTypeExists,
  getSiteSettings,
  type CollectionItem,
  type CollectionsOptions,
  type CollectionsMultipleResult,
  type CollectionsSingleResult,
  type GlobalsMultipleResult,
  type GlobalsOptions,
  type GlobalsSingleResult
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
  sortByDate
} from './ui';

// Core utilities (re-exported for convenience)
export { debounce } from '../core/utils/debounce';
export { getRoleColor, copyUserId, shortenUserId } from '../core/utils/user';

// Types
export * from './types';
