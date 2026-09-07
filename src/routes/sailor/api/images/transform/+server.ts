import { error, isHttpError, isRedirect, type RequestHandler } from '@sveltejs/kit';
import { ImageProcessor } from 'sailorcms/core/services/image.server';
import { getSettings } from 'sailorcms/core/settings/index';
import { S3StorageService } from 'sailorcms/core/services/storage-s3.server';
import { getFileObject } from 'sailorcms/utils/files/server';
import { log } from 'sailorcms/core/utils/logger';

export const GET: RequestHandler = async ({ url }) => {
  try {
    // Parse query parameters
    const fileId = url.searchParams.get('id');
    const imagePath = url.searchParams.get('path');
    const width = url.searchParams.get('width')
      ? parseInt(url.searchParams.get('width')!)
      : undefined;
    const height = url.searchParams.get('height')
      ? parseInt(url.searchParams.get('height')!)
      : undefined;
    const quality = url.searchParams.get('quality')
      ? parseInt(url.searchParams.get('quality')!)
      : undefined;
    const format = url.searchParams.get('format') as 'webp' | 'jpg' | 'png' | undefined;
    const resize =
      (url.searchParams.get('resize') as
        'cover' | 'contain' | 'fill' | 'inside' | 'outside' | undefined) || 'cover';
    const position = url.searchParams.get('position') || undefined;
    const transform = url.searchParams.get('transform') !== 'false'; // Default to true unless explicitly set to false

    // Require either id or path parameter
    if (!fileId && !imagePath) {
      throw error(400, 'Either id or path parameter is required');
    }

    // Validate parameters against settings
    const settings = await getSettings();
    const maxWidth = settings.storage.images.maxWidth || 2560;
    const maxHeight = settings.storage.images.maxHeight || 2560;

    // Check if requested size is within allowed limits
    if (width && width > maxWidth) {
      throw error(400, `Image width exceeds maximum allowed width of ${maxWidth}px`);
    }
    if (height && height > maxHeight) {
      throw error(400, `Image height exceeds maximum allowed height of ${maxHeight}px`);
    }

    // Handle file IDs, local paths, S3 keys, and full URLs
    let fullImagePath: string;

    if (fileId) {
      // Handle file ID parameter - always resolve via utility
      try {
        const file = await getFileObject(fileId);
        if (!file) {
          throw error(404, 'File not found');
        }
        // Use path for local files, URL for S3/cloud files
        // If file.path exists and looks like a local path, use it; otherwise use URL
        if (file.path && file.path.startsWith('static/')) {
          fullImagePath = file.path;
        } else {
          fullImagePath = file.url || file.path;
        }
      } catch (err) {
        log.error('Failed to resolve file ID', { fileId, error: err });
        throw error(404, 'File not found');
      }
    } else if (imagePath) {
      // Handle path parameter - support various path formats
      // Check if this looks like a file ID (UUID format) for backward compatibility
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(imagePath)) {
        // It's a file ID, resolve it to a file path
        try {
          const file = await getFileObject(imagePath);
          if (!file) {
            throw error(404, 'File not found');
          }
          // Use path for local files, URL for S3/cloud files
          if (file.path && file.path.startsWith('static/')) {
            fullImagePath = file.path;
          } else {
            fullImagePath = file.url || file.path;
          }
        } catch (err) {
          log.error('Failed to resolve file ID via path', { imagePath, error: err });
          throw error(404, 'File not found');
        }
      } else if (imagePath.startsWith('http')) {
        // It's already a full URL (external or absolute URLs)
        fullImagePath = imagePath;
      } else if (imagePath.startsWith('/') || settings.storage.provider === 'local') {
        // It's a local path
        fullImagePath = imagePath.startsWith('/')
          ? imagePath.substring(1) // Remove leading slash
          : `${settings.storage.providers?.local?.uploadDir || 'uploads'}/${imagePath}`;
      } else {
        // It's likely an S3/R2 key, generate the full URL
        try {
          fullImagePath = await S3StorageService.generatePublicUrl(imagePath);
        } catch (err) {
          log.error('Failed to generate S3 URL for key', { imagePath, error: err });
          throw error(404, 'Image not found');
        }
      }
    } else {
      throw error(400, 'Either id or path parameter is required');
    }

    // If transformation is disabled, just redirect to the resolved URL
    if (!transform && fullImagePath.startsWith('http')) {
      return Response.redirect(fullImagePath, 302);
    }

    // Fast path: if this variant is already cached on the storage provider, 302 the browser
    // straight to the CDN / static URL so the bytes don't stream through Node. Falls back
    // to in-process generation only on cache miss.
    const transformOptions = { width, height, quality, format, resize, position };
    const cachedUrl = await ImageProcessor.getCacheRedirectUrl(fullImagePath, transformOptions);
    if (cachedUrl) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: cachedUrl,
          // Brief redirect cache so out-of-band cache wipes recover within minutes; the
          // redirect target itself carries long max-age, so repeat visitors stay fast.
          'Cache-Control': 'public, max-age=300'
        }
      });
    }

    // Process image with caching
    const processed = await ImageProcessor.getProcessedImage(fullImagePath, transformOptions);

    // Return processed image using SvelteKit's Response
    return new Response(processed.buffer as unknown as ArrayBuffer, {
      headers: {
        'Content-Type': processed.mimeType,
        'Content-Length': processed.size.toString(),
        'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
        ETag: `"${processed.size}"` // Simple ETag
      }
    });
  } catch (err) {
    // The 400s and 404s this handler raises are deliberate responses. The old
    // check tested `err instanceof Response`, which an `error()` never is —
    // it throws an `HttpError` — so every "File not found" left here as a 500.
    if (isHttpError(err) || isRedirect(err)) throw err;

    // Log concise error messages
    const errorMessage = err instanceof Error ? err.message : 'Image processing failed';
    if (errorMessage.includes('Input file is missing') || errorMessage.includes('ENOENT')) {
      log.error(`Image not found: ${errorMessage.split(':').pop()?.trim()}`);
    } else {
      log.error('Image transformation failed', { error: errorMessage });
    }

    throw error(500, `Image transformation failed: ${errorMessage}`);
  }
};
