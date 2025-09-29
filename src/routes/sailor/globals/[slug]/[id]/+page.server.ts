import { db } from '$sailor/core/db/index.server';
import * as schema from '$sailor/generated/schema';
import { error, redirect, fail } from '@sveltejs/kit';
import { eq, asc } from 'drizzle-orm';
import crypto from 'crypto';
import { getCurrentTimestamp } from '$sailor/core/utils/date';
import { normalizeRelationId } from '$sailor/core/utils/common';
import { log } from '$sailor/core/utils/logger';

export const load = async ({ params, locals }) => {
  // Authentication and authorization handled by hooks
  if (!locals.user?.id) {
    throw redirect(303, '/sailor/auth/login');
  }

  const { slug, id } = params;

  // Get global definition from database
  const globalTypeRow = await db.query.globalTypes.findFirst({
    where: (globalTypes: any, { eq }: any) => eq(globalTypes.slug, slug)
  });

  if (!globalTypeRow) {
    throw error(404, 'Global not found');
  }

  // Transform the global type to match the expected format
  const globalDefinition = {
    id: globalTypeRow.id,
    name: {
      singular: globalTypeRow.name_singular,
      plural: globalTypeRow.name_plural
    },
    slug: globalTypeRow.slug,
    description: globalTypeRow.description,
    dataType: globalTypeRow.data_type,
    fields: JSON.parse(globalTypeRow.schema),
    options: globalTypeRow.options ? JSON.parse(globalTypeRow.options) : {},
    created_at: globalTypeRow.created_at,
    updated_at: globalTypeRow.updated_at
  };

  // Check if this is a flat global
  const isFlat = globalDefinition.dataType === 'flat';

  let item: Record<string, any>;
  let isNewItem = false;

  if (isFlat) {
    // Get the global table dynamically
    const globalTable = schema[`global_${slug}` as keyof typeof schema];
    if (!globalTable) {
      throw error(404, `Global table for '${slug}' not found`);
    }

    // For singletons, try to get the single item (any ID)
    const existingItems = await db.select().from(globalTable).limit(1);

    if (existingItems.length === 0) {
      // Create the singleton item if it doesn't exist using slug as ID
      const singletonId = slug;
      const defaultItem: Record<string, any> = {
        id: singletonId,
        created_at: getCurrentTimestamp(),
        updated_at: getCurrentTimestamp()
      };

      // Add default values for fields
      for (const [fieldName, fieldDef] of Object.entries(globalDefinition.fields)) {
        const fieldConfig = fieldDef as any;
        if (fieldConfig.default !== undefined) {
          defaultItem[fieldName] = fieldConfig.default;
        }
      }

      await db.insert(globalTable).values(defaultItem);

      item = defaultItem;
      isNewItem = true;
    } else {
      item = existingItems[0] as Record<string, any>;
    }
  } else {
    // Get the global table dynamically for regular globals
    const globalTable = schema[`global_${slug}` as keyof typeof schema];
    if (!globalTable) {
      throw error(404, `Global table for '${slug}' not found`);
    }

    // Regular global - try to get the specific item by ID
    const existingItems = await db
      .select()
      .from(globalTable)
      .where(eq((globalTable as any).id, id))
      .limit(1);

    if (existingItems.length === 0) {
      // This is a new item - create default data
      isNewItem = true;
      const defaultTitle = `New ${globalDefinition.name.singular}`;
      item = {
        id: id,
        title: defaultTitle,
        status: 'active',
        created_at: getCurrentTimestamp(),
        updated_at: getCurrentTimestamp()
      };
    } else {
      // Existing item found
      item = existingItems[0] as Record<string, any>;
    }
  }

  // Load array field data from relational tables (for both singleton and regular globals)
  for (const [fieldName, fieldDef] of Object.entries(globalDefinition.fields)) {
    if ((fieldDef as any).type === 'array') {
      try {
        const relTableName = `global_${slug}_${fieldName}`;
        const relationTable = schema[relTableName as keyof typeof schema];

        if (relationTable) {
          const arrayResult = await db
            .select()
            .from(relationTable)
            .where(eq((relationTable as any).global_id, item.id))
            .orderBy(asc((relationTable as any).sort));
          item[fieldName] = arrayResult;
        } else {
          item[fieldName] = [];
        }
      } catch {
        item[fieldName] = [];
      }
    } else if ((fieldDef as any).type === 'relation') {
      // Resolve single-FK relations server-side for better UX
      const relType = (fieldDef as any).relation?.type;
      if (relType === 'one-to-one' || relType === 'many-to-one') {
        const targetId = item[fieldName];
        if (targetId) {
          try {
            const { getRelationItem } = await import('$sailor/remote/relations.remote');
            const scope = (fieldDef as any).relation?.targetGlobal ? 'global' : 'collection';
            const slugArg =
              (fieldDef as any).relation?.targetGlobal ||
              (fieldDef as any).relation?.targetCollection;
            const res = await getRelationItem({ scope, slug: slugArg, id: String(targetId) });
            if (res.success && res.item) {
              item[fieldName] = JSON.stringify(res.item);
            }
          } catch {
            // Leave as id on failure
          }
        }
      }
    }
  }

  return {
    page: item,
    item,
    isNewItem,
    global: globalDefinition,
    slug: slug
  };
};

