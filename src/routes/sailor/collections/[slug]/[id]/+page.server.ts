import { error } from '@sveltejs/kit';
import { db } from '$sailor/core/db/index.server';
import * as schema from '$sailor/generated/schema';
import { sql, eq, and } from 'drizzle-orm';
import { getCurrentTimestamp } from '$sailor/core/utils/date';
import { collectionTypes } from '$sailor/core/db/index.server';
import { TagService } from '$sailor/core/services/tag.server';
import { loadBlockData } from '$sailor/core/content/blocks.server';
import { SystemSettingsService } from '$sailor/core/services/system-settings.server';
import { createACL, requirePermission } from '$sailor/core/auth/acl';
import type { PageServerLoad } from './$types';
import { log } from '$sailor/core/utils/logger';
import type { CollectionTypes, BlockTypes } from '$sailor/generated/types';

export const load: PageServerLoad = async ({ params, locals, request, url }) => {
  // Authentication and authorization handled by hooks

  const { slug, id } = params;

  // Get collection definition and block types from database in parallel
  const [collectionTypeRow, blockTypesResult] = await Promise.all([
    db.query.collectionTypes.findFirst({
      where: (collectionTypes: any, { eq }: any) => eq(collectionTypes.slug, slug)
    }),
    db.query.blockTypes.findMany()
  ]);

  if (!collectionTypeRow) {
    throw error(404, 'Collection not found');
  }

  // Parse the stored schema - core fields are handled separately
  const effectiveFields = JSON.parse(collectionTypeRow.schema);

  // Transform the collection type to match the expected format
  const collectionDefinition = {
    id: collectionTypeRow.id,
    name: {
      singular: collectionTypeRow.name_singular,
      plural: collectionTypeRow.name_plural
    },
    slug: collectionTypeRow.slug,
    description: collectionTypeRow.description,
    fields: effectiveFields,
    options: collectionTypeRow.options ? JSON.parse(collectionTypeRow.options) : {},
    created_at: collectionTypeRow.created_at,
    updated_at: collectionTypeRow.updated_at
  };

  const availableBlocks: Record<string, any> = {};

  for (const blockType of blockTypesResult) {
    availableBlocks[blockType.slug] = {
      name: blockType.name,
      slug: blockType.slug,
      description: blockType.description,
      fields: JSON.parse(blockType.schema)
    };
  }

  // Get the collection table dynamically
  const collectionTable = schema[`collection_${slug}` as keyof typeof schema];
  if (!collectionTable) {
    throw error(404, `Collection table for '${slug}' not found`);
  }

  // Create ACL instance for item-specific permission checks
  const acl = createACL(locals.user);

  // Try to get the existing item with access control
  const accessControl = await acl.buildQueryConditions('collection', collectionTable);
  const whereConditions = [eq((collectionTable as any).id, id)];
  if (accessControl) {
    whereConditions.push(accessControl);
  }

  const existingItems = await db
    .select()
    .from(collectionTable)
    .where(and(...whereConditions))
    .limit(1);

  let page: Record<string, any>;
  let isNewItem = false;
  const blocks: any[] = [];

  if (existingItems.length === 0) {
    // This is a new item - create permission is checked by hooks at route level

    isNewItem = true;
    const defaultTitle = `New ${collectionDefinition.name.singular}`;
    page = {
      id: id,
      title: defaultTitle,
      slug: '',
      status: 'draft',
      created_at: getCurrentTimestamp(),
      updated_at: getCurrentTimestamp()
    };

    // Initialize empty arrays for tag fields
    for (const [fieldName, fieldDef] of Object.entries(collectionDefinition.fields)) {
      if ((fieldDef as any).type === 'tags') {
        page[fieldName] = [];
      }
    }

    // Initialize SEO fields if SEO is enabled
    if (collectionDefinition.options.seo) {
      const { SEO_FIELDS } = await import('$sailor/core/types');
      Object.keys(SEO_FIELDS).forEach((seoField) => {
        page[seoField] = '';
      });
    }
  } else {
    // Existing item found
    page = existingItems[0] as Record<string, any>;

    // For edit routes, check if user can update this specific item
    await requirePermission(acl, 'update', 'collection', page, {
      request,
      url,
      user: locals.user!
    });

    // Load tags for existing item - load into tag fields
    try {
      const entityTags = await TagService.getTagsForEntity(`collection_${slug}`, id);
      // Find all tag fields and populate them
      for (const [fieldName, fieldDef] of Object.entries(collectionDefinition.fields)) {
        if ((fieldDef as any).type === 'tags') {
          page[fieldName] = entityTags;
        }
      }
    } catch (error) {
      log.warn('Failed to load tags for collection item', { id, error });
      // Initialize empty arrays for tag fields
      for (const [fieldName, fieldDef] of Object.entries(collectionDefinition.fields)) {
        if ((fieldDef as any).type === 'tags') {
          page[fieldName] = [];
        }
      }
    }

    // Load relation data for collection fields
    for (const [fieldName, fieldDef] of Object.entries(collectionDefinition.fields)) {
      if ((fieldDef as any).type === 'relation') {
        // Use the correct junction table naming convention
        const junctionTableName =
          (fieldDef as any).relation?.through || `junction_${slug}_${fieldName}`;
        const targetGlobal = (fieldDef as any).relation?.targetGlobal;
        const targetCollection = (fieldDef as any).relation?.targetCollection;

        try {
          const relationResult = await db.run(
            sql`SELECT target_id FROM ${sql.identifier(junctionTableName)} WHERE collection_id = ${id}`
          );

          // Get the target IDs
          const targetIds = relationResult.rows.map((row: any) => row.target_id);

          // If we have target IDs, fetch the full item details
          if (targetIds.length > 0) {
            let targetTable: string;
            if (targetGlobal) {
              targetTable = `global_${targetGlobal}`;
            } else if (targetCollection) {
              targetTable = `collection_${targetCollection}`;
            } else {
              // Fallback to just IDs if we can't determine the target table
              page[fieldName] = JSON.stringify(targetIds);
              continue;
            }

            // Fetch the full item details
            const targetResult = await db.run(
              sql`SELECT id, title FROM ${sql.identifier(targetTable)} WHERE id IN (${sql.join(
                targetIds.map((id: any) => sql`${id}`),
                sql`, `
              )})`
            );

            // Return array of objects with id and title for initial display; RelationField still emits IDs on change
            const relationItems = targetResult.rows.map((row: any) => ({
              id: row.id,
              title: row.title
            }));
            page[fieldName] = relationItems;
          } else {
            page[fieldName] = [];
          }
        } catch {
          // Relation table doesn't exist yet
          page[fieldName] = [];
        }
      }
    }

    // Get raw blocks data for each block type using dynamic schemas
    for (const [blockSlug, blockDef] of Object.entries(availableBlocks)) {
      try {
        const blocksResult = await db.run(
          sql`SELECT * FROM ${sql.identifier(`block_${blockSlug}`)} WHERE collection_id = ${id} ORDER BY "sort"`
        );

        for (const block of blocksResult.rows) {
          // Load the main block data with array fields
          await loadBlockData(block, blockSlug, blockDef.fields || {}, undefined, false);

          // Get relation data from the processed block
          let relationData: any[] = [];
          const arrayField = Object.entries(blockDef.fields || {}).find(
            ([_, fieldDef]: [string, any]) => fieldDef.type === 'array'
          );

          if (arrayField) {
            const [fieldName] = arrayField;
            relationData = block[fieldName] || [];
          }

          // Get file relations for each file field
          const fileRelations: Record<string, any[]> = {};
          const fileFields = Object.entries(blockDef.fields || {}).filter(
            ([_, fieldDef]: [string, any]) => fieldDef.type === 'file'
          );

          for (const [fieldName] of fileFields) {
            try {
              const fileResult = await db.run(
                sql`SELECT * FROM ${sql.identifier(`block_${blockSlug}_${fieldName}`)} WHERE block_id = ${block.id} ORDER BY "sort"`
              );
              fileRelations[fieldName] = fileResult.rows;
            } catch {
              // File relation table doesn't exist yet
              fileRelations[fieldName] = [];
            }
          }

          blocks.push({
            id: block.id,
            blockType: blockSlug,
            blockSchema: blockDef,
            data: block,
            relations: relationData,
            fileRelations: fileRelations
          });
        }
      } catch {
        // Block table doesn't exist yet - skip this block type
        log.warn(`Block table block_${blockSlug} doesn't exist yet, skipping`, { blockSlug });
      }
    }

    // Sort by sort
    blocks.sort((a, b) => a.data.sort - b.data.sort);
  }

  // Get site URL for SEO canonical URL generation
  const siteUrl = await SystemSettingsService.getSetting('site.url');

  // Load user names for author and last_modified_by fields
  if (!isNewItem) {
    try {
      // Load author name if author field exists
      if (page.author) {
        const authorUser = await db.query.users.findFirst({
          where: (users: any, { eq }: any) => eq(users.id, page.author),
          columns: { name: true, email: true }
        });
        page.authorName = authorUser?.name || null;
        page.authorEmail = authorUser?.email || null;
      }

      // Load last modified by name if field exists
      if (page.last_modified_by) {
        const lastModifiedUser = await db.query.users.findFirst({
          where: (users: any, { eq }: any) => eq(users.id, page.last_modified_by),
          columns: { name: true, email: true }
        });
        page.lastModifiedByName = lastModifiedUser?.name || null;
        page.lastModifiedByEmail = lastModifiedUser?.email || null;
      }
    } catch (error) {
      log.warn('Failed to load user names', { error });
    }
  }

  // Setup header actions
  const headerActions = [];

  // Always add payload preview action (left side)
  headerActions.push({
    type: 'payload-preview',
    props: {
      pageId: String(page.id || ''),
      collectionSlug: slug,
      collectionFields: effectiveFields,
      initialPayload: {
        ...page,
        blocks: blocks.map((block: any) => ({
          id: block.id,
          blockType: block.blockType,
          content: block.data,
          sort: block.data.sort
        }))
      }
    }
  });

  // Add preview link if not a new item and has slug (left side)
  if (!isNewItem && page.slug) {
    // Use collection's basePath option, fallback to /${slug}/ if not defined
    const basePath = collectionDefinition.options?.basePath || `/${slug}/`;
    const previewUrl = `${basePath}${page.slug}`;
    headerActions.push({
      type: 'preview-link',
      props: {
        href: previewUrl,
        title: 'Preview'
      }
    });
  }

  // Add save button as last action (right side)
  headerActions.push({
    type: 'save-button',
    props: {
      text: isNewItem ? 'Create' : 'Save',
      submittingText: isNewItem ? 'Creating...' : 'Saving...',
      submitting: false, // Will be updated client-side
      formId: 'collection-form' // Submit the form instead
    }
  });

  return {
    page: { ...page, blocks } as CollectionTypes[keyof CollectionTypes] & {
      blocks: BlockTypes[keyof BlockTypes][];
    } & Record<string, any>,
    isNewItem,
    collectionType: collectionDefinition,
    availableBlocks: Object.values(availableBlocks),
    slug: slug,
    hasBlocks: collectionDefinition.options?.blocks !== false, // Default to true if not specified
    siteUrl: siteUrl || '',
    headerActions
  };
};
