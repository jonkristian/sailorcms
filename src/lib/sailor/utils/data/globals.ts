import { db } from '../../core/db/index.server';
import { sql, ne, eq, asc, desc, and } from 'drizzle-orm';
import { globalTypes, files } from '../../generated/schema';
import * as schema from '../../generated/schema';
import type { GlobalTypes } from '../../generated/types';
import { TagService } from '../../core/services/tag.server';
import { toSnakeCase } from '../../core/utils/string';
import { log } from '../../core/utils/logger';
import { loadContentData as loadGlobalData } from './content-loader';

type User = {
  id: string;
  email: string;
  name: string;
  role: string;
  image?: string | null;
};

export interface GlobalWithData {
  id: string;
  slug: string;
  name_singular: string;
  name_plural: string;
  description: string | null;
  created_at: Date;
  updated_at: Date;
  [key: string]: any; // Dynamic fields from the global
}

export interface GlobalsOptions {
  // Single item queries
  itemSlug?: string; // Get specific item by slug
  itemId?: string; // Get specific item by ID

  // Multiple item queries
  parentId?: string; // Get children of this parent
  siblingOf?: string; // Get siblings of this item
  excludeCurrent?: boolean; // For siblings query (default: true)

  // Loading options
  withRelations?: boolean; // Include items relation for relational globals (default: true)
  withTags?: boolean; // Include tags for the global (default: false)
  loadFullFileObjects?: boolean; // Load full file objects vs just IDs (default: false)

  // Filtering and ordering
  groupBy?: string;
  orderBy?: string; // Default: 'sort'
  order?: 'asc' | 'desc'; // Default: 'asc'
  limit?: number;
  offset?: number;

  // Relationship filtering
  whereRelated?: {
    field: string; // The relation field name (e.g., 'categories')
    value: string | string[]; // Category slug(s) to filter by
  };

  // Security
  user?: User | null; // User context for ACL filtering
}

// Return types
export type GlobalsSingleResult = GlobalTypes | null;
export type GlobalsMultipleResult = {
  items: GlobalTypes[];
  total: number;
  hasMore?: boolean;
  grouped?: Record<string, GlobalTypes[]>;
};

/**
 * Get globals - single function for all global queries
 *
 * @example
 * ```typescript
 * // Multiple items
 * const navItems = await getGlobals('navigation');
 * const children = await getGlobals('navigation', { parentId: 'parent-id' });
 * const siblings = await getGlobals('navigation', { siblingOf: 'item-id' });
 *
 * // Single items
 * const settings = await getGlobals('settings', { itemSlug: 'main' });
 * const item = await getGlobals('navigation', { itemId: 'item-id' });
 *
 * // With options
 * const items = await getGlobals('navigation', {
 *   withTags: true,
 *   orderBy: 'created_at',
 *   order: 'desc',
 *   user: locals.user
 * });
 * ```
 */