export const actions = {
  save: async ({ request, params, locals }: { request: Request; params: any; locals: any }) => {
    if (!locals.user?.id) {
      return fail(401, { error: 'Unauthorized' });
    }

    // Check if user can update globals
    if (!(await locals.security.hasPermission('update', 'content'))) {
      return fail(403, { error: 'Access denied: You do not have permission to update content' });
    }

    try {
      const formData = await request.formData();

      // Extract all form data
      const formDataObj: Record<string, any> = {};
      for (const [key, value] of formData.entries()) {
        if (typeof value === 'string') {
          if (value.startsWith('[') || value.startsWith('{')) {
            try {
              formDataObj[key] = JSON.parse(value);
            } catch {
              formDataObj[key] = value;
            }
          } else {
            formDataObj[key] = value;
          }
        } else {
          formDataObj[key] = value;
        }
      }

      // Get global definition from database
      const globalTypeRow = await db.query.globalTypes.findFirst({
        where: (globalTypes: any, { eq }: any) => eq(globalTypes.slug, params.slug)
      });

      if (!globalTypeRow) {
        return fail(400, { error: 'Global not found' });
      }

      const globalFields = JSON.parse(globalTypeRow.schema);

      // Separate regular fields from array fields
      const regularFields: Record<string, any> = {};
      const arrayFields: Record<string, any[]> = {};
      const tagFields: Record<string, any[]> = {};

      for (const [key, value] of Object.entries(formDataObj)) {
        if (key === 'tags') {
          tagFields[key] = Array.isArray(value) ? value : [value];
        } else if (Array.isArray(value)) {
          arrayFields[key] = value;
        } else {
          regularFields[key] = value;
        }
      }

      // Auto-populate author field for new content if not provided
      if (!regularFields.author && locals.user?.id) {
        regularFields.author = locals.user.id;
      }

      // Check if this is a flat global
      const isFlat = globalTypeRow.data_type === 'flat';
      const itemId = isFlat ? params.slug : params.id;

      // System-managed fields to always ignore from client input
      const SYSTEM_FIELDS = new Set(['id', 'created_at', 'updated_at', 'sort', 'last_modified_by']);

      // Single timestamp for all writes in this request
      const now = getCurrentTimestamp();

      await db.transaction(async (tx: any) => {
        // Get the global table for the transaction
        const globalTable = schema[`global_${params.slug}` as keyof typeof schema];
        if (!globalTable) {
          throw new Error(`Global table for '${params.slug}' not found`);
        }

        // Check if item exists
        const existing = await tx
          .select({ id: (globalTable as any).id })
          .from(globalTable)
          .where(eq((globalTable as any).id, itemId))
          .limit(1);

        if (existing.length > 0) {
          // Update existing item
          const updateFields = Object.keys(regularFields).filter((key) => !SYSTEM_FIELDS.has(key));

          if (updateFields.length > 0) {
            // Build update data object for Drizzle
            const updateData: Record<string, any> = {};
            updateFields.forEach((key) => {
              const normalized = normalizeRelationId(key, regularFields[key]);
              updateData[key] = normalized;
            });
            updateData.updated_at = now;
            updateData.last_modified_by = locals.user.id;

            await tx
              .update(globalTable)
              .set(updateData)
              .where(eq((globalTable as any).id, itemId));
          }
        } else {
          // Create new item - build insert data object for Drizzle
          const insertData: Record<string, any> = {
            id: itemId,
            sort: 0,
            last_modified_by: locals.user.id,
            created_at: now,
            updated_at: now
          };

          // Add regular fields (excluding system fields)
          Object.keys(regularFields).forEach((key) => {
            if (SYSTEM_FIELDS.has(key)) return;
            const normalized = normalizeRelationId(key, regularFields[key]);
            insertData[key] = normalized;
          });

          await tx.insert(globalTable).values(insertData);
        }

        // Handle array fields - save to relation tables
        for (const [fieldName, arrayItems] of Object.entries(arrayFields)) {
          const fieldDef = globalFields[fieldName];
          if (fieldDef?.type !== 'array' || !fieldDef?.items?.properties) continue;

          const relationTableName = `global_${params.slug}_${fieldName}`;
          const relationTable = schema[relationTableName as keyof typeof schema];

          if (relationTable) {
            // Delete existing items for this global
            await tx.delete(relationTable).where(eq((relationTable as any).global_id, itemId));

            // Insert new array items
            for (let i = 0; i < arrayItems.length; i++) {
              const item = arrayItems[i];
              const insertData: Record<string, any> = {
                id: crypto.randomUUID(),
                global_id: itemId,
                sort: i,
                created_at: now,
                updated_at: now
              };

              // Add field properties from schema
              Object.keys(fieldDef.items.properties).forEach((propKey) => {
                insertData[propKey] = (item as any)[propKey] ?? null;
              });

              await tx.insert(relationTable).values(insertData);
            }
          }
        }
      });

      log.debug('Global saved successfully', {
        slug: params.slug,
        id: params.id,
        action: 'save',
        isFlat: isFlat
      });

      return { success: true };
    } catch (error) {
      log.error(
        'Failed to save global',
        {
          slug: params.slug,
          id: params.id,
          action: 'save'
        },
        error as Error
      );
      return fail(500, { error: 'Failed to save global' });
    }
  }
};
