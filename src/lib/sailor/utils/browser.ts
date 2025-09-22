import type { FileTransformOptions } from '$sailor/core/files/file';

/**
 * Client-side utilities for interactive features
 *
 * These utilities are designed to work in the browser and handle user interactions,
 * real-time updates, and browser-specific APIs.
 */

/**
 * Get a file URL by ID - client-side version using API calls
 *
 * Use this when you need to resolve file IDs in client-side code (after page load)
 * Pass SvelteKit's enhanced fetch for better error handling and request deduplication
 *
 * @example
 * ```typescript
 * import { getFileClient } from '$lib/sailor/utils/client';
 *
 * // In a Svelte component (with enhanced fetch)
 * const fileUrl = await getFileClient('file-id-123', {}, fetch);
 *
 * // Or in vanilla client code (with regular fetch)
 * const fileUrl = await getFileClient('file-id-123');
 * ```
 */
export async function getFileClient(
  fileId: string,
  options: FileTransformOptions = {},
  fetchFn = fetch
): Promise<string> {
  if (!fileId) {
    return '';
  }

  try {
    const { getFile } = await import('$sailor/remote/files.remote.js');
    const result = await getFile({ fileId });
    const file = result.success ? result.file : null;

    if (!file) {
      return '';
    }

    // If we have transformation options, apply them
    if (Object.keys(options).length > 0) {
      const { getFileUrl } = await import('$sailor/core/files/file');
      return getFileUrl(file.url, options);
    }

    return file.url;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Failed to get file URL for ID ${fileId}:`, errorMessage);
    return '';
  }
}

/**
 * Get an image URL - client-side version
 *
 * @example
 * ```typescript
 * import { getImageClient } from '$lib/sailor/utils/client';
 *
 * const imageUrl = await getImageClient('file-id-123', { width: 800 }, fetch);
 * ```
 */
export async function getImageClient(
  fileId: string,
  options: FileTransformOptions = {},
  fetchFn = fetch
): Promise<string> {
  return getFileClient(fileId, options, fetchFn);
}

/**
 * Copy text to clipboard
 *
 * @example
 * ```typescript
 * import { copyToClipboard } from '$lib/sailor/utils/client';
 *
 * await copyToClipboard('https://example.com');
 * ```
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
    return false;
  }
}

/**
 * Download a file from URL
 *
 * @example
 * ```typescript
 * import { downloadFile } from '$lib/sailor/utils/client';
 *
 * await downloadFile('https://example.com/file.pdf', 'document.pdf');
 * ```
 */
export async function downloadFile(url: string, filename?: string): Promise<void> {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename || 'download';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    window.URL.revokeObjectURL(downloadUrl);
  } catch (error) {
    console.error('Failed to download file:', error);
    throw error;
  }
}

/**
 * Throttle function for scroll events and other frequent events
 *
 * @example
 * ```typescript
 * import { throttle } from '$lib/sailor/utils/client';
 *
 * const throttledScroll = throttle(() => {
 *   // Handle scroll event
 * }, 100);
 *
 * window.addEventListener('scroll', throttledScroll);
 * ```
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;

  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}
