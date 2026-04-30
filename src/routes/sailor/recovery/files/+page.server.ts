import { error } from '@sveltejs/kit';
import { db } from '$sailor/core/db/index.server';
import { eq, isNotNull, desc, count } from 'drizzle-orm';
import * as schema from '$sailor/generated/schema';
import { log } from '$sailor/core/utils/logger';
import { StorageProviderFactory } from '$sailor/core/services/storage-provider.server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!(await locals.security.hasPermission('read', 'content'))) {
    throw error(403, 'Access denied');
  }

  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const pageSize = Math.max(1, Math.min(100, parseInt(url.searchParams.get('pageSize') || '20')));
  const offset = (page - 1) * pageSize;

  try {
    const [{ totalItems }] = await db
      .select({ totalItems: count() })
      .from(schema.files)
      .where(isNotNull(schema.files.deleted_at));

    const fileRows = await db
      .select({
        id: schema.files.id,
        title: schema.files.name,
        deleted_at: schema.files.deleted_at,
        deleted_by: schema.files.deleted_by,
        deleted_by_name: schema.users.name,
        mime_type: schema.files.mime_type,
        path: schema.files.path,
        url: schema.files.url
      })
      .from(schema.files)
      .leftJoin(schema.users, eq(schema.files.deleted_by, schema.users.id))
      .where(isNotNull(schema.files.deleted_at))
      .orderBy(desc(schema.files.deleted_at))
      .limit(pageSize)
      .offset(offset);

    const storageProvider = await StorageProviderFactory.getProvider();
    const files = await Promise.all(
      fileRows.map(async (f: (typeof fileRows)[number]) => ({
        id: f.id,
        title: f.title,
        deleted_at: f.deleted_at,
        deleted_by: f.deleted_by,
        deleted_by_name: f.deleted_by_name,
        mime_type: f.mime_type,
        url: f.url && f.url !== '' ? f.url : await storageProvider.getPublicUrl(f.path)
      }))
    );

    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

    return {
      files,
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1
      },
      permissions: {
        restoreFiles: await locals.security.hasPermission('update', 'files'),
        purgeFiles: await locals.security.hasPermission('delete', 'files')
      }
    };
  } catch (err) {
    log.error('Failed to load recovery files', {}, err as Error);
    throw error(500, 'Failed to load deleted files');
  }
};
