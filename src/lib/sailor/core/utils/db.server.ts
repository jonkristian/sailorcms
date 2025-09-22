import { db } from '../db/index.server';
import { eq } from 'drizzle-orm';
import * as schema from '../../generated/schema';

/**
 * Get collection options from database
 */
export async function getCollectionOptions(collectionSlug: string): Promise<{
  basePath?: string;
  seo?: boolean;
  blocks?: boolean;
  sortable?: boolean;
  nestable?: boolean;
} | null> {
  try {
    const collectionTypeResults = await db
      .select()
      .from(schema.collectionTypes)
      .where(eq(schema.collectionTypes.slug, collectionSlug))
      .limit(1);

    const collectionType = collectionTypeResults[0];
    if (!collectionType) return null;

    try {
      return JSON.parse(collectionType.options || '{}');
    } catch (parseError) {
      console.error(`Failed to parse collection options JSON for ${collectionSlug}:`, parseError);
      return {};
    }
  } catch (error) {
    console.error(`Failed to get collection options for ${collectionSlug}:`, error);
    return null;
  }
}

/**
 * Get global options from database
 */
export async function getGlobalOptions(globalSlug: string): Promise<{
  sortable?: boolean;
  nestable?: boolean;
  inline?: boolean;
  titleField?: string;
  readonly?: boolean;
  defaultSort?: { field: string; direction: 'asc' | 'desc' };
} | null> {
  try {
    const globalTypeResults = await db
      .select()
      .from(schema.globalTypes)
      .where(eq(schema.globalTypes.slug, globalSlug))
      .limit(1);

    const globalType = globalTypeResults[0];
    if (!globalType) return null;

    try {
      return JSON.parse(globalType.options || '{}');
    } catch (parseError) {
      console.error(`Failed to parse global options JSON for ${globalSlug}:`, parseError);
      return {};
    }
  } catch (error) {
    console.error(`Failed to get global options for ${globalSlug}:`, error);
    return null;
  }
}

/**
 * Get block options from database
 */
export async function getBlockOptions(blockSlug: string): Promise<{ titleField?: string } | null> {
  try {
    const blockTypeResults = await db
      .select()
      .from(schema.blockTypes)
      .where(eq(schema.blockTypes.slug, blockSlug))
      .limit(1);

    const blockType = blockTypeResults[0];
    if (!blockType) return null;

    // Block types don't have options field yet, but adding for future extensibility
    return {}; // JSON.parse(blockType.options || '{}');
  } catch (error) {
    console.error(`Failed to get block options for ${blockSlug}:`, error);
    return null;
  }
}

/**
 * Get complete collection type from database
 */
export async function getCollectionType(collectionSlug: string) {
  try {
    const collectionTypeResults = await db
      .select()
      .from(schema.collectionTypes)
      .where(eq(schema.collectionTypes.slug, collectionSlug))
      .limit(1);

    const collectionType = collectionTypeResults[0];
    if (!collectionType) return null;

    return {
      id: collectionType.id,
      name: {
        singular: collectionType.name_singular,
        plural: collectionType.name_plural
      },
      slug: collectionType.slug,
      description: collectionType.description,
      icon: collectionType.icon,
      fields: JSON.parse(collectionType.schema),
      options: JSON.parse(collectionType.options || '{}'),
      created_at: collectionType.created_at,
      updated_at: collectionType.updated_at
    };
  } catch (error) {
    console.error(`Failed to get collection type for ${collectionSlug}:`, error);
    return null;
  }
}

/**
 * Get complete global type from database
 */
export async function getGlobalType(globalSlug: string) {
  try {
    const globalTypeResults = await db
      .select()
      .from(schema.globalTypes)
      .where(eq(schema.globalTypes.slug, globalSlug))
      .limit(1);

    const globalType = globalTypeResults[0];
    if (!globalType) return null;

    return {
      id: globalType.id,
      name: {
        singular: globalType.name_singular,
        plural: globalType.name_plural
      },
      slug: globalType.slug,
      description: globalType.description,
      icon: globalType.icon,
      dataType: globalType.data_type,
      fields: JSON.parse(globalType.schema),
      options: JSON.parse(globalType.options || '{}'),
      created_at: globalType.created_at,
      updated_at: globalType.updated_at
    };
  } catch (error) {
    console.error(`Failed to get global type for ${globalSlug}:`, error);
    return null;
  }
}

/**
 * Get complete block type from database
 */
export async function getBlockType(blockSlug: string) {
  try {
    const blockTypeResults = await db
      .select()
      .from(schema.blockTypes)
      .where(eq(schema.blockTypes.slug, blockSlug))
      .limit(1);

    const blockType = blockTypeResults[0];
    if (!blockType) return null;

    return {
      id: blockType.id,
      name: blockType.name,
      slug: blockType.slug,
      description: blockType.description,
      fields: JSON.parse(blockType.schema),
      created_at: blockType.created_at,
      updated_at: blockType.updated_at
    };
  } catch (error) {
    console.error(`Failed to get block type for ${blockSlug}:`, error);
    return null;
  }
}
