/**
 * Shared types for Sailor CMS client utilities
 * These types are used across multiple utility files and are client-safe
 */

// Re-export generated types for developer convenience
export type { CollectionTypes, GlobalTypes, File, Tag } from '../generated/types';

import type {
  CollectionItem,
  CollectionsOptions,
  CollectionsMultipleResult,
  CollectionsSingleResult
} from './data/collections';
import type { GlobalsMultipleResult, GlobalsOptions, GlobalsSingleResult } from './data/globals';

// Re-export utility function types for better developer experience
export type {
  CollectionItem,
  CollectionsOptions,
  CollectionsMultipleResult,
  CollectionsSingleResult
};
export type { GlobalsMultipleResult, GlobalsOptions, GlobalsSingleResult };

// Helper types for accessing specific collections and globals dynamically
// No hardcoded types - these work with any generated collection/global

// File and Tag types are now imported from generated types above

// Navigation types
export interface NavigationItem {
  id?: string;
  label: string;
  url: string;
  isActive?: boolean;
  isCurrent?: boolean;
  children?: NavigationItem[];
  icon?: string;
  description?: string;
  target?: '_blank' | '_self';
  order?: number;
}

export interface BreadcrumbItem {
  label: string;
  url: string;
  isActive?: boolean;
  isCurrent?: boolean;
}

export interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  hasNext: boolean;
  hasPrevious: boolean;
  nextUrl?: string;
  previousUrl?: string;
  pages: Array<{
    number: number;
    url: string;
    isActive: boolean;
    isCurrent: boolean;
  }>;
}

// SEO types
export interface SEOData {
  title: string;
  description: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  canonical?: string;
  noindex?: boolean;
  siteName?: string;
}

// Settings types
export interface SiteConfig {
  siteName?: string;
  siteUrl?: string;
  siteDescription?: string;
  contactEmail?: string;
  socialMedia?: Array<{ title: string; url: string }>;
  registrationEnabled?: boolean;
}

// Image utility return types
export interface ResponsiveImageData {
  src: string;
  srcset: string;
  sizes: string;
}

// Collection helper types for stricter typing
export type GetCollectionSingle = CollectionsSingleResult;

export type GetCollectionMultiple = CollectionsMultipleResult;

// Global helper types
export type GetGlobalSingle = GlobalsSingleResult;
export type GetGlobalMultiple = GlobalsMultipleResult;
