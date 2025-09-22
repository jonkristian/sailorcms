// Client-safe file utilities (no Node.js imports)

export type FileTransformOptions = {
  width?: number;
  height?: number;
  resize?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
  quality?: number;
  format?: 'jpg' | 'png' | 'webp';
  transform?: boolean;
};

export type FileType = {
  id: string;
  name: string;
  mime_type: string;
  size: number;
  path: string;
  url: string;
  hash?: string | null;
  alt: string | null;
  title: string | null;
  description: string | null;
  created_at: Date;
  updated_at: Date;
};

export type FileListItem = {
  value: string; // file ID
  label: string; // file name
  url: string;
  type: 'image' | 'document' | 'spreadsheet' | 'presentation' | 'video' | 'other';
  size?: number;
  created_at?: Date;
};

export function getFileUrl(
  path: string,
  options: FileTransformOptions = { transform: true }
): string {
  if (!path) {
    return '';
  }

  // For images with transformation enabled, always use the transform API
  if (options.transform && isImageFile(path)) {
    const transformUrl = '/sailor/api/images/transform';
    const params = new URLSearchParams();

    // Pass the original path (could be local or cloud URL)
    params.append('path', path);
    if (options.width) params.append('width', options.width.toString());
    if (options.height) params.append('height', options.height.toString());
    if (options.resize) params.append('resize', options.resize);
    if (options.quality) params.append('quality', options.quality.toString() || '80');
    if (options.format) params.append('format', options.format);

    return `${transformUrl}?${params.toString()}`;
  }

  // For non-images or when transformation is disabled
  if (path.startsWith('http')) {
    // Return cloud URLs directly
    return path;
  }

  // Handle local paths vs cloud storage keys
  if (path.startsWith('/')) {
    // Local absolute path
    return path;
  }

  // Check if this might be a cloud storage key
  // Cloud keys typically don't contain common local path indicators
  if (path.includes('/') && !path.startsWith('uploads/')) {
    // Looks like a cloud storage key (has folder structure but not uploads/)
    // For client-side, we'll need to use the transform API even without transformation
    // to properly resolve the URL
    const transformUrl = '/sailor/api/images/transform';
    const params = new URLSearchParams();
    params.append('path', path);
    params.append('transform', 'false');
    return `${transformUrl}?${params.toString()}`;
  }

  // Default to local upload path
  return `/uploads/${path}`;
}

export function isImageFile(path: string | null | undefined): boolean {
  if (!path) return false;

  const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'];
  const extension = path.split('.').pop()?.toLowerCase() ?? '';
  return imageExtensions.includes(extension);
}

/**
 * Convert mime type to display category using database mime_type as source of truth
 */
export function getFileTypeFromMime(
  mimeType: string | null | undefined
): 'image' | 'document' | 'spreadsheet' | 'presentation' | 'video' | 'other' {
  if (!mimeType) return 'other';

  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';

  // Document types
  if (
    mimeType === 'application/pdf' ||
    mimeType.startsWith('application/msword') ||
    mimeType.startsWith('application/vnd.openxmlformats-officedocument.wordprocessingml') ||
    mimeType === 'text/plain' ||
    mimeType === 'application/rtf' ||
    mimeType.startsWith('application/vnd.oasis.opendocument.text')
  ) {
    return 'document';
  }

  // Spreadsheet types
  if (
    mimeType.startsWith('application/vnd.ms-excel') ||
    mimeType.startsWith('application/vnd.openxmlformats-officedocument.spreadsheetml') ||
    mimeType === 'text/csv' ||
    mimeType.startsWith('application/vnd.oasis.opendocument.spreadsheet')
  ) {
    return 'spreadsheet';
  }

  // Presentation types
  if (
    mimeType.startsWith('application/vnd.ms-powerpoint') ||
    mimeType.startsWith('application/vnd.openxmlformats-officedocument.presentationml') ||
    mimeType.startsWith('application/vnd.oasis.opendocument.presentation')
  ) {
    return 'presentation';
  }

  return 'other';
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function validateFile(
  file: File,
  options: { maxSize?: number; accept?: string } = {}
): string | null {
  if (options.maxSize && file.size > options.maxSize) {
    return `File size exceeds maximum allowed size of ${formatFileSize(options.maxSize)}`;
  }

  if (options.accept) {
    const acceptedTypes = options.accept.split(',').map((t) => t.trim());
    const isAccepted = acceptedTypes.some((type) => {
      if (type.startsWith('.')) {
        return file.name.toLowerCase().endsWith(type.toLowerCase());
      }
      return file.type.match(type.replace('*', '.*'));
    });

    if (!isAccepted) {
      return `File type not accepted. Accepted types: ${options.accept}`;
    }
  }

  return null;
}

// CMS-internal function for transforming images by file ID
export function getImage(fileId: string, options: FileTransformOptions = {}): string {
  const { width = 512, height = 512, quality = 70, format = 'webp', resize = 'cover' } = options;

  const params = new URLSearchParams();
  params.append('id', fileId);
  params.append('width', width.toString());
  params.append('height', height.toString());
  params.append('quality', quality.toString());
  params.append('format', format);
  params.append('resize', resize);
  return `/sailor/api/images/transform?${params.toString()}`;
}
