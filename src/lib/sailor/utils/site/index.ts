// Site-level helpers — compose primitive data reads into artifacts the public
// site serves directly (sitemaps, feeds, etc.). Server-only.

export {
  generateLocalizedSitemap,
  type GenerateLocalizedSitemapOptions,
  type SitemapCollectionEntry,
  type SitemapExtraUrl,
  type ChangeFreq
} from './sitemap';

export { generateRobotsTxt, type GenerateRobotsTxtOptions } from './robots';
