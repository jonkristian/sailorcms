import { loadFileFields } from './file-loader';

/**
 * Core block field loader for admin UI
 * Loads all fields (files, arrays, relations) for a block in the CMS
 */
export async function loadBlockFields(
  block: any,
  blockSlug: string,
  blockSchema: Record<string, any>
): Promise<void> {
  const tablePrefix = `block_${blockSlug}`;

  // Load file fields for this block
  await loadFileFields(block, blockSchema, tablePrefix);

  // TODO: Load array fields when needed
  // TODO: Load relation fields when needed
}
