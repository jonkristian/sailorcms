import { loadFileFields } from './file-loader';
import { loadArrayFields } from '$sailor/utils/data/loaders/array-loader';
import { loadOneToXRelations, loadManyToManyRelations } from '$sailor/utils/data/loaders/relation-loader';

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

  // Load array fields for this block
  await loadArrayFields(block, blockSchema, tablePrefix, 'block_id', false);

  // Load relation fields for this block
  await loadOneToXRelations(block, blockSchema, false);
  await loadManyToManyRelations(block, blockSchema, blockSlug, 'block_id', false);
}