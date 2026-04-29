import { error } from '@sveltejs/kit';
import { db } from '$sailor/core/db/index.server';
import { eq, isNotNull, desc } from 'drizzle-orm';
import * as schema from '$sailor/generated/schema';
import { log } from '$sailor/core/utils/logger';
import type { PageServerLoad } from './$types';

type RecoveryItem = {
  id: string;
  title: string;
  deleted_at: Date | null;
  deleted_by: string | null;
  deleted_by_name: string | null;
};

type CollectionGroup = {
  slug: string;
  label: string;
  items: RecoveryItem[];
};

type GlobalGroup = {
  slug: string;
  label: string;
  items: RecoveryItem[];
};

const PER_TYPE_LIMIT = 100;

export const load: PageServerLoad = async ({ locals }) => {
  // Recovery view exposes deleted content; require update on content to restore.
  if (!(await locals.security.hasPermission('read', 'content'))) {
    throw error(403, 'Access denied');
  }

  try {
    const [collectionTypeRows, globalTypeRows] = await Promise.all([
      db.query.collectionTypes.findMany(),
      db.query.globalTypes.findMany()
    ]);

    const collections: CollectionGroup[] = [];
    for (const ct of collectionTypeRows) {
      const table = schema[`collection_${ct.slug}` as keyof typeof schema];
      if (!table) continue;
      try {
        const rows = await db
          .select({
            id: (table as any).id,
            title: (table as any).title,
            deleted_at: (table as any).deleted_at,
            deleted_by: (table as any).deleted_by,
            deleted_by_name: schema.users.name
          })
          .from(table)
          .leftJoin(schema.users, eq((table as any).deleted_by, schema.users.id))
          .where(isNotNull((table as any).deleted_at))
          .orderBy(desc((table as any).deleted_at))
          .limit(PER_TYPE_LIMIT);

        if (rows.length > 0) {
          collections.push({
            slug: ct.slug,
            label: ct.name_plural,
            items: rows as RecoveryItem[]
          });
        }
      } catch (err) {
        // Tables predating the soft-delete columns will be caught by liveOnly's
        // fallback elsewhere, but here a missing column truly means we can't
        // list anything. Log and skip.
        log.warn(`Recovery: skipping collection_${ct.slug}`, { slug: ct.slug, error: err });
      }
    }

    const globals: GlobalGroup[] = [];
    for (const gt of globalTypeRows) {
      // Singleton (flat) globals don't get deleted via the bulk flow — skip.
      if (gt.data_type === 'flat') continue;
      const table = schema[`global_${gt.slug}` as keyof typeof schema];
      if (!table) continue;
      try {
        const rows = await db
          .select({
            id: (table as any).id,
            title: (table as any).title,
            deleted_at: (table as any).deleted_at,
            deleted_by: (table as any).deleted_by,
            deleted_by_name: schema.users.name
          })
          .from(table)
          .leftJoin(schema.users, eq((table as any).deleted_by, schema.users.id))
          .where(isNotNull((table as any).deleted_at))
          .orderBy(desc((table as any).deleted_at))
          .limit(PER_TYPE_LIMIT);

        if (rows.length > 0) {
          globals.push({
            slug: gt.slug,
            label: gt.name_plural,
            items: rows as RecoveryItem[]
          });
        }
      } catch (err) {
        log.warn(`Recovery: skipping global_${gt.slug}`, { slug: gt.slug, error: err });
      }
    }

    const fileRows = await db
      .select({
        id: schema.files.id,
        title: schema.files.name,
        deleted_at: schema.files.deleted_at,
        deleted_by: schema.files.deleted_by,
        deleted_by_name: schema.users.name
      })
      .from(schema.files)
      .leftJoin(schema.users, eq(schema.files.deleted_by, schema.users.id))
      .where(isNotNull(schema.files.deleted_at))
      .orderBy(desc(schema.files.deleted_at))
      .limit(PER_TYPE_LIMIT);

    const permissions = {
      restore: await locals.security.hasPermission('update', 'content'),
      purge: await locals.security.hasPermission('delete', 'content'),
      restoreFiles: await locals.security.hasPermission('update', 'files'),
      purgeFiles: await locals.security.hasPermission('delete', 'files')
    };

    return {
      collections,
      globals,
      files: fileRows as RecoveryItem[],
      permissions
    };
  } catch (err) {
    log.error('Failed to load recovery view', {}, err as Error);
    throw error(500, 'Failed to load recovery view');
  }
};
