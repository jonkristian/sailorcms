import { db } from '../core/db/index.server';
import { sql, eq, asc, desc } from 'drizzle-orm';
import { blockTypes, files } from '../generated/schema';
import * as schema from '../generated/schema';
import { loadBlockData } from '../core/content/blocks.server';

export interface BlockWithRelations {
  id: string;
  blockType: string;
  collection_id: string;
  sort: number;
  created_at: Date;
  updated_at: Date;
  [key: string]: any; // Dynamic fields from the block
}

export interface LoadBlocksOptions {
  collectionId?: string;
  blockTypes?: string[];
  includeFileRelations?: boolean;
  includeArrayRelations?: boolean;
  orderBy?: 'sort' | 'created_at' | 'updated_at';
  order?: 'asc' | 'desc';
}

/**
 * Load blocks with all their relations for a collection
 *
 * @example
 * ```typescript
 * // Load all blocks for a page
 * const blocks = await loadBlocksForCollection(page.id);
 *
 * // Load only specific block types
 * const heroBlocks = await loadBlocksForCollection(page.id, {
 *   blockTypes: ['hero', 'rich_text']
 * });
 * ```
 */
export async function loadBlocksForCollection(
  collectionId: string,
  options: Omit<LoadBlocksOptions, 'collectionId'> = {}
): Promise<BlockWithRelations[]> {
  return loadBlocks({ ...options, collectionId });
}

/**
 * Load blocks with optional filtering and relations
 *
 * @example
 * ```typescript
 * // Load all blocks across the site
 * const allBlocks = await loadBlocks();
 *
 * // Load blocks with custom sorting
 * const recentBlocks = await loadBlocks({
 *   orderBy: 'created_at',
 *   order: 'desc'
 * });
 *
 * // Load specific block types only
 * const mediaBlocks = await loadBlocks({
 *   blockTypes: ['media_block', 'gallery']
 * });
 * ```
 */
export async function loadBlocks(options: LoadBlocksOptions = {}): Promise<BlockWithRelations[]> {
  const {
    collectionId,
    blockTypes: filterBlockTypes,
    includeFileRelations = true,
    includeArrayRelations = true,
    orderBy = 'sort',
    order = 'asc'
  } = options;

  // Get available block types from registry
  const availableBlockTypes = await db.query.blockTypes.findMany();
  const blockTypesToLoad = filterBlockTypes
    ? availableBlockTypes.filter((bt: any) => filterBlockTypes.includes(bt.slug))
    : availableBlockTypes;

  const allBlocks: BlockWithRelations[] = [];

  // Load blocks for each block type
  for (const blockType of blockTypesToLoad) {
    try {
      // Build the base query
      const params: any[] = [];

      if (collectionId) {
        params.push(collectionId);
      }

      // Get blocks from the dynamic table
      const blockTable = schema[`block_${blockType.slug}` as keyof typeof schema];
      if (!blockTable) {
        console.warn(`Block table for '${blockType.slug}' not found in schema`);
        continue;
      }

      let query = db.select().from(blockTable);

      if (collectionId) {
        query = query.where(eq((blockTable as any).collection_id, collectionId));
      }

      // Add ordering
      const orderField = (blockTable as any)[orderBy];
      if (orderField) {
        const orderFn = order === 'desc' ? desc : asc;
        query = query.orderBy(orderFn(orderField));
      }

      const blocks = await query;

      // Load relations for each block
      const blocksWithRelations = await Promise.all(
        blocks.map(async (block: any) => {
          const enrichedBlock: BlockWithRelations = {
            ...block,
            blockType: blockType.slug
          };

          if (includeFileRelations) {
            await loadFileRelations(enrichedBlock, blockType);
          }

          if (includeArrayRelations) {
            await loadArrayRelations(enrichedBlock, blockType);
          }

          return enrichedBlock;
        })
      );

      allBlocks.push(...blocksWithRelations);
    } catch {
      // Block table doesn't exist yet - skip this block type
      console.warn(`Block table block_${blockType.slug} doesn't exist yet, skipping`);
    }
  }

  // Sort all blocks together if we have multiple block types
  if (blockTypesToLoad.length > 1) {
    allBlocks.sort((a, b) => {
      const aValue = a[orderBy as keyof BlockWithRelations];
      const bValue = b[orderBy as keyof BlockWithRelations];

      // Handle Date objects for timestamp fields
      if (aValue instanceof Date && bValue instanceof Date) {
        return order === 'desc'
          ? bValue.getTime() - aValue.getTime()
          : aValue.getTime() - bValue.getTime();
      }

      // Handle numeric values
      const aNum = Number(aValue);
      const bNum = Number(bValue);

      if (order === 'desc') {
        return bNum - aNum;
      }
      return aNum - bNum;
    });
  }

  return allBlocks;
}

