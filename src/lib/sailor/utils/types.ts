/**
 * Shared types for Sailor CMS client utilities
 * These types are used across multiple utility files and are client-safe
 */

// Re-export generated types for developer convenience
export type { CollectionTypes, GlobalTypes, File, Tag } from '../generated/types';

// Import types for re-exporting
import type { CollectionTypes, GlobalTypes } from '../generated/types';
import type { CollectionItem, CollectionResult, CollectionOptions } from './collections.server';
import type { GlobalResult, GlobalOptions } from './globals.server';

// Re-export utility function types for better developer experience
export type { CollectionItem, CollectionResult, CollectionOptions };
export type { GlobalResult, GlobalOptions };

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
export type GetCollectionSingle = CollectionTypes | null;

export type GetCollectionMultiple = CollectionResult<CollectionTypes>;

// Global helper types
export type GetGlobalSingle = GlobalTypes | null;
export type GetGlobalMultiple = GlobalTypes | GlobalResult<GlobalTypes> | null;
