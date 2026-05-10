import { loadFileFields } from './file-loader';
import { loadArrayFields } from 'sailorcms/utils/data/loaders/array-loader';
import {
  loadOneToXRelations,
  loadManyToManyRelations
} from 'sailorcms/utils/data/loaders/relation-loader';

/**
 * Core block field loader for admin UI
 * Loads all fields (files, arrays, relations) for a block in the CMS.
 *
 * Admin previews/edit screens need to see drafts and unpublished targets, so
 * relation resolution runs with status='all' here. The public-site loader at
 * `sailorcms/utils/data/blocks` defaults to 'published' instead.
 */
export async function loadBlockFields(
  block: any,
  blockSlug: string,
  blockSchema: Record<string, any>
): Promise<void> {
  const tablePrefix = `block_${blockSlug}`;

  // Load file fields for this block
  await loadFileFields(block, blockSchema, tablePrefix);

  // Load array fields for this block (admin sees drafts/unpublished targets)
  await loadArrayFields(block, blockSchema, tablePrefix, 'block_id', false, 'all');

  // Load relation fields for this block — admin sees everything (incl. drafts)
  await loadOneToXRelations(block, blockSchema, false, 'all');
  await loadManyToManyRelations(block, blockSchema, blockSlug, 'block_id', false, 'all');
}
