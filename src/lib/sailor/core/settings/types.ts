// Storage Settings
import type { ImageTransformConfig } from '../files/transform-provider';

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

  /**
   * Seconds a browser may reuse the 302 that points a transform URL at its
   * cached variant. Default 300.
   *
   * The variant itself is immutable and cached for a year; this only governs
   * how long the pointer to it lives. Short by default because a cache wipe
   * that happens outside the CMS, deleting the bucket prefix by hand, leaves
   * any browser holding this redirect pointing at an object that is gone, and
   * it will not ask the origin again until the redirect expires.
   *
   * Raise it if you do not wipe the cache out of band. At 300 an idle visitor
   * pays an origin round trip per image on every return visit, which is the
   * dominant cost on an image-heavy page.
   */
  redirectMaxAge?: number;
  s3?: {
    bucket: string; // Can be different from main storage
    prefix: string; // e.g., "cache/" or "processed-images/"
    region?: string; // Inherit from main S3 if not specified
  };
}

export interface ImageConfig {
  /**
   * Hand image resizing to an external service instead of doing it in-process
   * with sharp. Omit it (or leave `provider: 'local'`) to keep Sailor's own
   * pipeline, which is the default.
   */
  transform?: ImageTransformConfig;

  maxFileSize: string; // Human readable like "10.0MB"
  maxWidth: number; // Maximum width for image transformations
  maxHeight: number; // Maximum height for image transformations

  // Responsive image settings
  breakpoints?: number[]; // Default responsive breakpoints

  /**
   * Image widths (px) to pre-generate variants for after an image upload
   * completes. Without this, the first request for each size pays the cold
   * Sharp cost; pre-warming pushes that cost to upload-time so editor flows
   * land on the 302 redirect path.
   *
   * Runs fire-and-forget after the upload row is inserted — failures don't
   * fail the upload. Leave undefined / empty to skip pre-warming.
   *
   * Example: `[375, 768, 1200, 1600]` mirrors the responsive `breakpoints`
   * default. Use a subset if upload bandwidth/CPU is constrained.
   */
  prewarmBreakpoints?: number[];
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

  /**
   * Which URL shape your public site uses for content locales.
   *
   * - `'default-at-root'` (default) — the default locale serves at `/` and
   *   non-default locales are prefixed (`/no/...`). SEO-safe migration
   *   path: existing URLs on an established site stay unchanged, only new
   *   non-default locales get a prefix. See §8 of the content-translation
   *   guide for the full recipe.
   * - `'symmetric'` — every locale gets a prefix (`/en/...`, `/no/...`).
   *   Use only for greenfield projects where you've never had unprefixed
   *   URLs — flipping an established site to this rewrites every URL
   *   (broken backlinks, redirect chains, search-ranking reset).
   *
   * Settings declaration; helpers (`buildLocaleHref`, `<LanguageSwitcher
   * routeShape="flat">`, `getCollectionsFor` with `routePattern`) read
   * from here so the strategy is encoded in one place. Default:
   * `'default-at-root'`.
   */
  urlStrategy?: 'default-at-root' | 'symmetric';
}

/**
 * Declare which collection item IS the site's home page. Lets the sitemap,
 * `<HreflangLinks routeShape="home">`, and `getHomeItem()` resolve to it
 * automatically instead of every consumer hand-wiring `itemSlug: 'home'` in
 * multiple places.
 *
 * Example:
 * ```ts
 * content: {
 *   home: { collectionSlug: 'pages', itemSlug: 'home' },
 *   i18n: { ... }
 * }
 * ```
 *
 * `itemSlug` is the slug of the item in the chosen collection (per-locale
 * for localized collections — the slug resolves against the default locale's
 * `_locales` row; sibling translations are picked up via the usual locale
 * resolution). Slug renames break this — the queued DB-backed "Set as
 * homepage" admin toggle stores `itemId` instead and supersedes this static
 * declaration when set.
 */
export interface ContentHomeSettings {
  /** Slug of the collection that holds the home item (e.g. `'pages'`). */
  collectionSlug: string;
  /** Slug of the item inside that collection that renders at `/`. For
   *  localized collections this is the default-locale slug. */
  itemSlug: string;
}

export interface ContentSettings {
  i18n?: ContentI18nSettings;
  home?: ContentHomeSettings;
}

// Block group settings. `enabled` (default true) gates the whole feature — the
// `block_groups` table, the editor grouping UI, and grouped public reads.
// `fields` are the developer-defined group config (same field-definition format
// as blocks); omit to use the core default layout set. Field defs are kept loose
// here (Record<string, any>) to avoid a settings→types field-definition import
// cycle; the generator validates them as it builds columns.
export interface BlockGroupSettings {
  enabled?: boolean;
  fields?: Record<string, any>;
}

export interface BlocksSettings {
  groups?: BlockGroupSettings;
}

// Main Settings Interface
export interface CMSSettings {
  storage: StorageSettings;
  cache: CacheConfig;
  system: SystemSettings;
  roles?: RoleSettings;
  content?: ContentSettings;
  blocks?: BlocksSettings;
}
