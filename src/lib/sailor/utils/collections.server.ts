import { db } from '../core/db/index.server';
import * as schema from '../generated/schema';
import { sql, ne, eq, and, asc, desc, count, inArray } from 'drizzle-orm';
import { loadBlocksForCollection, type BlockWithRelations } from './blocks.server';
import { createACL, type User } from '../core/rbac/acl';
import { toSnakeCase } from '../core/utils/string';
import type { CollectionTypes } from '../generated/types';
import type { Pagination } from '../core/types';
import type { BreadcrumbItem } from './types';
import { getCollectionType } from '../core/utils/db.server';

// Enhanced collection item type that extends generated types with utility fields
export type CollectionItem = {
  url: string; // Auto-generated URL for the item
  breadcrumbs?: BreadcrumbItem[]; // Auto-generated breadcrumb trail
  blocks?: BlockWithRelations[];
  [key: string]: any; // Dynamic fields from the collection
};

export interface CollectionOptions {
  slug?: string; // Get specific item by slug
  status?: 'published' | 'draft' | 'all';
  limit?: number;
  offset?: number;
  orderBy?: string;
  order?: 'asc' | 'desc';
  groupBy?: string;
  includeBlocks?: boolean;
  includeBreadcrumbs?: boolean; // Generate breadcrumb navigation
  includeAuthors?: boolean; // Populate author and last_modified_by with user details instead of just IDs
  // Pagination URL generation
  baseUrl?: string;
  currentPage?: number;
  // Relationship filtering
  whereRelated?: {
    field: string; // The relation field name (e.g., 'categories')
    value: string | string[]; // Category slug(s) to filter by
  };
  // Parent/child relationships
  parentId?: string; // Get children of this parent
  itemId?: string; // Get item by ID
  siblingOfId?: string; // Get siblings of this item
  excludeCurrent?: boolean; // For siblings query
  // ACL/Security
  user?: User | null; // User context for permission filtering
}

export interface CollectionResult<T = CollectionItem> {
  items: T[];
  total: number;
  hasMore: boolean;
  pagination?: Pagination;
  grouped?: Record<string, T[]>;
}

/**
 * Get collection items or a specific item by slug with proper TypeScript typing
 *
 * ⚠️  SECURITY: Always pass user context for permission filtering in production!
 * Without user context, this function returns ALL content regardless of permissions.
 *
 * @example
 * ```typescript
 * // ✅ SECURE: With user context (recommended)
 * const posts = await getCollection('posts', { user: locals.user });
 * const post = await getCollection('posts', { slug: 'my-post', user: locals.user });
 *
 * // ⚠️  INSECURE: Without user context (only for public/static content)
 * const posts = await getCollection('posts'); // Returns ALL posts!
 *
 * // Get posts in a specific category (with security)
 * const techPosts = await getCollection('posts', {
 *   whereRelated: { field: 'categories', value: 'technology' },
 *   user: locals.user
 * });
 *
 * // Get posts with pagination (with security)
 * const posts = await getCollection('posts', {
 *   limit: 10,
 *   currentPage: 2,
 *   baseUrl: '/blog',
 *   user: locals.user
 * });
 * // posts.pagination will have nextUrl, previousUrl, etc.
 *
 * // Performance: skip blocks (with security)
 * const postTitles = await getCollection('posts', {
 *   includeBlocks: false,
 *   user: locals.user
 * });
 *
 * // Include author and last_modified_by user details
 * const postsWithAuthors = await getCollection('posts', {
 *   includeAuthors: true,
 *   user: locals.user
 * });
 * // item.author and item.last_modified_by will be: { id: string, name: string | null, email: string | null }
 * // instead of just: "user-id-string"
 * ```
 */

