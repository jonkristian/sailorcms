// Data utilities - Server-side data fetching and processing
// These utilities handle loading content from the database and processing it

// Collection utilities
export {
  getCollections,
  type CollectionItem,
  type CollectionsOptions,
  type CollectionsMultipleResult,
  type CollectionsSingleResult
} from './collections';

// Global utilities
export {
  getGlobals,
  createGlobalItem,
  getAvailableGlobalTypes,
  globalTypeExists,
  type GlobalsMultipleResult,
  type GlobalsOptions,
  type GlobalsSingleResult,
  type CreateGlobalItemOptions,
  type CreateGlobalItemResult
} from './globals';

// Block utilities
export { loadBlocksForCollection, type BlockWithRelations } from './blocks';

// Access control — exported so consumers can `instanceof`-check the error
// in their +page.server.ts and render a 403 instead of a 500.
export { AccessDeniedError } from './access';

// Site utilities
export { getSiteSettings } from './site';

// Search
export { search } from './search';
export type { SearchScope, SearchOptions, SearchResultItem, SearchResult } from './search';
