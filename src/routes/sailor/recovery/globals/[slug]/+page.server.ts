import { error } from '@sveltejs/kit';
import { db } from 'sailorcms/core/db/index.server';
import { eq, isNotNull, desc, count } from 'drizzle-orm';
import * as schema from '$sailor/generated/schema';
import { entityLabelJoin } from 'sailorcms/utils/data/entity-label.server';
import { log } from 'sailorcms/core/utils/logger';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url }) => {
  if (!(await locals.security.hasPermission('read', 'content'))) {
    throw error(403, 'Access denied');
  }

  const slug = params.slug;
  const globalType = await db.query.globalTypes.findFirst({
    where: eq(schema.globalTypes.slug, slug)
  });
  if (!globalType) throw error(404, 'Global not found');
  if (globalType.data_type === 'flat') throw error(404, 'Singleton globals do not use recovery');

  const join = entityLabelJoin('global', slug);
  if (!join.table) throw error(404, 'Global table not found');
  const table = join.table;

  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const pageSize = Math.max(1, Math.min(100, parseInt(url.searchParams.get('pageSize') || '20')));
  const offset = (page - 1) * pageSize;

  try {
    const [{ totalItems }] = await db
      .select({ totalItems: count() })
      .from(table)
      .where(isNotNull(table.deleted_at));

    let itemsQuery = db
      .select({
        id: table.id,
        title: join.title,
        deleted_at: table.deleted_at,
        deleted_by: table.deleted_by,
        deleted_by_name: schema.users.name
      })
      .from(table)
      .$dynamic();

    if (join.localesTable && join.joinCondition) {
      itemsQuery = itemsQuery.leftJoin(join.localesTable, join.joinCondition);
    }

    const items = await itemsQuery
      .leftJoin(schema.users, eq(table.deleted_by, schema.users.id))
      .where(isNotNull(table.deleted_at))
      .orderBy(desc(table.deleted_at))
      .limit(pageSize)
      .offset(offset);

    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

    return {
      slug,
      label: globalType.name_plural,
      itemLabels: {
        singular: globalType.name_singular.toLowerCase(),
        plural: globalType.name_plural.toLowerCase()
      },
      items,
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1
      },
      permissions: {
        restore: await locals.security.hasPermission('update', 'content'),
        purge: await locals.security.hasPermission('delete', 'content')
      }
    };
  } catch (err) {
    log.error('Failed to load recovery global', { slug }, err as Error);
    throw error(500, 'Failed to load deleted items');
  }
};