// Function overloads for proper typing based on collection slug
export async function getCollection<K extends keyof CollectionTypes>(
  collectionSlug: K,
  options: CollectionOptions & { slug: string }
): Promise<
  | (CollectionTypes[K] & {
    url: string;
    breadcrumbs?: BreadcrumbItem[];
    blocks?: BlockWithRelations[];
  })
  | null
>;

export async function getCollection<K extends keyof CollectionTypes>(
  collectionSlug: K,
  options?: CollectionOptions & { slug?: never }
): Promise<
  CollectionResult<
    CollectionTypes[K] & {
      url: string;
      breadcrumbs?: BreadcrumbItem[];
      blocks?: BlockWithRelations[];
    }
  >
>;

// Fallback for dynamic collection names not in the generated types
export async function getCollection(
  collectionSlug: string,
  options: CollectionOptions & { slug: string }
): Promise<CollectionItem | null>;

export async function getCollection(
  collectionSlug: string,
  options?: CollectionOptions & { slug?: never }
): Promise<CollectionResult>;

// Implementation
export async function getCollection(
  collectionSlug: string,
  options: CollectionOptions = {}
): Promise<CollectionResult | CollectionItem | null> {
  const {
    slug,
    status = 'published',
    limit,
    offset = 0,
    orderBy = 'created_at',
    order = 'desc',
    groupBy,
    includeBlocks = true,
    includeBreadcrumbs = false,
    includeAuthors = false,
    baseUrl,
    currentPage,
    whereRelated,
    parentId,
    itemId,
    siblingOfId,
    excludeCurrent = true,
    user
  } = options;

  try {
    // Get the table dynamically from schema
    const table = schema[`collection_${collectionSlug}` as keyof typeof schema];
    if (!table) {
      throw new Error(`Collection '${collectionSlug}' not found in schema`);
    }

    // Set up ACL filtering if user context is provided
    const acl = user ? createACL(user) : null;
    const aclConditions = acl ? await acl.buildQueryConditions('collection', table, 'view') : null;

    // If slug or itemId is provided, get single item
    if (slug || itemId) {
      const whereConditions = [];

      if (slug) {
        whereConditions.push(eq((table as any).slug, slug));
      }
      if (itemId) {
        whereConditions.push(eq((table as any).id, itemId));
      }

      if (status !== 'all') {
        whereConditions.push(eq((table as any).status, status));
      }

      // Apply ACL filtering if user context provided
      if (aclConditions) {
        whereConditions.push(aclConditions);
      }

      const whereClause = whereConditions.length > 1 ? and(...whereConditions) : whereConditions[0];
      const result = await db.select().from(table).where(whereClause).limit(1);

      if (result.length === 0) {
        return null;
      }

      const item = result[0] as unknown as CollectionItem;

      // Load blocks if requested
      if (includeBlocks) {
        item.blocks = await loadBlocksForCollection(item.id);
      }

      // Populate user references if requested
      if (includeAuthors) {
        if (item.author && typeof item.author === 'string') {
          const populatedAuthor = await getPopulatedAuthor(item.author);
          if (populatedAuthor) {
            item.author = populatedAuthor;
          }
        }
        if (item.last_modified_by && typeof item.last_modified_by === 'string') {
          const populatedUser = await getPopulatedAuthor(item.last_modified_by);
          if (populatedUser) {
            item.last_modified_by = populatedUser;
          }
        }
      }

      // Add URL property and breadcrumbs with hierarchical path
      const { url, breadcrumbs } = await generateItemUrlAndBreadcrumbs(
        collectionSlug,
        item,
        includeBreadcrumbs
      );
      item.url = url;
      if (includeBreadcrumbs) {
        item.breadcrumbs = breadcrumbs;
      }

      return item;
    }

    // Otherwise get multiple items
    const whereConditions = [];
    if (status !== 'all') {
      whereConditions.push(eq((table as any).status, status));
    }

    // Apply ACL filtering if user context provided
    if (aclConditions) {
      whereConditions.push(aclConditions);
    }

    // Handle relationship filtering
    if (whereRelated) {
      const relatedIds = await buildRelationshipSubquery(
        collectionSlug, // Pass just 'posts', not 'collection_posts'
        whereRelated.field,
        whereRelated.value
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
    if (siblingOfId) {
      // First get the parent_id of the sibling item
      const siblingItem = await db
        .select({ parent_id: (table as any).parent_id })
        .from(table)
        .where(eq((table as any).id, siblingOfId))
        .limit(1);

      if (siblingItem.length > 0 && siblingItem[0].parent_id) {
        whereConditions.push(eq((table as any).parent_id, siblingItem[0].parent_id));

        if (excludeCurrent) {
          whereConditions.push(ne((table as any).id, siblingOfId));
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

    // Fix date handling for all items - convert timestamps to proper Date objects
    const parseDate = (dateValue: any): Date => {
      if (!dateValue) return new Date();
      if (dateValue instanceof Date) return dateValue;
      if (typeof dateValue === 'string') {
        // Try parsing as ISO string first
        const isoDate = new Date(dateValue);
        if (!isNaN(isoDate.getTime())) return isoDate;
      }
      if (typeof dateValue === 'number') {
        // Handle Unix timestamp (seconds or milliseconds)
        const timestamp = dateValue > 10000000000 ? dateValue : dateValue * 1000;
        return new Date(timestamp);
      }
      return new Date();
    };

    // Parse dates for all items
    for (const item of items) {
      (item as CollectionItem).created_at = parseDate((item as CollectionItem).created_at);
      (item as CollectionItem).updated_at = parseDate((item as CollectionItem).updated_at);
    }

    // Load blocks if requested (default: true)
    if (includeBlocks) {
      for (const item of items) {
        (item as CollectionItem).blocks = await loadBlocksForCollection(item.id);
      }
    }

    // Populate user references if requested
    if (includeAuthors) {
      for (const item of items) {
        const collectionItem = item as CollectionItem;
        if (collectionItem.author && typeof collectionItem.author === 'string') {
          const populatedAuthor = await getPopulatedAuthor(collectionItem.author);
          if (populatedAuthor) {
            collectionItem.author = populatedAuthor;
          }
        }
        if (
          collectionItem.last_modified_by &&
          typeof collectionItem.last_modified_by === 'string'
        ) {
          const populatedUser = await getPopulatedAuthor(collectionItem.last_modified_by);
          if (populatedUser) {
            collectionItem.last_modified_by = populatedUser;
          }
        }
      }
    }

    // Add URL property and breadcrumbs to all items with hierarchical paths
    for (const item of items) {
      const { url, breadcrumbs } = await generateItemUrlAndBreadcrumbs(
        collectionSlug,
        item as CollectionItem,
        includeBreadcrumbs
      );
      (item as CollectionItem).url = url;
      if (includeBreadcrumbs) {
        (item as CollectionItem).breadcrumbs = breadcrumbs;
      }
    }

    const collectionResult: CollectionResult = {
      items: items as CollectionItem[],
      total,
      hasMore: limit ? offset + items.length < total : false
    };

    // Add pagination info if we have the required data
    if (limit && baseUrl) {
      const page = currentPage || Math.floor(offset / limit) + 1;
      const totalPages = Math.ceil(total / limit);

      collectionResult.pagination = {
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
      collectionResult.grouped = groupItemsByField(items, groupBy);
    }

    return collectionResult;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error(`Failed to load collection '${collectionSlug}':`, errorMessage);
    if (slug) {
      return null;
    }
    return {
      items: [],
      total: 0,
      hasMore: false
    };
  }
}

// Clean developer experience with proper separation of concerns
type CollectionQueryOptions = Omit<CollectionOptions, 'slug'> & {
  status?: 'published' | 'draft' | 'all';
  includeBlocks?: boolean;
  includeBreadcrumbs?: boolean;
  includeAuthors?: boolean;
  limit?: number;
  offset?: number;
  currentPage?: number;
  baseUrl?: string;
  user?: User | null; // User context for ACL filtering
};

// Multiple items - for getting lists/collections
export async function getCollectionItems<K extends keyof CollectionTypes>(
  collectionSlug: K,
  options?: CollectionQueryOptions & {
    query?: 'children' | 'siblings';
    value?: string;
    excludeCurrent?: boolean;
  }
): Promise<{
  items: (CollectionTypes[K] & {
    url: string;
    breadcrumbs?: BreadcrumbItem[];
    blocks?: BlockWithRelations[];
  })[];
  total?: number;
  hasMore?: boolean;
  pagination?: Pagination;
}> {
  if (!options?.query) {
    // Default: get all items
    const result = await getCollection(collectionSlug, options);
    if (!result || 'id' in result) return { items: [] };
    return {
      items: result.items,
      total: result.total,
      hasMore: result.hasMore,
      pagination: result.pagination
    };
  }

  // Handle relationship queries using the main getCollection function
  switch (options.query) {
    case 'children': {
      if (!options.value) throw new Error('value required for children query');
      const result = await getCollection(collectionSlug, {
        ...options,
        parentId: options.value
      });
      if (!result || 'id' in result) return { items: [] };
      return {
        items: result.items,
        total: result.total,
        hasMore: result.hasMore,
        pagination: result.pagination
      };
    }
    case 'siblings': {
      if (!options.value) throw new Error('value required for siblings query');
      const result = await getCollection(collectionSlug, {
        ...options,
        siblingOfId: options.value,
        excludeCurrent: options.excludeCurrent ?? true
      });
      if (!result || 'id' in result) return { items: [] };
      return {
        items: result.items,
        total: result.total,
        hasMore: result.hasMore,
        pagination: result.pagination
      };
    }
    default:
      return { items: [] };
  }
}

// Single item - for getting one specific item
export async function getCollectionItem<K extends keyof CollectionTypes>(
  collectionSlug: K,
  options: CollectionQueryOptions & {
    query: 'slug' | 'id';
    value: string;
  }
): Promise<
  | (CollectionTypes[K] & {
    url: string;
    breadcrumbs?: BreadcrumbItem[];
    blocks?: BlockWithRelations[];
  })
  | null
> {
  let result: any;

  switch (options.query) {
    case 'slug':
      result = await getCollection(collectionSlug, { ...options, slug: options.value });
      break;
    case 'id':
      result = await getCollection(collectionSlug, { ...options, itemId: options.value });
      break;
    default:
      return null;
  }

  // getCollection returns single item when slug or itemId is provided
  return result && 'id' in result
    ? (result as CollectionTypes[K] & {
      url: string;
      breadcrumbs?: BreadcrumbItem[];
      blocks?: BlockWithRelations[];
    })
    : null;
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
 * Build a relationship subquery to filter items by related entities
 */
async function buildRelationshipSubquery(
  collectionSlug: string,
  relationField: string,
  targetValues: string | string[]
): Promise<any> {
  const values = Array.isArray(targetValues) ? targetValues : [targetValues];

  // Get the junction table name using the same logic as schema generation
  // e.g., 'junction_' + 'posts' + '_' + 'categories' = 'junction_posts_categories'
  const throughTableName = `junction_${collectionSlug}_${toSnakeCase(relationField)}`;
  const throughTable = schema[throughTableName as keyof typeof schema];

  if (!throughTable) {
    throw new Error(`Junction table '${throughTableName}' not found in schema`);
  }

  // Get the target global table name (e.g., 'global_categories')
  const targetTableName = `global_${relationField}`;
  const targetTable = schema[targetTableName as keyof typeof schema];

  if (!targetTable) {
    throw new Error(`Target table '${targetTableName}' not found in schema`);
  }

  // Execute query to get collection_ids that have the specified related entities
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
