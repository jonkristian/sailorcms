import { command } from '$app/server';
import { db } from '$sailor/core/db/index.server';
import { asc, desc, eq } from 'drizzle-orm';
import * as schema from '$sailor/generated/schema';

/**
 * Get items from a collection table for relation fields
 */
export const getCollectionItems = command(
  'unchecked',
  async ({ collection }: { collection: string }) => {
    try {
      // Validate collection format
      const collectionPattern = /^[a-zA-Z0-9_-]+$/;
      if (!collectionPattern.test(collection)) {
        return { success: false, error: 'Invalid collection format' };
      }

      // Fetch items from the collection table
      const collectionTable = schema[`collection_${collection}` as keyof typeof schema];
      if (!collectionTable) {
        return { success: false, error: `Collection table for '${collection}' not found` };
      }

      const result = await db
        .select({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          id: (collectionTable as any).id,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          title: (collectionTable as any).title
        })
        .from(collectionTable)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .orderBy(asc((collectionTable as any).sort), desc((collectionTable as any).created_at));

      const items = result.map((row: any) => ({
        id: row.id,
        title: row.title
      }));

      return { success: true, items };
    } catch (error) {
      console.error('Failed to fetch collection items:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch collection items'
      };
    }
  }
);

/**
 * Get collection fields/schema for WordPress import and other tools
 */
export const getCollectionFields = command(
  'unchecked',
  async ({ collection }: { collection: string }) => {
    try {
      // Validate collection format
      const collectionPattern = /^[a-zA-Z0-9_-]+$/;
      if (!collectionPattern.test(collection)) {
        return { success: false, error: 'Invalid collection format' };
      }

      // Get collection type
      const collectionType = await db.query.collectionTypes.findFirst({
        where: (collectionTypes: any, { eq }: any) => eq(collectionTypes.slug, collection)
      });

      if (!collectionType) {
        return { success: false, error: 'Collection not found' };
      }

      // Parse schema to get fields
      const schema = JSON.parse(collectionType.schema);
      const fieldsData = schema.properties || schema;

      // Transform fields into a usable format
      const fields = Object.entries(fieldsData).map(([key, field]: [string, any]) => ({
        key,
        type: field.type || 'text',
        label: field.title || key,
        required: field.required || false,
        ...field
      }));

      return { success: true, fields };
    } catch (error) {
      console.error('Failed to fetch collection fields:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch collection fields'
      };
    }
  }
);

/**
 * Get specific collection item for payload preview
 */
export const getCollectionItem = command(
  'unchecked',
  async ({ collection, id }: { collection: string; id: string }) => {
    try {
      // Validate inputs
      const collectionPattern = /^[a-zA-Z0-9_-]+$/;
      if (!collectionPattern.test(collection)) {
        return { success: false, error: 'Invalid collection format' };
      }

      // Get the item from collection table
      const collectionTable = schema[`collection_${collection}` as keyof typeof schema];
      if (!collectionTable) {
        return { success: false, error: `Collection table for '${collection}' not found` };
      }

      const result = await db
        .select()
        .from(collectionTable)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .where(eq((collectionTable as any).id, id))
        .limit(1);

      if (result.length === 0) {
        return { success: false, error: 'Item not found' };
      }

      return { success: true, item: result[0] };
    } catch (error) {
      console.error('Failed to fetch collection item:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch collection item'
      };
    }
  }
);
