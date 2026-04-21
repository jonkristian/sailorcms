// Server-only file utilities (Node.js imports allowed)
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { getSettings } from '$sailor/core/settings';

// Re-export client-safe utilities
export * from './file';

export function detectImageFormatFromBytes(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  )
    return 'png';
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return 'gif';
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  )
    return 'webp';
  if (
    (bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0x00) ||
    (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2a)
  )
    return 'tiff';
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return 'bmp';

  if (bytes[0] === 0xff && bytes[1] === 0x0a) return 'jxl';
  if (
    bytes[0] === 0x00 &&
    bytes[1] === 0x00 &&
    bytes[2] === 0x00 &&
    bytes[3] === 0x0c &&
    bytes[4] === 0x4a &&
    bytes[5] === 0x58 &&
    bytes[6] === 0x4c &&
    bytes[7] === 0x20
  )
    return 'jxl';

  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (['heic', 'heix', 'mif1', 'heim', 'heis', 'hevc', 'hevx'].includes(brand)) return 'heic';
    if (brand === 'avif' || brand === 'avis') return 'avif';
  }

  return null;
}

export function normalizeFilename(name: string): string {
  return name
    .replace(/æ/g, 'ae')
    .replace(/Æ/g, 'AE')
    .replace(/ø/g, 'o')
    .replace(/Ø/g, 'O')
    .replace(/å/g, 'a')
    .replace(/Å/g, 'A')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function generateFileName(originalName: string): string {
  const extension = path.extname(originalName);
  const baseName = normalizeFilename(path.basename(originalName, extension))
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_|_$/g, '');

  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  if (!baseName) {
    return `file-${suffix}${extension}`;
  }

  return `${baseName}-${suffix}${extension}`;
}

export async function ensureUploadDir(): Promise<void> {
  const settings = await getSettings();
  const providers = settings.storage?.providers;

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
  const providers = settings.storage?.providers;

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
