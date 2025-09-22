// Server-only file utilities (Node.js imports allowed)
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { getSettings } from '$sailor/core/settings';

// Re-export client-safe utilities
export * from './file';

export function generateFileName(originalName: string): string {
  // Use the original filename, but clean it for filesystem safety
  const extension = path.extname(originalName);
  const baseName = path
    .basename(originalName, extension)
    .replace(/[^a-zA-Z0-9._-]/g, '_') // Replace unsafe chars with underscore
    .replace(/_{2,}/g, '_') // Replace multiple underscores with single
    .replace(/^_|_$/g, ''); // Remove leading/trailing underscores

  // If the filename is empty after cleaning, use a default
  if (!baseName) {
    return `file_${Date.now()}${extension}`;
  }

  return `${baseName}${extension}`;
}

export async function ensureUploadDir(): Promise<void> {
  const settings = await getSettings();
  const providers = settings.storage.providers;

  if (!providers?.local?.uploadDir) {
    throw new Error('Local storage provider not configured');
  }

  const uploadDir = providers.local.uploadDir;

  if (!existsSync(uploadDir)) {
    await mkdir(uploadDir, { recursive: true });
  }
}

export async function saveFile(
  file: File
): Promise<{ filename: string; path: string; url: string }> {
  const settings = await getSettings();
  const providers = settings.storage.providers;

  if (!providers?.local?.uploadDir || !providers?.local?.publicUrl) {
    throw new Error('Local storage provider not configured');
  }

  const uploadDir = providers.local.uploadDir;
  const publicUrl = providers.local.publicUrl;

  await ensureUploadDir();

  const filename = generateFileName(file.name);
  const filePath = path.join(uploadDir, filename);

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);

  return {
    filename,
    path: filePath,
    url: `${publicUrl}/${filename}`
  };
}
