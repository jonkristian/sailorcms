// Storage Settings
export interface StorageSettings {
  provider?: 'local' | 's3'; // Optional since it's set via environment variables
  providers?: {
    // Optional since it's built from environment variables
    local: LocalStorageConfig;
    s3?: S3StorageConfig; // Optional since it's only included when selected
  };
  cache: CacheConfig;
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

export interface CacheConfig {
  provider: 'local' | 's3' | 'disabled';
  local: LocalCacheConfig;
  s3: S3CacheConfig;
}

export interface LocalCacheConfig {
  enabled: boolean;
  directory: string;
  maxSize: string; // Human readable like "1GB"
}

export interface S3CacheConfig {
  bucket: string;
  prefix: string;
  region: string;
}

export interface ImageConfig {
  formats: string[];
  maxFileSize: string; // Human readable like "10.0MB"
  maxWidth: number; // Maximum width for image transformations
  maxHeight: number; // Maximum height for image transformations
  defaultQuality: number; // Default quality for transformations
  allowedTypes: string[];

  // Responsive image settings
  breakpoints?: number[]; // Default responsive breakpoints

  sizes?: {
    [key: string]: { width: number; height: number; quality: number };
  };
}

export interface UploadConfig {
  maxFileSize: string; // Human readable like "10.0MB"
  allowedTypes: string[];
  folderStructure: 'flat' | 'date' | 'type';
}

// System Settings
export interface SystemSettings {
  debugMode: boolean;
}

// Auth Settings
export interface AuthSettings {
  useSecureCookies: boolean;
}

// SEO Settings - Simplified for headless CMS
export interface SEOSettings {
  enabled: boolean;
  titleTemplate: string;
  titleSeparator: string;
  defaultDescription: string;
  language: string;
}

// Role Permission Types
export type PermissionScope =
  | 'all'
  | 'public'
  | 'own'
  | 'published'
  | 'draft'
  | 'archived'
  | boolean
  | string[];

export interface ResourcePermissions {
  view: PermissionScope;
  create: boolean;
  update: PermissionScope;
  delete: PermissionScope;
}

export interface RoleDefinition {
  name: string;
  description: string;
  permissions: {
    collection: ResourcePermissions;
    global: ResourcePermissions;
    block: ResourcePermissions;
    file: ResourcePermissions;
    user: ResourcePermissions;
    settings: ResourcePermissions;
  };
}

export interface RoleSettings {
  definitions: Record<string, RoleDefinition>;
  defaultRole: string;
  adminRoles: string[];
}

export interface RouteProtectionSettings {
  customRoutes?: import('../rbac/route-protection').RouteProtection[];
  overrideDefaults?: boolean;
}

// Main Settings Interface
export interface CMSSettings {
  storage: StorageSettings;
  system: SystemSettings;
  seo: SEOSettings;
  auth?: AuthSettings;
  roles?: RoleSettings;
  routeProtection?: RouteProtectionSettings;
}
