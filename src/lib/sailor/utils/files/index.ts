// File utilities - Client and server-side file handling
// These utilities handle file processing, image transformations, and asset management

// Client-side file utilities
export {
  getFile,
  getImage,
  isImage,
  getFileExtension,
  formatFileSize,
  setDefaultBreakpoints,
  getDefaultBreakpoints
} from './client';

// Server-side file utilities are available by importing './server' directly
// DO NOT export server utilities here as it breaks client-side builds
export type { ResponsiveImageData } from '../types';
