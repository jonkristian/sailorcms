// Client-safe service interfaces and types (no Node.js dependencies)

// File service types
export interface FileType {
  id: string;
  filename: string;
  original_name: string;
  path: string;
  url: string;
  size: number;
  mime_type: string;
  alt?: string;
  caption?: string;
  title?: string;
  description?: string;
  created_at: Date;
  updated_at: Date;
}

// System Settings types
export interface SystemSetting {
  id: string;
  key: string;
  value: string;
  category: string;
  description?: string;
  created_at: Date;
  updated_at: Date;
}

// Storage provider types
export interface StorageProvider {
  uploadFile(file: File): Promise<{ filename: string; path: string; url: string }>;
  deleteFile(path: string): Promise<boolean>;
  getPublicUrl(path: string): Promise<string>;
  listFiles(): Promise<{ path: string; size?: number }[]>;
}

export interface StorageTestResult {
  success: boolean;
  message: string;
  details?: string;
}

// Image processor types
export interface ImageTransformOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'webp' | 'jpeg' | 'png';
}