/**
 * Load a single block with all its relations
 *
 * @example
 * ```typescript
 * const block = await loadBlockById('block-uuid', 'media_block');
 * if (block) {
 *   // block.image contains File object with full metadata
 *   // block.callToAction contains Array of CTA items
 * }
 * ```
 */
export async function loadBlockById(
  blockId: string,
  blockType: string
): Promise<BlockWithRelations | null> {
  try {
    // Get the specific block
    const blockTable = schema[`block_${blockType}` as keyof typeof schema];
    if (!blockTable) {
      console.warn(`Block table for '${blockType}' not found in schema`);
      return null;
    }

    const blockResult = await db
      .select()
      .from(blockTable)
      .where(eq((blockTable as any).id, blockId))
      .limit(1);

    if (blockResult.length === 0) {
      return null;
    }

    const block = blockResult[0] as any;
    const enrichedBlock: BlockWithRelations = {
      ...block,
      blockType
    };

    // Get block type definition for field info
    const blockTypeDef = await db.query.blockTypes.findFirst({
      where: eq(blockTypes.slug, blockType)
    });

    if (blockTypeDef) {
      await loadFileRelations(enrichedBlock, blockTypeDef);
      await loadArrayRelations(enrichedBlock, blockTypeDef);
    }

    return enrichedBlock;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error(`Failed to load block ${blockId} of type ${blockType}:`, errorMessage);
    return null;
  }
}

/**
 * Load file relations for a block
 */