export async function getGlobals(
  globalSlug: string,
  options?: GlobalsOptions
): Promise<GlobalsSingleResult | GlobalsMultipleResult> {
  const {
    itemSlug,
    itemId,
    parentId,
    siblingOf,
    excludeCurrent = true,
    withRelations = true,
    withTags = false,
    loadFullFileObjects = false,
    groupBy,
    orderBy = 'sort',
    order = 'asc',
    limit,
    offset = 0,
    user
  } = options || {};

  // Determine if this is a single item query
  const isSingleQuery = !!(itemSlug || itemId);

  try {
    // Get global type definition
    const globalType = await db.query.globalTypes.findFirst({
      where: eq(globalTypes.slug, globalSlug)
    });

    if (!globalType) {
      console.warn(`Global type '${globalSlug}' not found`);
      return isSingleQuery ? null : { items: [], total: 0 };
    }

    const isFlat = globalType.data_type === 'flat';

    // Handle singleton globals
    if (isFlat) {
      return await handleSingletonGlobal(globalSlug, globalType, {
        withRelations,
        withTags,
        loadFullFileObjects
      });
    }

    // Handle repeatable globals
    return await handleRepeatableGlobal(globalSlug, globalType, {
      isSingleQuery,
      itemSlug,
      itemId,
      parentId,
      siblingOf,
      excludeCurrent,
      withRelations,
      withTags,
      loadFullFileObjects,
      groupBy,
      orderBy,
      order,
      limit,
      offset,
      user
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error(`Failed to load globals '${globalSlug}':`, errorMessage);
    return isSingleQuery ? null : { items: [], total: 0 };
  }
}

/**
 * Handle singleton (flat) globals
 */
async function handleSingletonGlobal(
  globalSlug: string,
  globalType: any,
  options: {
    withRelations: boolean;
    withTags: boolean;
    loadFullFileObjects: boolean;
  }
): Promise<GlobalsSingleResult> {
  const { withRelations, withTags, loadFullFileObjects } = options;

  const globalTable = schema[`global_${globalSlug}` as keyof typeof schema];
  if (!globalTable) {
    console.warn(`Global table for '${globalSlug}' not found in schema`);
    return null;
  }

  const globalResult = await db
    .select()
    .from(globalTable)
    .where(eq((globalTable as any).id, globalSlug))
    .limit(1);

  if (globalResult.length === 0) {
    console.warn(`Global data for '${globalSlug}' not found`);
    return null;
  }

  const globalData = globalResult[0] as any;
  const enrichedGlobal = await enrichGlobalItem(globalData, globalSlug, globalType, {
    withRelations,
    withTags,
    loadFullFileObjects
  });

  return enrichedGlobal;
}

/**
 * Handle repeatable globals
 */
async function handleRepeatableGlobal(
  globalSlug: string,
  globalType: any,
  options: {
    isSingleQuery: boolean;
    itemSlug?: string;
    itemId?: string;
    parentId?: string;
    siblingOf?: string;
    excludeCurrent: boolean;
    withRelations: boolean;
    withTags: boolean;
    loadFullFileObjects: boolean;
    groupBy?: string;
    orderBy: string;
    order: 'asc' | 'desc';
    limit?: number;
    offset: number;
    user?: User | null;
  }
): Promise<GlobalsSingleResult | GlobalsMultipleResult> {
  const {
    isSingleQuery,
    itemSlug,
    itemId,
    parentId,
    siblingOf,
    excludeCurrent,
    withRelations,
    withTags,
    loadFullFileObjects,
    groupBy,
    orderBy,
    order,
    limit,
    offset
  } = options;

  const globalTable = schema[`global_${globalSlug}` as keyof typeof schema];
  if (!globalTable) {
    console.warn(`Global table for '${globalSlug}' not found in schema`);
    return isSingleQuery ? null : { items: [], total: 0 };
  }

  let queryBuilder = db.select().from(globalTable);
  const whereConditions = [];

  // Handle different query types
  if (itemSlug) {
    whereConditions.push(eq((globalTable as any).slug, itemSlug));
  } else if (itemId) {
    whereConditions.push(eq((globalTable as any).id, itemId));
  } else if (parentId) {
    whereConditions.push(eq((globalTable as any).parent_id, parentId));
  } else if (siblingOf) {
    // Get siblings
    const siblingItem = await db
      .select({ parent_id: (globalTable as any).parent_id })
      .from(globalTable)
      .where(eq((globalTable as any).id, siblingOf))
      .limit(1);

    if (siblingItem.length > 0 && siblingItem[0].parent_id) {
      whereConditions.push(eq((globalTable as any).parent_id, siblingItem[0].parent_id));
      if (excludeCurrent) {
        whereConditions.push(ne((globalTable as any).id, siblingOf));
      }
    } else {
      // No parent found, no siblings
      whereConditions.push(sql`1 = 0`);
    }
  }

  // Apply where conditions
  if (whereConditions.length > 0) {
    queryBuilder = queryBuilder.where(
      whereConditions.length > 1 ? and(...whereConditions) : whereConditions[0]
    );
  }

  // Apply ordering for multiple items or when no specific filters
  if (!isSingleQuery || (!itemSlug && !itemId)) {
    const orderField = (globalTable as any)[orderBy];
    if (orderField) {
      const orderFn = order === 'desc' ? desc : asc;
      queryBuilder = queryBuilder.orderBy(orderFn(orderField));
    }
  }

  // Apply pagination for multiple items
  if (!isSingleQuery && limit) {
    queryBuilder = queryBuilder.limit(limit).offset(offset);
  } else if (isSingleQuery) {
    queryBuilder = queryBuilder.limit(1);
  }

  const results = await queryBuilder;

  if (isSingleQuery) {
    if (results.length === 0) return null;

    const item = await enrichGlobalItem(results[0], globalSlug, globalType, {
      withRelations,
      withTags,
      loadFullFileObjects
    });
    return item;
  }

  // Multiple items
  const enrichedItems = await Promise.all(
    results.map((item: Record<string, any>) =>
      enrichGlobalItem(item, globalSlug, globalType, {
        withRelations,
        withTags,
        loadFullFileObjects
      })
    )
  );

  const result: GlobalsMultipleResult = {
    items: enrichedItems,
    total: enrichedItems.length,
    hasMore: limit ? offset + enrichedItems.length < enrichedItems.length : false
  };

  // Group items if requested
  if (groupBy) {
    result.grouped = groupItemsByField(enrichedItems, groupBy);
  }

  return result;
}

/**
 * Enrich a single global item with relations, tags, and data
 */
async function enrichGlobalItem(
  item: Record<string, any>,
  globalSlug: string,
  globalType: Record<string, any>,
  options: {
    withRelations: boolean;
    withTags: boolean;
    loadFullFileObjects: boolean;
  }
): Promise<GlobalTypes> {
  const { withRelations, withTags, loadFullFileObjects } = options;

  // Parse dates properly
  const parseDate = (dateValue: any): Date => {
    if (!dateValue) return new Date();
    if (dateValue instanceof Date) return dateValue;
    if (typeof dateValue === 'string') {
      const isoDate = new Date(dateValue);
      if (!isNaN(isoDate.getTime())) return isoDate;
    }
    if (typeof dateValue === 'number') {
      const timestamp = dateValue > 10000000000 ? dateValue : dateValue * 1000;
      return new Date(timestamp);
    }
    return new Date();
  };

  const enrichedItem: any = {
    ...item,
    created_at: parseDate(item.created_at),
    updated_at: parseDate(item.updated_at)
  };

  // Load tags if requested
  if (withTags) {
    try {
      const tags = await TagService.getTagsForEntity(`global_${globalSlug}`, enrichedItem.id);
      const globalFields = JSON.parse(globalType.schema);
      Object.entries(globalFields).forEach(([fieldName, fieldDef]) => {
        if ((fieldDef as any).type === 'tags') {
          enrichedItem[fieldName] = tags;
        }
      });
    } catch (err) {
      console.warn(`Failed to load tags for global '${globalSlug}':`, err);
    }
  }

  // Load items relation if requested
  if (withRelations) {
    try {
      const relationTableName = `global_${globalSlug}_items`;
      const relationTable = schema[relationTableName as keyof typeof schema];

      if (relationTable) {
        const relationResult = await db
          .select()
          .from(relationTable)
          .where(eq((relationTable as any).global_id, enrichedItem.id))
          .orderBy(asc((relationTable as any).sort));
        enrichedItem.items = relationResult;
      } else {
        enrichedItem.items = [];
      }
    } catch (err) {
      console.error(`Error loading relations for ${enrichedItem.id}:`, err);
      enrichedItem.items = [];
    }
  }

  // Load global data (arrays, files, many-to-many relations)
  if (withRelations) {
    try {
      const globalFields = JSON.parse(globalType.schema);
      const preservedItems = enrichedItem.items;

      await loadGlobalData(enrichedItem, globalFields, {
        contentType: 'global',
        slug: globalSlug,
        loadFullFileObjects
      });

      enrichedItem.items = preservedItems;
    } catch (err) {
      console.warn(`Failed to load global data for '${globalSlug}':`, err);
    }
  }

  return enrichedItem;
}

/**
 * Group items by a specific field - handles both regular fields and tag arrays
 */
function groupItemsByField<T>(items: T[], fieldName: string): Record<string, T[]> {
  return items.reduce(
    (groups, item) => {
      const value = (item as any)[fieldName];

      if (value !== undefined && value !== null) {
        // Handle tag arrays (multiple tags per item)
        if (Array.isArray(value)) {
          const tagNames = value.map((tag) =>
            typeof tag === 'string' ? tag : tag.name || tag.title || String(tag)
          );

          tagNames.forEach((tagName) => {
            if (!groups[tagName]) {
              groups[tagName] = [];
            }
            groups[tagName].push(item);
          });
        } else {
          // Handle regular fields
          const key = typeof value === 'string' ? value : String(value);
          if (!groups[key]) {
            groups[key] = [];
          }
          groups[key].push(item);
        }
      }

      return groups;
    },
    {} as Record<string, T[]>
  );
}

/**
 * Utility to get all available global types
 *
 * @example
 * ```typescript
 * const globalTypes = await getAvailableGlobalTypes();
 * // Returns: ['navigation', 'settings', 'footer', ...]
 * ```
 */
export async function getAvailableGlobalTypes(): Promise<string[]> {
  const globalTypes = await db.query.globalTypes.findMany();
  return globalTypes.map((gt: any) => gt.slug);
}

/**
 * Utility to check if a global type exists
 *
 * @example
 * ```typescript
 * if (await globalTypeExists('site_settings')) {
 *   // Global type is available
 * }
 * ```
 */
export async function globalTypeExists(globalType: string): Promise<boolean> {
  const availableTypes = await getAvailableGlobalTypes();
  return availableTypes.includes(globalType);
}
