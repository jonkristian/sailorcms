import { error } from '@sveltejs/kit';
import { log } from 'sailorcms/core/utils/logger';
import { db } from 'sailorcms/core/db/index.server';
import { eq, asc, desc, and, count } from 'drizzle-orm';
import * as schema from '$sailor/generated/schema';
import { TagService } from 'sailorcms/core/services/tag.server';
import { toSnakeCase } from 'sailorcms/core/utils/string';
import { liveOnly } from 'sailorcms/core/db/soft-delete';
import { loadFileFields } from 'sailorcms/utils/data/loaders/file-loader';
import type { Pagination } from 'sailorcms/core/types';

export const load = async ({ params, locals, url }) => {
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
  let pagination: Pagination | null = null;

  // Check if this is a flat global
  const isFlat = globalDefinition.dataType === 'flat';

  // Nestable and inline repeatable views render the entire set on the page
  // (tree expansion / inline editing) so they intentionally bypass pagination.
  // Regular repeatable + relational types go through TableView and paginate.
  const usesTableView =
    !isFlat &&
    !(
      globalDefinition.dataType === 'repeatable' &&
      (globalDefinition.options?.nestable || globalDefinition.options?.inline)
    );

  if (isFlat) {
    // For flat globals, get the specific item using globalSlug as ID
    const globalTable = schema[`global_${slug}` as keyof typeof schema];
    if (globalTable) {
      const result = await db
        .select()
        .from(globalTable)
        .where(and(eq((globalTable as any).id, slug), liveOnly(globalTable)))
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
    // For non-flat globals, get all items (paginated for TableView paths)
    const globalTable = schema[`global_${slug}` as keyof typeof schema];
    if (globalTable) {
      try {
        if (usesTableView) {
          const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
          const pageSize = Math.max(
            1,
            Math.min(100, parseInt(url.searchParams.get('pageSize') || '20'))
          );

          const [countResult, result] = await Promise.all([
            db.select({ total: count() }).from(globalTable).where(liveOnly(globalTable)),
            db
              .select()
              .from(globalTable)
              .where(liveOnly(globalTable))
              .orderBy(asc((globalTable as any).sort), desc((globalTable as any).created_at))
              .limit(pageSize)
              .offset((page - 1) * pageSize)
          ]);

          const totalItems = Number(countResult[0]?.total || 0);
          const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
          const validPage = totalPages > 0 ? Math.min(page, totalPages) : 1;

          items = result || [];
          pagination = {
            page: validPage,
            pageSize,
            totalItems,
            totalPages,
            hasNextPage: validPage < totalPages,
            hasPreviousPage: validPage > 1
          };
        } else {
          // Nestable / inline repeatable: load the full set
          const result = await db
            .select()
            .from(globalTable)
            .where(liveOnly(globalTable))
            .orderBy(asc((globalTable as any).sort), desc((globalTable as any).created_at));
          items = result || [];
        }
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

  // Files nested inside array items: the top-level file loop below only walks
  // globalDefinition.fields, so file fields declared inside array items.properties
  // need a separate pass per row. Form expects IDs, so loadFullFileObjects=false.
  // Stale column values (from schemas generated before file fields were excluded
  // from buildArrayItemFields) are cleared so the loader always re-fetches from
  // the file-relation table, which is the canonical source.
  for (const [fieldName, fieldDef] of Object.entries(globalDefinition.fields)) {
    if ((fieldDef as any).type !== 'array') continue;
    const itemsProperties = (fieldDef as any).items?.properties;
    if (!itemsProperties) continue;

    const snakeCaseFieldName = toSnakeCase(fieldName);
    const arrayTableName = `global_${slug}_${snakeCaseFieldName}`;

    const fileKeys: Array<[string, string]> = Object.entries(itemsProperties)
      .filter(([, def]) => (def as any).type === 'file')
      .map(([key]) => [key, toSnakeCase(key)]);

    if (fileKeys.length === 0) continue;

    const rowSets: any[][] = isFlat
      ? [(existingData[fieldName] as any[]) || []]
      : items.map((it: any) => (it[fieldName] as any[]) || []);

    for (const rows of rowSets) {
      for (const row of rows) {
        for (const [k, snakeK] of fileKeys) {
          delete row[k];
          if (snakeK !== k) delete row[snakeK];
        }
        await loadFileFields(row, itemsProperties, arrayTableName, false);
      }
    }
  }

  // Load file field data from file relation tables (for both flat and repeatable globals)
  for (const [fieldName, fieldDef] of Object.entries(globalDefinition.fields)) {
    if ((fieldDef as any).type === 'file') {
      try {
        const snakeCaseFieldName = toSnakeCase(fieldName);
        const fileTableName = `global_${slug}_${snakeCaseFieldName}`;
        const fileTable = schema[fileTableName as keyof typeof schema];

        if (fileTable) {
          const fileResult = await db
            .select({
              id: (fileTable as any).id,
              parent_id: (fileTable as any).parent_id,
              file_id: (fileTable as any).file_id,
              sort: (fileTable as any).sort,
              alt_override: (fileTable as any).alt_override,
              filename: schema.files.name,
              path: schema.files.path,
              url: schema.files.url,
              file_size: schema.files.size,
              mime_type: schema.files.mime_type
            })
            .from(fileTable)
            .innerJoin(schema.files, eq(schema.files.id, (fileTable as any).file_id))
            .where(eq((fileTable as any).parent_type, 'global'))
            .orderBy(asc((fileTable as any).parent_id), asc((fileTable as any).sort));

          if (isFlat) {
            // For flat globals, attach to existingData
            const filteredFiles = fileResult.filter(
              (row: any) => row.parent_id === existingData.id
            );
            // For single file fields, use the file ID string or empty string
            const fileId = filteredFiles.length > 0 ? filteredFiles[0].file_id : '';
            existingData[fieldName] = fileId;
          } else {
            // For repeatable globals, attach to each item
            const allFileData = fileResult || [];
            items.forEach((item: any) => {
              const itemFiles = allFileData.filter((row: any) => row.parent_id === item.id);
              // For single file fields, use the file ID string or empty string
              const fileId = itemFiles.length > 0 ? itemFiles[0].file_id : '';
              item[fieldName] = fileId;
            });
          }
        } else {
          log.warn(`File relation table ${fileTableName} not found in schema`);
          if (isFlat) {
            existingData[fieldName] = [];
          } else {
            items.forEach((item: any) => {
              item[fieldName] = [];
            });
          }
        }
      } catch (err) {
        log.warn(`Could not load file field ${fieldName}:`, { fieldName, error: err });

        if (isFlat) {
          existingData[fieldName] = [];
        } else {
          items.forEach((item: any) => {
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
    pagination,
    permissions
  };
};
