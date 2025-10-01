import { db } from '../../core/db/index.server';
import { sql, eq, asc, desc, and } from 'drizzle-orm';
import { blockTypes as blockTypesTable, files, globalTypes } from '../../generated/schema';
import * as schema from '../../generated/schema';
import { toSnakeCase } from '../../core/utils/string';
import { log } from '../../core/utils/logger';
import { loadBlockData } from './content-loader';

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

export interface BlocksOptions {
  // Single block queries
  itemId?: string; // Get specific block by ID

  // Multiple block queries
  collectionId?: string; // Get blocks for a specific collection

  // Loading options
  withRelations?: boolean; // Include file/array/many-to-many relations (default: true)
  loadFullFileObjects?: boolean; // Load full file objects vs just IDs (default: false)

  // Filtering and ordering
  orderBy?: 'sort' | 'created_at' | 'updated_at'; // Default: 'sort'
  order?: 'asc' | 'desc'; // Default: 'asc'
  limit?: number;
  offset?: number;

  // Relationship filtering
  whereRelated?: {
    field: string; // The relation field name (e.g., 'categories')
    value: string | string[]; // Category slug(s) to filter by
  };
}

// Return types
export type BlocksSingleResult = BlockWithRelations | null;
export type BlocksMultipleResult = {
  items: BlockWithRelations[];
  total: number;
};

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

      // Load relations for each block using unified content loader
      const blocksWithRelations = await Promise.all(
        blocks.map(async (block: any) => {
          const enrichedBlock: BlockWithRelations = {
            ...block,
            blockType: blockType.slug
          };

          // Use unified content loader for all relations (files, arrays, many-to-many)
          if (includeFileRelations || includeArrayRelations) {
            const blockSchema = JSON.parse(blockType.schema);
            await loadBlockData(
              enrichedBlock,
              blockType.slug,
              blockSchema,
              undefined, // parentTableName
              false // loadFullFileObjects = false for better performance
            );
          }

          return enrichedBlock;
        })
      );

      allBlocks.push(...blocksWithRelations);
    } catch (err) {
      // Log the actual error to help with debugging
      console.error(`Error loading blocks for type '${blockType.slug}':`, err);
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
      where: eq(blockTypesTable.slug, blockType)
    });

    if (blockTypeDef) {
      const blockSchema = JSON.parse(blockTypeDef.schema);
      await loadBlockData(
        enrichedBlock,
        blockType,
        blockSchema,
        undefined, // parentTableName
        true // loadFullFileObjects = true for single block queries
      );
    }

    return enrichedBlock;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error(`Failed to load block ${blockId} of type ${blockType}:`, errorMessage);
    return null;
  }
}

/**
 * Get blocks - single function for all block queries
 *
 * @example
 * ```typescript
 * // Multiple blocks
 * const blocks = await getBlocks('hero');
 * const collectionBlocks = await getBlocks('hero', { collectionId: 'collection-id' });
 *
 * // Single block
 * const block = await getBlocks('hero', { itemId: 'block-id' });
 *
 * // With options
 * const blocks = await getBlocks('hero', {
 *   withRelations: true,
 *   loadFullFileObjects: true,
 *   orderBy: 'created_at'
 * });
 * ```
 */
export async function getBlocks(
  blockType: string,
  options?: BlocksOptions
): Promise<BlocksSingleResult | BlocksMultipleResult> {
  const {
    itemId,
    collectionId,
    withRelations = true,
    loadFullFileObjects = false,
    orderBy = 'sort',
    order = 'asc',
    limit,
    offset = 0
  } = options || {};

  // Determine if this is a single item query
  const isSingleQuery = !!itemId;

  try {
    // Get block type definition
    const blockTypeDef = await db.query.blockTypes.findFirst({
      where: eq(blockTypesTable.slug, blockType)
    });

    if (!blockTypeDef) {
      console.warn(`Block type '${blockType}' not found`);
      return isSingleQuery ? null : { items: [], total: 0 };
    }

    // Get the block table
    const blockTable = schema[`block_${blockType}` as keyof typeof schema];
    if (!blockTable) {
      console.warn(`Block table for '${blockType}' not found in schema`);
      return isSingleQuery ? null : { items: [], total: 0 };
    }

    // Handle single block query
    if (isSingleQuery) {
      const blockResult = await db
        .select()
        .from(blockTable)
        .where(eq((blockTable as any).id, itemId))
        .limit(1);

      if (blockResult.length === 0) {
        return null;
      }

      const block = await enrichBlock(blockResult[0], blockType, blockTypeDef, {
        withRelations,
        loadFullFileObjects
      });

      return block;
    }

    // Handle multiple blocks query
    let queryBuilder = db.select().from(blockTable);
    const whereConditions = [];

    // Filter by collection if specified
    if (collectionId) {
      whereConditions.push(eq((blockTable as any).collection_id, collectionId));
    }

    // Apply where conditions
    if (whereConditions.length > 0) {
      queryBuilder = queryBuilder.where(whereConditions[0]);
    }

    // Apply ordering
    const orderField = (blockTable as any)[orderBy];
    if (orderField) {
      const orderFn = order === 'desc' ? desc : asc;
      queryBuilder = queryBuilder.orderBy(orderFn(orderField));
    }

    // Apply pagination
    if (limit) {
      queryBuilder = queryBuilder.limit(limit).offset(offset);
    }

    const blocks = await queryBuilder;

    // Enrich all blocks
    const enrichedBlocks = await Promise.all(
      blocks.map((block: Record<string, any>) =>
        enrichBlock(block, blockType, blockTypeDef, {
          withRelations,
          loadFullFileObjects
        })
      )
    );

    return {
      items: enrichedBlocks,
      total: enrichedBlocks.length
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error(`Failed to load blocks '${blockType}':`, errorMessage);
    return isSingleQuery ? null : { items: [], total: 0 };
  }
}

/**
 * Enrich a single block with relations and data
 */
async function enrichBlock(
  block: Record<string, any>,
  blockType: string,
  blockTypeDef: Record<string, any>,
  options: {
    withRelations: boolean;
    loadFullFileObjects: boolean;
  }
): Promise<BlockWithRelations> {
  const { withRelations, loadFullFileObjects } = options;

  const enrichedBlock: BlockWithRelations = {
    ...block,
    blockType,
    id: block.id,
    collection_id: block.collection_id,
    sort: block.sort,
    created_at: block.created_at,
    updated_at: block.updated_at
  };

  // Load relations if requested
  if (withRelations) {
    const blockSchema = JSON.parse(blockTypeDef.schema);
    await loadBlockData(
      enrichedBlock,
      blockType,
      blockSchema,
      undefined, // parentTableName
      loadFullFileObjects
    );
  }

  return enrichedBlock;
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
