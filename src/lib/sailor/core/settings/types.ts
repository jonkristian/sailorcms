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

// Main Settings Interface
export interface CMSSettings {
  storage: StorageSettings;
  cache: CacheConfig;
  system: SystemSettings;
  roles?: RoleSettings;
}
