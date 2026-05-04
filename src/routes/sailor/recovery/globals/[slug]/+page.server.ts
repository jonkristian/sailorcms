import { error } from '@sveltejs/kit';
import { db } from '$sailor/core/db/index.server';
import { eq, isNotNull, desc, count } from 'drizzle-orm';
import * as schema from '$sailor/generated/schema';
import { log } from '$sailor/core/utils/logger';
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

  const table = schema[`global_${slug}` as keyof typeof schema];
  if (!table) throw error(404, 'Global table not found');

  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const pageSize = Math.max(1, Math.min(100, parseInt(url.searchParams.get('pageSize') || '20')));
  const offset = (page - 1) * pageSize;

  try {
    const [{ totalItems }] = await db
      .select({ totalItems: count() })
      .from(table as any)
      .where(isNotNull((table as any).deleted_at));

    const items = await db
      .select({
        id: (table as any).id,
        title: (table as any).title,
        deleted_at: (table as any).deleted_at,
        deleted_by: (table as any).deleted_by,
        deleted_by_name: schema.users.name
      })
      .from(table as any)
      .leftJoin(schema.users, eq((table as any).deleted_by, schema.users.id))
      .where(isNotNull((table as any).deleted_at))
      .orderBy(desc((table as any).deleted_at))
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
