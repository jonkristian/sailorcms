import { getFileUrl as getFileUrlFromCore, type FileTransformOptions } from '$sailor/core/files';
import type { ResponsiveImageData } from '../types';

// Default responsive breakpoints - can be overridden with setDefaultBreakpoints()

/**
 * Client-side file utilities for developers
 *
 * These utilities work with file paths/URLs directly and are safe to use in browser components.
 * For server-side utilities that work with database file IDs, use files.server.ts instead.
 */

/**
 * Get a file URL with optional transformations
 *
 * Handles both file paths and file IDs (UUIDs) automatically
 *
 * @example
 * ```typescript
 * import { getFile } from '$lib/sailor/utils/files';
 *
 * // With file path
 * const fileUrl = getFile('/uploads/document.pdf');
 *
 * // With database file ID (UUID)
 * const fileUrl = getFile('66fee12e-0c91-40c1-b159-6a619707e4f4');
 *
 * // With cloud storage URLs
 * const cloudUrl = getFile('https://cdn.example.com/file.jpg');
 * ```
 */
export function getFile(filePathOrId: string, options: FileTransformOptions = {}): string {
  if (!filePathOrId) {
    return '';
  }

  // Check if this looks like a UUID (file ID from database)
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (uuidPattern.test(filePathOrId)) {
    // This is a file ID (UUID) - use image transform API to resolve it
    return `/sailor/api/images/transform?id=${filePathOrId}&transform=false`;
  }

  // This is a file path - use the normal file URL logic
  return getFileUrlFromCore(filePathOrId, { ...options, transform: false });
}

/**
 * Internal helper for basic image transformations
 */
function getImageUrl(filePathOrId: string, options: FileTransformOptions = {}): string {
  if (!filePathOrId) {
    return '';
  }

  // Check if this looks like a UUID (file ID from database)
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (uuidPattern.test(filePathOrId)) {
    // This is a file ID (UUID) - use transform API to resolve it
    const transformUrl = '/sailor/api/images/transform';
    const params = new URLSearchParams();
    params.append('id', filePathOrId); // Use 'id' parameter, not 'fileId'

    if (options.width) params.append('width', options.width.toString());
    if (options.height) params.append('height', options.height.toString());
    if (options.resize) params.append('resize', options.resize);
    if (options.quality) params.append('quality', options.quality.toString());
    if (options.format) params.append('format', options.format);

    return `${transformUrl}?${params.toString()}`;
  }

  // This is a file path - use the normal file URL logic
  return getFileUrlFromCore(filePathOrId, { ...options, transform: true });
}

// Common responsive breakpoints that applications can customize
export const DEFAULT_BREAKPOINTS = [375, 768, 1200, 1600];

// Default responsive breakpoints - matches CMS settings
let defaultBreakpoints = DEFAULT_BREAKPOINTS;

/**
 * Set the default breakpoints for your application
 */
export function setDefaultBreakpoints(breakpoints: number[]) {
  defaultBreakpoints = [...breakpoints];
}

/**
 * Get the current default breakpoints
 */
export function getDefaultBreakpoints(): number[] {
  return [...defaultBreakpoints];
}

/**
 * Universal image function - handles everything you need for responsive images
 *
 * @example
 * ```typescript
 * import { getImage, setDefaultBreakpoints } from '$lib/sailor/utils/files';
 *
 * // Set your app's defaults once (optional)
 * setDefaultBreakpoints([375, 768, 1024, 1400]);
 *
 * // Single image URL
 * const url = getImage('image.jpg', { width: 800 });
 *
 * // Responsive srcset (uses default breakpoints)
 * const { src, srcset, sizes } = getImage('image.jpg', {
 *   responsive: true,
 *   aspectRatio: 16/9,
 *   quality: 85
 * });
 *
 * // Custom breakpoints
 * const responsive = getImage('hero.jpg', {
 *   responsive: true,
 *   widths: [400, 800, 1200],
 *   aspectRatio: 4/3,
 *   sizes: '(max-width: 768px) 100vw, 50vw'
 * });
 *
 * // Advanced with custom descriptors
 * const retina = getImage('logo.png', {
 *   responsive: true,
 *   variants: [
 *     { width: 200, descriptor: '1x' },
 *     { width: 400, descriptor: '2x' }
 *   ]
 * });
 * ```
 */

