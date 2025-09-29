import { db } from '../core/db/index.server';
import { eq, asc, desc, and } from 'drizzle-orm';
import { globalTypes } from '../generated/schema';
import * as schema from '../generated/schema';
import type { GlobalTypes } from '../generated/types';
import { TagService } from '../core/services/tag.server';
import { loadGlobalData } from '../core/content/content-data';

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

// Type generation utilities using generated types
export type InferGlobalType<T extends string> = GlobalWithData;

export interface GlobalOptions {
  withRelations?: boolean; // Include items relation for relational globals
  withTags?: boolean; // Include tags for the global
  slug?: string; // Specific item slug for relational globals
  groupBy?: string;
  orderBy?: string;
  order?: 'asc' | 'desc';
  user?: User | null; // User context for ACL filtering
}

export interface GlobalResult<T = GlobalWithData> {
  items: T[];
  total: number;
  grouped?: Record<string, T[]>;
}

// Helper type that represents the actual data structure returned by getGlobal
type GlobalData<T> = {
  items: T[];
  total: number;
  [K: string]: any; // Allow other global metadata
};

/**
 * Get a global by slug - handles both singleton and repeatable globals
 *
 * ⚠️  SECURITY: Always pass user context for permission filtering in production!
 * Without user context, this function returns ALL content regardless of permissions.
 *
 * @example
 * ```typescript
 * // ✅ SECURE: With user context (recommended)
 * const settings = await getGlobal('configuration', { user: locals.user });
 * const menus = await getGlobal('menus', { user: locals.user });
 *
 * // ⚠️  INSECURE: Without user context (only for public/static content)
 * const settings = await getGlobal('configuration'); // Returns ALL settings!
 *
 * // Get specific item by slug (with security)
 * const mainMenu = await getGlobal('menus', { slug: 'main', user: locals.user });
 *
 * // Performance: skip relations when not needed (with security)
 * const menuMetadata = await getGlobal('menus', {
 *   withRelations: false,
 *   user: locals.user
 * });
 *
 * // With tags (with security)
 * const faqsWithTags = await getGlobal('faq', {
 *   withTags: true,
 *   user: locals.user
 * });
 *
 * // With grouping and ordering (with security)
 * const faqs = await getGlobal('faq', {
 *   groupBy: 'category',
 *   orderBy: 'sort',
 *   user: locals.user
 * });
 * ```
 */

// Clean developer experience with consistent query pattern
type GlobalQueryOptions = {
  withRelations?: boolean;
  withTags?: boolean;
  groupBy?: string;
  orderBy?: string;
  order?: 'asc' | 'desc';
  slug?: string; // For internal use in original getGlobal function
  user?: User | null; // User context for ACL filtering
};

// Multiple items - for repeatable globals
export async function getGlobalItems(
  globalSlug: string,
  options?: GlobalQueryOptions & {
    query?: 'slug';
    value?: string;
  }
): Promise<{
  items: GlobalTypes[];
  total?: number;
  grouped?: Record<string, GlobalTypes[]>;
}> {
  const result = await getGlobal(globalSlug, options);
  if (!result) return { items: [] };

  // Handle specific item query
  if (options?.query === 'slug' && options?.value) {
    const items = result.items;
    const filteredItems = items?.filter((item: any) => item.slug === options.value) || [];
    return {
      items: filteredItems,
      total: filteredItems.length
    };
  }

  return {
    items: result.items || [],
    total: result.items?.length,
    grouped: result.grouped || undefined
  };
}

// Single item - for getting one specific global item
export async function getGlobalItem(
  globalSlug: string,
  options: GlobalQueryOptions & {
    query: 'slug' | 'id';
    value: string;
  }
): Promise<GlobalTypes | null> {
  const result = await getGlobal(globalSlug, options);
  if (!result) return null;

  const items = result.items;

  switch (options.query) {
    case 'slug':
      return items?.find((item: any) => item.slug === options.value) || null;
    case 'id':
      return items?.find((item: any) => item.id === options.value) || null;
    default:
      return null;
  }
}

// Original function for advanced usage - always returns consistent format
export async function getGlobal(
  globalSlug: string,
  options?: GlobalQueryOptions
): Promise<{
  items: GlobalTypes[];
  total?: number;
  grouped?: Record<string, GlobalTypes[]>;
} | null>;

export async function getGlobal(
  globalSlug: string,
  options?: GlobalQueryOptions
): Promise<{
  items: GlobalTypes[];
  total?: number;
  grouped?: Record<string, GlobalTypes[]>;
} | null>;

