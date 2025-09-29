import { error } from '@sveltejs/kit';
import { log } from '$sailor/core/utils/logger';
import { db } from '$sailor/core/db/index.server';
import { eq, asc, desc } from 'drizzle-orm';
import * as schema from '$sailor/generated/schema';
import { TagService } from '$sailor/core/services/tag.server';
import { toSnakeCase } from '$sailor/core/utils/string';

export const load = async ({ params, locals }) => {
  // Check permission to view content
  if (!(await locals.security.hasPermission('read', 'content'))) {
    throw error(403, 'Access denied: You do not have permission to view content');
  }
  const { slug } = params;

  // Get global definition from database
  const globalTypeRow = await db.query.globalTypes.findFirst({
    where: eq(schema.globalTypes.slug, slug)
  });

  if (!globalTypeRow) {
    throw error(404, 'Global not found');
  }

  // Transform the global type to match the expected format
  const globalDefinition = {
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

  let items: any[] = [];
  let existingData: any = {};

  // Check if this is a flat global
  const isFlat = globalDefinition.dataType === 'flat';

  if (isFlat) {
    // For flat globals, get the specific item using globalSlug as ID
    const globalTable = schema[`global_${slug}` as keyof typeof schema];
    if (globalTable) {
      const result = await db
        .select()
        .from(globalTable)
        .where(eq((globalTable as any).id, slug))
        .limit(1);

      if (result.length > 0) {
        existingData = result[0];

        // Load array field data from relational tables
        const arrayFieldQueries = Object.entries(globalDefinition.fields)
          .filter(([_, fieldDef]) => (fieldDef as Record<string, unknown>).type === 'array')
          .map(async ([fieldName, _fieldDef]) => {
            try {
              // Convert camelCase field name to snake_case for table name
              const snakeCaseFieldName = toSnakeCase(fieldName);
              const relTableName = `global_${slug}_${snakeCaseFieldName}`;
              const relationTable = schema[relTableName as keyof typeof schema];
              if (relationTable) {
                const relResult = await db
                  .select()
                  .from(relationTable)
                  .where(eq((relationTable as any).global_id, existingData.id))
                  .orderBy(asc((relationTable as any).sort));
                existingData[fieldName] = relResult || [];
              } else {
                log.warn(`Relation table ${relTableName} not found in schema`);
                existingData[fieldName] = [];
              }
            } catch (err) {
              log.warn(`Could not load array field ${fieldName}:`, { fieldName, error: err });
              existingData[fieldName] = [];
            }
          });

        await Promise.all(arrayFieldQueries);
      } else {
        // Set default values for new flat global
        const defaultItem: any = {
          id: slug,
          created_at: new Date(),
          updated_at: new Date()
        };

        // Add default values for fields
        for (const [fieldName, fieldDef] of Object.entries(globalDefinition.fields)) {
          const fieldConfig = fieldDef as any;
          if (fieldConfig.default !== undefined) {
            defaultItem[fieldName] = fieldConfig.default;
          } else if (fieldConfig.type === 'array') {
            defaultItem[fieldName] = [];
          }
        }

        existingData = defaultItem;
      }
    }
  } else {
    // For non-flat globals, get all items
    const globalTable = schema[`global_${slug}` as keyof typeof schema];
    if (globalTable) {
      try {
        const result = await db
          .select()
          .from(globalTable)
          .orderBy(asc((globalTable as any).sort), desc((globalTable as any).created_at));
        items = result || [];
      } catch (err) {
        log.warn(`Could not load items for ${slug}`, { slug, error: err });
        items = [];
      }
    } else {
      log.warn(`Global table for ${slug} not found in schema`, { slug });
      items = [];
    }
  }

  // Load array field data from relational tables (for both singleton and regular globals)
  for (const [fieldName, fieldDef] of Object.entries(globalDefinition.fields)) {
    if ((fieldDef as any).type === 'array') {
      try {
        // Convert camelCase field name to snake_case for table name
        const snakeCaseFieldName = toSnakeCase(fieldName);
        const relTableName = `global_${slug}_${snakeCaseFieldName}`;
        const relationTable = schema[relTableName as keyof typeof schema];

        if (relationTable) {
          const relResult = await db
            .select()
            .from(relationTable)
            .orderBy(asc((relationTable as any).global_id), asc((relationTable as any).sort));

          if (isFlat) {
            // For singletons, attach to existingData
            existingData[fieldName] = relResult.filter(
              (row: any) => row.global_id === existingData.id
            );
          } else {
            // For regular globals, attach to each item
            const relData = relResult || [];
            items.forEach((item: any) => {
              item[fieldName] = relData.filter((row: any) => row.global_id === item.id);
            });
          }
        } else {
          if (isFlat) {
            existingData[fieldName] = [];
          } else {
            items.forEach((item: any) => {
              item[fieldName] = [];
            });
          }
        }
      } catch (err) {
        log.warn(`Could not load array field ${fieldName}`, { fieldName, error: err });
        if (isFlat) {
          existingData[fieldName] = [];
        } else {
          items.forEach((item) => {
            item[fieldName] = [];
          });
        }
      }
    }
  }

  // Load tags for all items (both flat and repeatable)
  if (isFlat && existingData) {
    // Load tags for flat global
    const tags = await TagService.getTagsForEntity(`global_${slug}`, existingData.id);

    // Find tag fields and attach tags
    Object.entries(globalDefinition.fields).forEach(([fieldName, fieldDef]) => {
      if ((fieldDef as any).type === 'tags') {
        existingData[fieldName] = tags;
      }
    });
  } else {
    // Load tags for each repeatable item
    for (const item of items) {
      const tags = await TagService.getTagsForEntity(`global_${slug}`, item.id);

      // Find tag fields and attach tags
      Object.entries(globalDefinition.fields).forEach(([fieldName, fieldDef]) => {
        if ((fieldDef as any).type === 'tags') {
          item[fieldName] = tags;
        }
      });
    }
  }

  // Calculate permissions for this route
  const permissions = {
    globals: {
      create: await locals.security.hasPermission('create', 'content'),
      update: await locals.security.hasPermission('update', 'content'),
      delete: await locals.security.hasPermission('delete', 'content'),
      view: await locals.security.hasPermission('read', 'content')
    }
  };

  return {
    global: globalDefinition,
    items,
    existingData: isFlat ? existingData : null,
    permissions
  };
};
