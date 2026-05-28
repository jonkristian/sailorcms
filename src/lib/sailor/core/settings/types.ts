// Storage Settings
export interface StorageSettings {
  provider?: 'local' | 's3'; // Optional since it's set via environment variables
  excludePaths?: string[]; // Paths/folders to exclude from storage scanning
  providers?: {
    // Optional since it's built from environment variables
    local: LocalStorageConfig;
    s3?: S3StorageConfig; // Optional since it's only included when selected
  };
  images: ImageConfig;
  upload: UploadConfig;
}

export interface LocalStorageConfig {
  uploadDir: string;
  publicUrl: string;
}

export interface S3StorageConfig {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
  publicUrl: string;
}

// Cache Configuration - Simplified
export interface CacheConfig {
  enabled: boolean;
  provider?: 'auto' | 'local' | 's3'; // auto = follow main storage
  path?: string; // Override cache path (from CACHE_PATH env)
  maxSize: string; // Human readable like "1GB"
  s3?: {
    bucket: string; // Can be different from main storage
    prefix: string; // e.g., "cache/" or "processed-images/"
    region?: string; // Inherit from main S3 if not specified
  };
}

export interface ImageConfig {
  maxFileSize: string; // Human readable like "10.0MB"
  maxWidth: number; // Maximum width for image transformations
  maxHeight: number; // Maximum height for image transformations

  // Responsive image settings
  breakpoints?: number[]; // Default responsive breakpoints
}

export interface UploadConfig {
  maxFileSize: string; // Human readable like "10.0MB"
  allowedTypes: string[];
  folderStructure: 'flat' | 'date' | 'type';
}

// System Settings - Minimal (most via env vars)
export interface SystemSettings {
  // Most system settings now handled via environment variables
  // This interface kept for future system-level settings
}

// Better-Auth integrated permission types
export type BetterAuthAction = 'create' | 'read' | 'update' | 'delete';
export type BetterAuthResource = 'content' | 'files' | 'users' | 'settings';

export interface RoleDefinition {
  name: string;
  description: string;
  permissions: Partial<Record<BetterAuthResource, BetterAuthAction[]>>;
}

export interface RoleSettings {
  definitions: Record<string, RoleDefinition>;
  defaultRole: string;
  adminRoles: string[];
}

// Content / i18n Settings
export interface ContentI18nSettings {
  /**
   * Available locales for content translation, e.g. `['en', 'nb-NO']`.
   * Defaults to paraglide's configured locales when unset.
   *
   * Only meaningful for entities opted in via `localized: true`. Adding a
   * locale here lets editors create translations in that locale; existing
   * items are translated lazily on first edit.
   */
  locales?: string[];

  /**
   * Default content locale. Used as the source for clone-on-create (new
   * translations are prefilled from this locale's row) and as the fallback
   * target when `fallback === 'default'`.
   *
   * Defaults to paraglide's `baseLocale` when unset.
   */
  default?: string;

  /**
   * Read-time fallback when a requested locale has no row for an item.
   *
   * - `'default'`: return the default-locale row marked with a fallback flag.
   *   Good for list/index pages that should still surface untranslated items.
   * - `'strict'`: omit the item from results. Good for URL resolvers that
   *   should 404 on missing translations to avoid duplicate-content SEO.
   *
   * Per-read override via `getCollections({ fallback: ... })`. Defaults to `'default'`.
   */
  fallback?: 'default' | 'strict';

  /**
   * Optional URL aliases mapping content locale codes to URL segments.
   *
   * Content codes are BCP-47 (e.g. `'nb-NO'`); URL aliases let the public
   * site use a friendlier form (e.g. `'no'`). Sailor's URL helpers
   * (`urlToContentLocale`, `contentToUrlLang`, `getUrlLangs`,
   * `<LanguageSwitcher>`) all respect this map.
   *
   * Example:
   * ```ts
   * urlAliases: { 'nb-NO': 'no' }
   * ```
   * gives the site `/no/...` URLs while content stays tagged `nb-NO`.
   *
   * Locales without an alias use their BCP-47 code as the URL segment.
   * No effect on admin routes (which never use URL aliases).
   */
  urlAliases?: Record<string, string>;
}

export interface ContentSettings {
  i18n?: ContentI18nSettings;
}

// Main Settings Interface
export interface CMSSettings {
  storage: StorageSettings;
  cache: CacheConfig;
  system: SystemSettings;
  roles?: RoleSettings;
  content?: ContentSettings;
}