// Implementation
export async function getGlobal(
  globalSlug: string,
  options: GlobalQueryOptions = {}
): Promise<any> {
  const {
    withRelations = true,
    withTags = false,
    slug,
    groupBy,
    orderBy = 'sort',
    order = 'asc',
    user
  } = options;

  try {
    // Get global type definition
    const globalType = await db.query.globalTypes.findFirst({
      where: eq(globalTypes.slug, globalSlug)
    });

    if (!globalType) {
      console.warn(`Global type '${globalSlug}' not found`);
      return null;
    }

    // Check if this is a flat (singleton) global
    const isFlat = globalType.data_type === 'flat';

    // Set up access control filtering if user context is provided

    if (isFlat) {
      // Handle singleton global
      const globalTable = schema[`global_${globalSlug}` as keyof typeof schema];
      if (!globalTable) {
        console.warn(`Global table for '${globalSlug}' not found in schema`);
        return null;
      }

      // Apply access control filtering for singleton globals
      let globalQuery = db.select().from(globalTable);

      const globalResult = await globalQuery
        .where(eq((globalTable as any).id, globalSlug))
        .limit(1);

      if (globalResult.length === 0) {
        console.warn(`Global data for '${globalSlug}' not found`);
        return null;
      }

      const globalData = globalResult[0] as any;

      // Fix date handling - convert timestamps to proper Date objects
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

      // Return only the pure data with proper date parsing
      const enrichedGlobal = {
        ...globalData,
        // Parse dates properly
        created_at: parseDate(globalData.created_at),
        updated_at: parseDate(globalData.updated_at)
      };

      // Load tags if requested
      if (withTags) {
        try {
          const tags = await TagService.getTagsForEntity(`global_${globalSlug}`, enrichedGlobal.id);

          // Find tag fields in the global schema and attach tags
          const globalFields = JSON.parse(globalType.schema);
          Object.entries(globalFields).forEach(([fieldName, fieldDef]) => {
            if ((fieldDef as any).type === 'tags') {
              enrichedGlobal[fieldName] = tags;
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
          // Load relations if table exists

          if (relationTable) {
            const relationResult = await db
              .select()
              .from(relationTable)
              .where(eq((relationTable as any).global_id, enrichedGlobal.id))
              .orderBy(asc((relationTable as any).sort));
            // Load relation items
            enrichedGlobal.items = relationResult;
          } else {
            // No relation table exists
            enrichedGlobal.items = [];
          }
        } catch (err) {
          console.error(`Error loading relations for flat global ${enrichedGlobal.id}:`, err);
          // Relation table doesn't exist yet
          enrichedGlobal.items = [];
        }
      }

      // Load global data (arrays and files)
      if (withRelations) {
        try {
          const globalFields = JSON.parse(globalType.schema);

          // Preserve the items property (this is for relation tables, not the same as array fields)
          const preservedItems = enrichedGlobal.items;

          await loadGlobalData(
            enrichedGlobal,
            globalSlug,
            globalFields,
            false // loadFullFileObjects - return IDs for frontend compatibility
          );

          // Restore the items property (for relation tables)
          enrichedGlobal.items = preservedItems;
        } catch (err) {
          console.warn(`Failed to load global data for '${globalSlug}':`, err);
        }
      }

      const result = { items: [enrichedGlobal] };
      // Return clean data
      return result;
    } else {
      // Handle repeatable global
      const globalTable = schema[`global_${globalSlug}` as keyof typeof schema];
      if (!globalTable) {
        console.warn(`Global table for '${globalSlug}' not found in schema`);
        return null;
      }

      let query = db.select().from(globalTable);
      const whereConditions = [];

      // If slug is specified, get specific item
      if (slug) {
        whereConditions.push(eq((globalTable as any).slug, slug));
      }

      // Apply where conditions
      if (whereConditions.length > 0) {
        query = query.where(
          whereConditions.length > 1 ? and(...whereConditions) : whereConditions[0]
        );
      }

      // Apply ordering if not getting specific slug
      if (!slug) {
        const orderField = (globalTable as any)[orderBy];
        if (orderField) {
          const orderFn = order === 'desc' ? desc : asc;
          query = query.orderBy(orderFn(orderField));
        }
      }

      const globalResult = await query;

      // Process items with proper date parsing

      // Fix date handling - convert timestamps to proper Date objects
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

      // Return only the pure data with proper date parsing
      const items = globalResult.map((item: any) => ({
        ...item,
        // Parse dates properly
        created_at: parseDate(item.created_at),
        updated_at: parseDate(item.updated_at)
      }));

      // Load tags if requested
      if (withTags) {
        try {
          const globalFields = JSON.parse(globalType.schema);
          const tagFields = Object.entries(globalFields).filter(
            ([_, fieldDef]: [string, any]) => fieldDef.type === 'tags'
          );

          if (tagFields.length > 0) {
            for (const item of items) {
              const tags = await TagService.getTagsForEntity(`global_${globalSlug}`, item.id);

              // Attach tags to tag fields
              tagFields.forEach(([fieldName]) => {
                item[fieldName] = tags;
              });
            }
          }
        } catch (err) {
          console.warn(`Failed to load tags for global '${globalSlug}':`, err);
        }
      }

      // Load items relation if requested
      if (withRelations) {
        for (const item of items) {
          try {
            const relationTableName = `global_${globalSlug}_items`;
            const relationTable = schema[relationTableName as keyof typeof schema];
            // Load relations for this item

            if (relationTable) {
              const relationResult = await db
                .select()
                .from(relationTable)
                .where(eq((relationTable as any).global_id, item.id))
                .orderBy(asc((relationTable as any).sort));
              // Load relation items
              item.items = relationResult;
            } else {
              // No relation table exists
              item.items = [];
            }
          } catch (err) {
            console.error(`Error loading relations for ${item.id}:`, err);
            // Relation table doesn't exist yet
            item.items = [];
          }
        }
      }

      // Load global data for all repeatable items
      if (items.length > 0) {
        try {
          const globalFields = JSON.parse(globalType.schema);
          for (const item of items) {
            // Preserve the items property (for relation tables)
            const preservedItems = item.items;

            await loadGlobalData(
              item,
              globalSlug,
              globalFields,
              false // loadFullFileObjects - return IDs for frontend compatibility
            );

            // Restore the items property (for relation tables)
            item.items = preservedItems;
          }
        } catch (err) {
          console.warn(`Failed to load global data for '${globalSlug}':`, err);
        }
      }

      // If slug is specified, return the specific item in items array format
      if (slug) {
        return items.length > 0 ? { items: [items[0]] } : { items: [] };
      }

      // Otherwise return all items as GlobalResult
      const result: GlobalResult = {
        items,
        total: items.length
      };

      // Group items if requested
      if (groupBy) {
        result.grouped = groupItemsByField(items, groupBy);
      }

      // Return clean data
      return result;
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error(`Failed to load global '${globalSlug}':`, errorMessage);
    return null;
  }
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
