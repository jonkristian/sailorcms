import { db } from '../../core/db/index.server';
import { sql, ne, eq, and, asc, desc, count, inArray } from 'drizzle-orm';
import { loadBlocksForCollection, type BlockWithRelations } from './blocks';
import { toSnakeCase } from '../../core/utils/string';
import type { CollectionTypes } from '../../generated/types';
import type { Pagination } from '../../core/types';
import type { BreadcrumbItem } from '../types';
import { getCollectionType } from '../../core/utils/db.server';
import * as schema from '../../generated/schema';
import { getGlobals } from './globals';
import { loadContentData } from './content-loader';

type User = {
  id: string;
  email: string;
  name: string;
  role: string;
  image?: string | null;
};

// Enhanced collection item type that extends generated types with utility fields
export type CollectionItem = {
  url: string; // Auto-generated URL for the item
  breadcrumbs?: BreadcrumbItem[]; // Auto-generated breadcrumb trail
  blocks?: BlockWithRelations[];
  [key: string]: any; // Dynamic fields from the collection
};

export interface CollectionsOptions {
  // Single item queries
  itemSlug?: string; // Get specific item by slug
  itemId?: string; // Get specific item by ID

  // Multiple item queries
  parentId?: string; // Get children of this parent
  siblingOf?: string; // Get siblings of this item
  excludeCurrent?: boolean; // For siblings query (default: true)

  // Content options
  status?: 'published' | 'draft' | 'all'; // Default: 'published'
  includeBlocks?: boolean; // Default: true
  includeBreadcrumbs?: boolean; // Generate breadcrumb navigation (default: false)
  includeAuthors?: boolean; // Populate author details (default: false)

  // Filtering and ordering
  orderBy?: string; // Default: 'created_at'
  order?: 'asc' | 'desc'; // Default: 'desc'
  groupBy?: string;
  limit?: number;
  offset?: number;

  // Pagination URL generation
  baseUrl?: string;
  currentPage?: number;

  // Relationship filtering
  whereRelated?: {
    field: string; // The relation field name (e.g., 'categories')
    value: string | string[]; // Category slug(s) to filter by
    recursive?: boolean; // Include all descendant categories (default: false)
  };

  // Security
  user?: User | null; // User context for ACL filtering
}

// Return types
export type CollectionsSingleResult =
  | (CollectionTypes & {
      url: string;
      breadcrumbs?: BreadcrumbItem[];
      blocks?: BlockWithRelations[];
    })
  | null;

export type CollectionsMultipleResult = {
  items: (CollectionTypes & {
    url: string;
    breadcrumbs?: BreadcrumbItem[];
    blocks?: BlockWithRelations[];
  })[];
  total: number;
  hasMore: boolean;
  pagination?: Pagination;
  grouped?: Record<
    string,
    (CollectionTypes & {
      url: string;
      breadcrumbs?: BreadcrumbItem[];
      blocks?: BlockWithRelations[];
    })[]
  >;
};

/**
 * Get collections - single function for all collection queries
 *
 * ⚠️  SECURITY: Always pass user context for permission filtering in production!
 * Without user context, this function returns ALL content regardless of permissions.
 *
 * @example
 * ```typescript
 * // Multiple items
 * const posts = await getCollections('posts', { user: locals.user });
 * const children = await getCollections('posts', { parentId: 'parent-id', user: locals.user });
 * const siblings = await getCollections('posts', { siblingOf: 'item-id', user: locals.user });
 *
 * // Single items
 * const post = await getCollections('posts', { itemSlug: 'my-post', user: locals.user });
 * const item = await getCollections('posts', { itemId: 'item-id', user: locals.user });
 *
 * // With pagination
 * const posts = await getCollections('posts', {
 *   limit: 10,
 *   currentPage: 2,
 *   baseUrl: '/blog',
 *   user: locals.user
 * });
 *
 * // Filter by related content
 * const techPosts = await getCollections('posts', {
 *   whereRelated: { field: 'categories', value: 'technology' },
 *   user: locals.user
 * });
 * ```
 */