async function loadFileRelations(
  block: BlockWithRelations,
  blockType: { slug: string; schema: string; [key: string]: any }
) {
  const blockFields = JSON.parse(blockType.schema);
  const fileFields = Object.entries(blockFields).filter(
    ([_, fieldDef]: [string, any]) => fieldDef.type === 'file'
  );

  for (const [fieldName] of fileFields) {
    try {
      const relationTableName = `block_${blockType.slug}_${fieldName}`;

      // Try to use Drizzle first, fallback to raw SQL for dynamic tables
      const relationTable = schema[relationTableName as keyof typeof schema];
      let fileResult: any;

      if (relationTable) {
        const result = await db
          .select({ id: files.id })
          .from(files)
          .innerJoin(relationTable, eq(files.id, (relationTable as any).file_id))
          .where(eq((relationTable as any).parent_id, block.id))
          .orderBy(asc((relationTable as any).sort));
        fileResult = { rows: result };
      } else {
        // Fallback to raw SQL for dynamic relation tables
        fileResult = await db.run(
          sql`SELECT f.id FROM files f 
              JOIN ${sql.identifier(relationTableName)} bf ON f.id = bf.file_id 
              WHERE bf.parent_id = ${block.id} 
              ORDER BY bf.sort`
        );
      }

      const fileIds = fileResult.rows
        .map((row: any) => row.id)
        .filter((id: any): id is string => typeof id === 'string' && id != null);

      // Determine if this is a single file or multiple files
      const fieldDef = blockFields[fieldName];
      const isMultiple = fieldDef.file?.multiple === true;

      // Load complete file objects from database (we now store URLs directly)
      const fileObjects = await Promise.all(
        fileIds.map(async (fileId: any) => {
          const fileResult = await db.select().from(files).where(eq(files.id, fileId)).limit(1);
          return fileResult[0] || null;
        })
      );

      const validFileObjects = fileObjects.filter((file) => file !== null);

      if (isMultiple) {
        block[fieldName] = validFileObjects;
      } else {
        block[fieldName] = validFileObjects.length > 0 ? validFileObjects[0] : null;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error(
        `Failed to load file relation for ${fieldName} in ${blockType.slug}:`,
        errorMessage
      );
      // File relation table doesn't exist yet
      const fieldDef = blockFields[fieldName];
      const isMultiple = fieldDef.file?.multiple === true;
      block[fieldName] = isMultiple ? [] : null;
    }
  }
}

/**
 * Load array relations for a block
 */
async function loadArrayRelations(
  block: BlockWithRelations,
  blockType: { slug: string; schema: string; [key: string]: any }
) {
  const blockFields = JSON.parse(blockType.schema);
  const arrayFields = Object.entries(blockFields).filter(
    ([_, fieldDef]: [string, any]) => fieldDef.type === 'array' && fieldDef.items?.type === 'object'
  );

  for (const [fieldName] of arrayFields) {
    try {
      const relationTableName = `block_${blockType.slug}_${fieldName}`;
      const relationTable = schema[relationTableName as keyof typeof schema];

      if (!relationTable) {
        console.warn(`Relation table '${relationTableName}' not found in schema`);
        continue;
      }

      const arrayResult = await db
        .select()
        .from(relationTable)
        .where(eq((relationTable as any).block_id, block.id))
        .orderBy(asc((relationTable as any).sort));

      // Load nested arrays recursively
      const arrayItems = await Promise.all(
        arrayResult.map(async (row: any) => {
          const item = { ...row };
          await loadBlockData(
            item,
            blockType.slug,
            blockFields[fieldName].items.properties,
            relationTableName,
            true
          );

          // Load file fields from relation tables for this array item
          const itemProperties = blockFields[fieldName].items.properties;
          for (const [itemFieldName, itemFieldDef] of Object.entries(itemProperties)) {
            const itemTypedFieldDef = itemFieldDef as any;
            if (itemTypedFieldDef.type === 'file') {
              const fileTableName = `${relationTableName}_${itemFieldName}`;
              try {
                const fileRelationTable = schema[fileTableName as keyof typeof schema];
                if (fileRelationTable) {
                  const fileResult = await db
                    .select()
                    .from(files)
                    .innerJoin(fileRelationTable, eq(files.id, (fileRelationTable as any).file_id))
                    .where(eq((fileRelationTable as any).parent_id, item.id))
                    .orderBy(asc((fileRelationTable as any).sort));

                  if (fileResult.length > 0) {
                    if (itemTypedFieldDef.multiple) {
                      item[itemFieldName] = fileResult.map((row: any) => row.files);
                    } else {
                      item[itemFieldName] = fileResult[0].files;
                    }
                  } else {
                    item[itemFieldName] = itemTypedFieldDef.multiple ? [] : null;
                  }
                } else {
                  item[itemFieldName] = itemTypedFieldDef.multiple ? [] : null;
                }
              } catch (err) {
                console.warn(
                  `Failed to load file field '${itemFieldName}' from table '${fileTableName}'`,
                  {
                    fieldName: itemFieldName,
                    fileTableName,
                    parentId: item.id,
                    error: err
                  }
                );
                item[itemFieldName] = itemTypedFieldDef.multiple ? [] : null;
              }
            }
          }

          return item;
        })
      );

      block[fieldName] = arrayItems;
    } catch {
      // Array relation table doesn't exist yet
      block[fieldName] = [];
    }
  }
}

/**
 * Utility to get all available block types
 *
 * @example
 * ```typescript
 * const blockTypes = await getAvailableBlockTypes();
 * // Returns: ['hero', 'rich_text', 'media_block', ...]
 * ```
 */
export async function getAvailableBlockTypes(): Promise<string[]> {
  const blockTypes = await db.query.blockTypes.findMany();
  return blockTypes.map((bt: any) => bt.slug);
}

/**
 * Utility to check if a block type exists
 *
 * @example
 * ```typescript
 * if (await blockTypeExists('media_block')) {
 *   // Block type is available
 * }
 * ```
 */
export async function blockTypeExists(blockType: string): Promise<boolean> {
  const availableTypes = await getAvailableBlockTypes();
  return availableTypes.includes(blockType);
}
