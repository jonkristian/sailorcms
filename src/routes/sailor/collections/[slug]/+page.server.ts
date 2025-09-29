import { error } from '@sveltejs/kit';
import { db } from '$sailor/core/db/index.server';
import { eq, desc, asc, count, and, or, sql, inArray } from 'drizzle-orm';
import * as schema from '$sailor/generated/schema';
import type { Pagination } from '$sailor/core/types';

export const load = async ({ params, locals, url }) => {
  // Check permission to view content
  if (!(await locals.security.hasPermission('read', 'content'))) {
    throw error(403, 'Access denied: You do not have permission to view content');
  }

  const { slug } = params;

  // Get the collection type
  const collectionTypeRow = await db.query.collectionTypes.findFirst({
    where: eq(schema.collectionTypes.slug, slug)
  });

  if (!collectionTypeRow) {
    throw error(404, 'Collection not found');
  }

  // Transform the collection type to match the expected format
  const options = JSON.parse(collectionTypeRow.options || '{}');
  const collectionType = {
    id: collectionTypeRow.id,
    name: {
      singular: collectionTypeRow.name_singular,
      plural: collectionTypeRow.name_plural
    },
    slug: collectionTypeRow.slug,
    description: collectionTypeRow.description,
    fields: JSON.parse(collectionTypeRow.schema),
    options,
    created_at: collectionTypeRow.created_at,
    updated_at: collectionTypeRow.updated_at
  };

  // Get pagination parameters from URL
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const pageSize = Math.max(1, Math.min(100, parseInt(url.searchParams.get('pageSize') || '20')));
  const searchQuery = url.searchParams.get('search')?.trim() || '';
  const sortBy = url.searchParams.get('sortBy') || (options.sortable ? 'sort' : 'updated_at');
  const sortOrder =
    url.searchParams.get('sortOrder') ||
    (options.sortable && !url.searchParams.get('sortBy') ? 'asc' : 'desc');

  try {
    // Get collection table reference
    const collectionTable = schema[`collection_${slug}` as keyof typeof schema];
    if (!collectionTable) {
      throw error(404, `Collection table for '${slug}' not found`);
    }

    // Build where conditions for search and access control
    const whereConditions = [];

    // Access control is handled by better-auth at the API level
    // No database-level filtering needed

    // For nestable collections with no search, only paginate top-level items
    // (parent_id is null, empty string, or invalid values like '[]')
    // When searching, we want to find all matching items regardless of hierarchy
    if (options.nestable && !searchQuery) {
      whereConditions.push(
        or(
          sql`${(collectionTable as any).parent_id} IS NULL`,
          sql`${(collectionTable as any).parent_id} = ''`,
          sql`${(collectionTable as any).parent_id} = '[]'`
        )
      );
    }

    if (searchQuery) {
      // Search in title and slug fields using case-insensitive search
      whereConditions.push(
        or(
          sql`lower(${(collectionTable as any).title}) like lower(${`%${searchQuery}%`})`,
          sql`lower(${(collectionTable as any).slug}) like lower(${`%${searchQuery}%`})`
        )
      );
    }

    const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined;

    let items;
    let totalItems;
    let totalPages;
    let validPage;

    if (options.nestable && !searchQuery) {
      // For nestable collections without search: paginate top-level items, then fetch all children
      const [countResult, topLevelResult] = await Promise.all([
        db.select({ total: count() }).from(collectionTable).where(whereClause),
        db
          .select({
            id: (collectionTable as any).id,
            title: (collectionTable as any).title,
            slug: (collectionTable as any).slug,
            status: (collectionTable as any).status,
            updated_at: (collectionTable as any).updated_at,
            created_at: (collectionTable as any).created_at,
            sort: (collectionTable as any).sort,
            parent_id: (collectionTable as any).parent_id,
            author: (collectionTable as any).author,
            author_name: schema.users.name,
            author_email: schema.users.email
          })
          .from(collectionTable)
          .leftJoin(schema.users, eq((collectionTable as any).author, schema.users.id))
          .where(whereClause)
          .orderBy(
            sortOrder === 'asc'
              ? asc((collectionTable as any)[sortBy])
              : desc((collectionTable as any)[sortBy])
          )
          .limit(pageSize)
          .offset((page - 1) * pageSize)
      ]);

      totalItems = Number(countResult[0]?.total || 0);
      totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
      validPage = totalPages > 0 ? Math.min(page, totalPages) : 1;

      // Get all children for the paginated top-level items (recursively)
      if (topLevelResult.length > 0) {
        const topLevelIds = topLevelResult.map((item: any) => item.id);

        // Recursively fetch all descendants
        const allDescendants = [];
        let currentLevelIds = [...topLevelIds];

        while (currentLevelIds.length > 0) {
          const childrenWhereConditions = [];

          childrenWhereConditions.push(
            inArray((collectionTable as any).parent_id, currentLevelIds)
          );
          const childrenWhereClause = and(...childrenWhereConditions);

          const childrenResult = await db
            .select({
              id: (collectionTable as any).id,
              title: (collectionTable as any).title,
              slug: (collectionTable as any).slug,
              status: (collectionTable as any).status,
              updated_at: (collectionTable as any).updated_at,
              created_at: (collectionTable as any).created_at,
              sort: (collectionTable as any).sort,
              parent_id: (collectionTable as any).parent_id,
              author: (collectionTable as any).author,
              author_name: schema.users.name,
              author_email: schema.users.email
            })
            .from(collectionTable)
            .leftJoin(schema.users, eq((collectionTable as any).author, schema.users.id))
            .where(childrenWhereClause)
            .orderBy(asc((collectionTable as any).sort));

          if (childrenResult.length === 0) {
            break; // No more children found
          }

          allDescendants.push(...childrenResult);
          currentLevelIds = childrenResult.map((item: any) => item.id);
        }

        // Combine top-level and all descendants
        items = [...topLevelResult, ...allDescendants];
      } else {
        items = topLevelResult;
      }
    } else {
      // For non-nestable collections OR nestable collections with search: use flat pagination logic
      const [countResult, result] = await Promise.all([
        db.select({ total: count() }).from(collectionTable).where(whereClause),
        db
          .select({
            id: (collectionTable as any).id,
            title: (collectionTable as any).title,
            slug: (collectionTable as any).slug,
            status: (collectionTable as any).status,
            updated_at: (collectionTable as any).updated_at,
            created_at: (collectionTable as any).created_at,
            sort: (collectionTable as any).sort,
            parent_id: (collectionTable as any).parent_id,
            author: (collectionTable as any).author,
            author_name: schema.users.name,
            author_email: schema.users.email
          })
          .from(collectionTable)
          .leftJoin(schema.users, eq((collectionTable as any).author, schema.users.id))
          .where(whereClause)
          .orderBy(
            sortOrder === 'asc'
              ? asc((collectionTable as any)[sortBy])
              : desc((collectionTable as any)[sortBy])
          )
          .limit(pageSize)
          .offset((page - 1) * pageSize)
      ]);

      totalItems = Number(countResult[0]?.total || 0);
      totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
      validPage = totalPages > 0 ? Math.min(page, totalPages) : 1;
      items = result;
    }

    // Calculate permissions for this route
    const permissions = {
      collections: {
        create: await locals.security.hasPermission('create', 'content'),
        update: await locals.security.hasPermission('update', 'content'),
        delete: await locals.security.hasPermission('delete', 'content'),
        view: await locals.security.hasPermission('read', 'content')
      }
    };

    return {
      collectionType,
      items,
      pagination: {
        page: validPage,
        pageSize,
        totalItems,
        totalPages,
        hasNextPage: validPage < totalPages,
        hasPreviousPage: validPage > 1
      } as Pagination,
      permissions
    };
  } catch (err) {
    throw error(500, 'Failed to fetch collection items');
  }
};