// Function overloads for better TypeScript support
export function getImage(
  filePathOrId: string,
  options: FileTransformOptions & {
    html: true;
    alt?: string;
    fallback?: string;
    class?: string;
    widths?: number[];
    aspectRatio?: number;
    sizes?: string;
  }
): string;

export function getImage(
  filePathOrId: string,
  options?: FileTransformOptions & {
    html?: false;
    widths?: number[];
    aspectRatio?: number;
    sizes?: string;
  }
): ResponsiveImageData;

export function getImage(
  filePathOrId: string,
  options: FileTransformOptions & {
    // HTML generation
    html?: boolean;
    alt?: string;
    fallback?: string;
    class?: string;
    // Responsive options
    widths?: number[];
    aspectRatio?: number;
    sizes?: string;
  } = {}
): string | ResponsiveImageData {
  const {
    html,
    alt,
    fallback,
    class: className,
    widths,
    aspectRatio,
    sizes,
    ...transformOptions
  } = options;

  // Responsive image with widths
  const breakpoints = widths || defaultBreakpoints;

  const srcset = breakpoints
    .map((width) => {
      const height = aspectRatio ? Math.round(width / aspectRatio) : undefined;
      const url = getImageUrl(filePathOrId, {
        ...transformOptions,
        width,
        ...(height && { height })
      });
      return `${url} ${width}w`;
    })
    .join(', ');

  const defaultWidth = Math.max(...breakpoints);
  const height = aspectRatio ? Math.round(defaultWidth / aspectRatio) : undefined;

  const src = getImageUrl(filePathOrId, {
    ...transformOptions,
    width: defaultWidth,
    ...(height && { height })
  });

  const responsiveResult = {
    src,
    srcset,
    sizes:
      sizes || `(max-width: ${Math.min(...breakpoints)}px) 100vw, ${Math.max(...breakpoints)}px`
  };

  // Generate HTML if requested
  if (html) {
    // Handle fallback for missing images
    if (!filePathOrId && fallback) {
      const classAttr = className ? ` class="${className}"` : '';
      const altAttr = alt ? ` alt="${alt}"` : '';
      return `<img src="${fallback}"${altAttr}${classAttr}>`;
    }

    // No image and no fallback
    if (!filePathOrId) {
      return '';
    }

    const classAttr = className ? ` class="${className}"` : '';
    const altAttr = alt ? ` alt="${alt}"` : '';

    // Always generate responsive HTML
    return `<img src="${responsiveResult.src}" srcset="${responsiveResult.srcset}" sizes="${responsiveResult.sizes}"${altAttr}${classAttr}>`;
  }

  return responsiveResult;
}

/**
 * Check if a file path is an image
 *
 * @example
 * ```typescript
 * import { isImage } from '$lib/sailor/utils';
 *
 * if (isImage('/uploads/photo.jpg')) {
 *   // Show image preview
 * }
 * ```
 */
export function isImage(filePath: string): boolean {
  if (!filePath) return false;

  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'];
  const extension = filePath.toLowerCase().split('.').pop();

  return extension ? imageExtensions.includes(`.${extension}`) : false;
}

/**
 * Get file extension from path
 *
 * @example
 * ```typescript
 * import { getFileExtension } from '$lib/sailor/utils';
 *
 * const ext = getFileExtension('/uploads/document.pdf'); // 'pdf'
 * ```
 */
export function getFileExtension(filePath: string): string {
  if (!filePath) return '';

  const parts = filePath.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

/**
 * Format file size in human-readable format
 *
 * @example
 * ```typescript
 * import { formatFileSize } from '$lib/sailor/utils';
 *
 * const size = formatFileSize(1024); // '1 KB'
 * const size2 = formatFileSize(1048576); // '1 MB'
 * ```
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