export async function getCollections(
  collectionSlug: string,
  options?: CollectionsOptions
): Promise<CollectionsSingleResult | CollectionsMultipleResult> {
  const {
    itemSlug,
    itemId,
    parentId,
    siblingOf,
    excludeCurrent = true,
    status = 'published',
    includeBlocks = true,
    includeBreadcrumbs = false,
    includeAuthors = false,
    orderBy = 'created_at',
    order = 'desc',
    groupBy,
    limit,
    offset = 0,
    baseUrl,
    currentPage,
    whereRelated,
    user
  } = options || {};

  // Determine if this is a single item query
  const isSingleQuery = !!(itemSlug || itemId);

  try {
    // Get the table dynamically from schema
    const table = schema[`collection_${collectionSlug}` as keyof typeof schema];
    if (!table) {
      console.error(`Collection '${collectionSlug}' not found in schema`);
      return isSingleQuery ? null : { items: [], total: 0, hasMore: false };
    }

    // Handle single item queries
    if (isSingleQuery) {
      return await handleSingleCollectionItem(table, collectionSlug, {
        itemSlug,
        itemId,
        status,
        includeBlocks,
        includeBreadcrumbs,
        includeAuthors,
        user
      });
    }

    // Handle multiple items queries
    return await handleMultipleCollectionItems(table, collectionSlug, {
      parentId,
      siblingOf,
      excludeCurrent,
      status,
      includeBlocks,
      includeBreadcrumbs,
      includeAuthors,
      orderBy,
      order,
      groupBy,
      limit,
      offset,
      baseUrl,
      currentPage,
      whereRelated,
      user
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error(`Failed to load collections '${collectionSlug}':`, errorMessage);
    return isSingleQuery ? null : { items: [], total: 0, hasMore: false };
  }
}

/**
 * Handle single collection item query
 */
async function handleSingleCollectionItem(
  table: any,
  collectionSlug: string,
  options: {
    itemSlug?: string;
    itemId?: string;
    status: string;
    includeBlocks: boolean;
    includeBreadcrumbs: boolean;
    includeAuthors: boolean;
    user?: User | null;
  }
): Promise<CollectionsSingleResult> {
  const { itemSlug, itemId, status, includeBlocks, includeBreadcrumbs, includeAuthors, user } =
    options;

  const whereConditions = [];

  if (itemSlug) {
    whereConditions.push(eq((table as any).slug, itemSlug));
  }
  if (itemId) {
    whereConditions.push(eq((table as any).id, itemId));
  }

  if (status !== 'all') {
    whereConditions.push(eq((table as any).status, status));
  }

  const whereClause = whereConditions.length > 1 ? and(...whereConditions) : whereConditions[0];
  const result = await db.select().from(table).where(whereClause).limit(1);

  if (result.length === 0) {
    return null;
  }

  const item = await enrichCollectionItem(result[0], collectionSlug, {
    includeBlocks,
    includeBreadcrumbs,
    includeAuthors
  });

  return item as CollectionsSingleResult;
}

/**
 * Handle multiple collection items query
 */
async function handleMultipleCollectionItems(
  table: any,
  collectionSlug: string,
  options: {
    parentId?: string;
    siblingOf?: string;
    excludeCurrent: boolean;
    status: string;
    includeBlocks: boolean;
    includeBreadcrumbs: boolean;
    includeAuthors: boolean;
    orderBy: string;
    order: 'asc' | 'desc';
    groupBy?: string;
    limit?: number;
    offset: number;
    baseUrl?: string;
    currentPage?: number;
    whereRelated?: {
      field: string;
      value: string | string[];
    };
    user?: User | null;
  }
): Promise<CollectionsMultipleResult> {
  const {
    parentId,
    siblingOf,
    excludeCurrent,
    status,
    includeBlocks,
    includeBreadcrumbs,
    includeAuthors,
    orderBy,
    order,
    groupBy,
    limit,
    offset,
    baseUrl,
    currentPage,
    whereRelated,
    user
  } = options;

  const whereConditions = [];

  if (status !== 'all') {
    whereConditions.push(eq((table as any).status, status));
  }

  // Handle relationship filtering
  if (whereRelated) {
    const relatedIds = await buildRelationshipSubquery(
      collectionSlug,
      whereRelated.field,
      whereRelated.value,
      (whereRelated as any).recursive || false
    );

    if (relatedIds.length > 0) {
      whereConditions.push(inArray((table as any).id, relatedIds));
    } else {
      // If no related items found, ensure no results are returned
      whereConditions.push(sql`1 = 0`);
    }
  }

  // Handle parent/child filtering
  if (parentId) {
    whereConditions.push(eq((table as any).parent_id, parentId));
  }

  // Handle sibling filtering
  if (siblingOf) {
    // First get the parent_id of the sibling item
    const siblingItem = await db
      .select({ parent_id: (table as any).parent_id })
      .from(table)
      .where(eq((table as any).id, siblingOf))
      .limit(1);

    if (siblingItem.length > 0 && siblingItem[0].parent_id) {
      whereConditions.push(eq((table as any).parent_id, siblingItem[0].parent_id));

      if (excludeCurrent) {
        whereConditions.push(ne((table as any).id, siblingOf));
      }
    } else {
      // No parent found, no siblings
      whereConditions.push(sql`1 = 0`);
    }
  }

  const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined;

  // Get total count for pagination in parallel with items
  const countPromise = db.select({ count: count() }).from(table).where(whereClause);

  // Build main query with ordering
  let itemsQuery = db.select().from(table);
  if (whereClause) {
    itemsQuery = itemsQuery.where(whereClause);
  }

  // Add ordering
  if (orderBy && (table as any)[orderBy]) {
    const orderFn = order === 'desc' ? desc : asc;
    itemsQuery = itemsQuery.orderBy(orderFn((table as any)[orderBy]));
  }

  // Add pagination
  if (limit) {
    itemsQuery = itemsQuery.limit(limit).offset(offset);
  }

  // Execute both queries in parallel
  const [countResult, items] = await Promise.all([countPromise, itemsQuery]);

  const total = countResult[0]?.count || 0;

  // Fix date handling for all items
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

  // Parse dates for all items
  for (const item of items as any[]) {
    (item as CollectionItem).created_at = parseDate((item as CollectionItem).created_at);
    (item as CollectionItem).updated_at = parseDate((item as CollectionItem).updated_at);
  }

  // Enrich all items
  const enrichedItems = await Promise.all(
    items.map((item: any) =>
      enrichCollectionItem(item, collectionSlug, {
        includeBlocks,
        includeBreadcrumbs,
        includeAuthors
      })
    )
  );

  const result: CollectionsMultipleResult = {
    items: enrichedItems,
    total,
    hasMore: limit ? offset + items.length < total : false
  };

  // Add pagination info if we have the required data
  if (limit && baseUrl) {
    const page = currentPage || Math.floor(offset / limit) + 1;
    const totalPages = Math.ceil(total / limit);

    result.pagination = {
      page,
      pageSize: limit,
      totalItems: total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1
    } as Pagination;
  }

  // Group items if requested
  if (groupBy) {
    result.grouped = groupItemsByField(enrichedItems, groupBy);
  }

  return result;
}

/**
 * Enrich a single collection item with blocks, breadcrumbs, authors, etc.
 */
async function enrichCollectionItem(
  item: any,
  collectionSlug: string,
  options: {
    includeBlocks: boolean;
    includeBreadcrumbs: boolean;
    includeAuthors: boolean;
  }
): Promise<CollectionItem> {
  const { includeBlocks, includeBreadcrumbs, includeAuthors } = options;

  const enrichedItem = { ...item } as CollectionItem;

  // Populate collection item fields (files, arrays, relations) using unified loader
  try {
    const collectionDef = await getCollectionType(collectionSlug);
    const collectionSchema = collectionDef ? collectionDef.fields || {} : {};
    if (Object.keys(collectionSchema).length > 0) {
      await loadContentData(enrichedItem, collectionSchema as Record<string, any>, {
        contentType: 'collection',
        slug: collectionSlug,
        loadFullFileObjects: false
      });
    }
  } catch (err) {
    console.warn(
      `Failed to load content data for collection '${collectionSlug}' item '${item.id}'`,
      err
    );
  }

  // Load blocks if requested
  if (includeBlocks) {
    enrichedItem.blocks = await loadBlocksForCollection(enrichedItem.id);
  }

  // Populate user references if requested
  if (includeAuthors) {
    if (enrichedItem.author && typeof enrichedItem.author === 'string') {
      const populatedAuthor = await getPopulatedAuthor(enrichedItem.author);
      if (populatedAuthor) {
        enrichedItem.author = populatedAuthor;
      }
    }
    if (enrichedItem.last_modified_by && typeof enrichedItem.last_modified_by === 'string') {
      const populatedUser = await getPopulatedAuthor(enrichedItem.last_modified_by);
      if (populatedUser) {
        enrichedItem.last_modified_by = populatedUser;
      }
    }
  }

  // Add URL property and breadcrumbs with hierarchical path
  const { url, breadcrumbs } = await generateItemUrlAndBreadcrumbs(
    collectionSlug,
    enrichedItem,
    includeBreadcrumbs
  );
  enrichedItem.url = url;
  if (includeBreadcrumbs) {
    enrichedItem.breadcrumbs = breadcrumbs;
  }

  return enrichedItem;
}

/**
 * Get populated author object by user ID
 */
async function getPopulatedAuthor(
  userId: string
): Promise<{ id: string; name: string | null; email: string | null } | undefined> {
  try {
    const user = await db
      .select({ name: schema.users.name, email: schema.users.email })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    return user[0] ? { id: userId, name: user[0].name, email: user[0].email } : undefined;
  } catch (err) {
    console.error(`Failed to get author details for user '${userId}':`, err);
    return undefined;
  }
}

/**
 * Generate hierarchical URL and breadcrumbs for an item based on its parent structure
 */
async function generateItemUrlAndBreadcrumbs(
  collectionSlug: string,
  item: CollectionItem,
  includeBreadcrumbs: boolean = false
): Promise<{ url: string; breadcrumbs?: BreadcrumbItem[] }> {
  try {
    // Get collection definition from database to check for basePath
    const collectionDef = await getCollectionType(collectionSlug);
    const basePath = collectionDef?.options?.basePath || '';

    // If no parent, return slug with basePath
    if (!item.parent_id) {
      return {
        url: `${basePath}${item.slug}`,
        breadcrumbs: includeBreadcrumbs ? [] : undefined
      };
    }

    // Get the table for this collection
    const table = schema[`collection_${collectionSlug}` as keyof typeof schema];
    if (!table) {
      return {
        url: `/${item.slug}`,
        breadcrumbs: includeBreadcrumbs ? [] : undefined
      };
    }

    // Get parent item
    const parentResult = await db
      .select()
      .from(table)
      .where(eq((table as any).id, item.parent_id))
      .limit(1);

    if (parentResult.length === 0) {
      return {
        url: `${basePath}${item.slug}`,
        breadcrumbs: includeBreadcrumbs ? [] : undefined
      };
    }

    const parent = parentResult[0] as CollectionItem;

    // Recursively get parent data
    const parentData = await generateItemUrlAndBreadcrumbs(
      collectionSlug,
      parent,
      includeBreadcrumbs
    );

    const url = `${parentData.url}/${item.slug}`;
    let breadcrumbs: BreadcrumbItem[] | undefined;

    if (includeBreadcrumbs) {
      breadcrumbs = [
        ...(parentData.breadcrumbs || []),
        {
          label: parent.title,
          url: parentData.url,
          isActive: false,
          isCurrent: false
        }
      ];
    }

    return { url, breadcrumbs };
  } catch (err) {
    console.error(`Failed to generate URL/breadcrumbs for item '${item.id}':`, err);
    // Get collection definition from database for basePath even in error case
    const collectionDef = await getCollectionType(collectionSlug);
    const basePath = collectionDef?.options?.basePath || '';
    return {
      url: `${basePath}${item.slug}`,
      breadcrumbs: includeBreadcrumbs ? [] : undefined
    };
  }
}

/**
 * Get all descendant items recursively for any global or collection type
 */
async function getAllDescendantItems(parentSlug: string, targetType: string): Promise<string[]> {
  const allSlugs = new Set<string>();

  async function getChildren(slug: string) {
    // Try to get as global first, then as collection
    let itemResult = null;
    let isGlobal = false;

    try {
      itemResult = await getGlobals(targetType, { itemSlug: slug, withRelations: true });
      isGlobal = true;
    } catch {
      try {
        itemResult = await getCollections(targetType, { itemSlug: slug });
        isGlobal = false;
      } catch {
        console.warn(`Could not find item with slug '${slug}' in type '${targetType}'`);
        return;
      }
    }

    if (!itemResult) return;

    const item = itemResult as any;
    allSlugs.add(item.slug);

    // Get children of this item
    const childrenResult = isGlobal
      ? await getGlobals(targetType, { parentId: item.id, withRelations: true })
      : await getCollections(targetType, { parentId: item.id });

    if (childrenResult && 'items' in childrenResult && childrenResult.items) {
      // Recursively get children of each child
      for (const child of childrenResult.items) {
        await getChildren(child.slug);
      }
    }
  }

  await getChildren(parentSlug);
  return Array.from(allSlugs);
}

/**
 * Build a relationship subquery to filter items by related entities
 */
async function buildRelationshipSubquery(
  collectionSlug: string,
  relationField: string,
  targetValues: string | string[],
  recursive: boolean = false
): Promise<any> {
  let values = Array.isArray(targetValues) ? targetValues : [targetValues];

  // If recursive is true, get all descendant items
  if (recursive && values.length === 1) {
    // Get the target type from the collection definition
    const collectionDef = await getCollectionType(collectionSlug);
    const relationDef = collectionDef?.fields?.[relationField]?.relation;

    if (relationDef) {
      let targetType: string;

      if (relationDef.targetGlobal) {
        // Collection to Global relationship
        targetType = relationDef.targetGlobal;
      } else if (relationDef.targetCollection) {
        // Collection to Collection relationship
        targetType = relationDef.targetCollection;
      } else {
        console.warn(
          `No target type found for relation field '${relationField}' in collection '${collectionSlug}'`
        );
        return [];
      }

      const allDescendantSlugs = await getAllDescendantItems(values[0], targetType);
      values = allDescendantSlugs;
    }
  }

  // Get the junction table name using the same logic as schema generation
  let throughTableName = `junction_${collectionSlug}_${toSnakeCase(relationField)}`;
  let throughTable = schema[throughTableName as keyof typeof schema];

  // If the standard naming doesn't work, try alternative naming patterns
  if (!throughTable) {
    // Try with just the field name (singular)
    throughTableName = `junction_${collectionSlug}_${relationField}`;
    throughTable = schema[throughTableName as keyof typeof schema];
  }

  if (!throughTable) {
    throw new Error(`Junction table '${throughTableName}' not found in schema`);
  }

  // Get the target global table name from the collection definition
  // We need to look up the actual targetGlobal from the relation field definition
  let targetTableName: string;

  // Try to get the target global from the collection definition
  try {
    const collectionDef = await getCollectionType(collectionSlug);
    if (collectionDef?.fields?.[relationField]?.relation?.targetGlobal) {
      targetTableName = `global_${collectionDef.fields[relationField].relation.targetGlobal}`;
    } else {
      // Fallback to the old behavior
      targetTableName = `global_${relationField}`;
    }
  } catch (error) {
    // Fallback to the old behavior if we can't get the collection definition
    targetTableName = `global_${relationField}`;
  }

  const targetTable = schema[targetTableName as keyof typeof schema];

  if (!targetTable) {
    throw new Error(`Target table '${targetTableName}' not found in schema`);
  }

  // Execute query to get collection_ids that have the specified related entities
  // If no values provided, return empty array
  if (values.length === 0) {
    return [];
  }

  const relatedResults = await db
    .select({ collection_id: (throughTable as any).collection_id })
    .from(throughTable)
    .innerJoin(targetTable, eq((throughTable as any).target_id, (targetTable as any).id))
    .where(inArray((targetTable as any).slug, values));

  // Extract just the collection_id values for the IN clause
  return relatedResults.map((row: { collection_id: string }) => row.collection_id);
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
 * Utility to get all available collection types
 *
 * @example
 * ```typescript
 * const collectionTypes = await getAvailableCollectionTypes();
 * // Returns: ['posts', 'pages', 'products', ...]
 * ```
 */
export async function getAvailableCollectionTypes(): Promise<string[]> {
  const collectionTypes = await db.query.collectionTypes.findMany();
  return collectionTypes.map((ct: any) => ct.slug);
}

/**
 * Utility to check if a collection type exists
 *
 * @example
 * ```typescript
 * if (await collectionTypeExists('posts')) {
 *   // Collection type is available
 * }
 * ```
 */
export async function collectionTypeExists(collectionType: string): Promise<boolean> {
  const availableTypes = await getAvailableCollectionTypes();
  return availableTypes.includes(collectionType);
}
