import { error, isHttpError, isRedirect } from '@sveltejs/kit';
import { db } from 'sailorcms/core/db/index.server';
import { isNotNull, count } from 'drizzle-orm';
import * as schema from '$sailor/generated/schema';
import { log } from 'sailorcms/core/utils/logger';
import type { PageServerLoad } from './$types';

type TypeEntry = {
  slug: string;
  label: string;
  count: number;
};

export const load: PageServerLoad = async ({ locals }) => {
  if (!(await locals.security.hasPermission('read', 'content'))) {
    throw error(403, 'Access denied');
  }

  try {
    const [collectionTypeRows, globalTypeRows] = await Promise.all([
      db.query.collectionTypes.findMany(),
      db.query.globalTypes.findMany()
    ]);

    const collections: TypeEntry[] = [];
    for (const ct of collectionTypeRows) {
      const table = schema[`collection_${ct.slug}` as keyof typeof schema];
      if (!table) continue;
      try {
        const [{ n }] = await db
          .select({ n: count() })
          .from(table as any)
          .where(isNotNull((table as any).deleted_at));
        if (n > 0) {
          collections.push({ slug: ct.slug, label: ct.name_plural, count: n });
        }
      } catch (err) {
        log.warn(`Recovery index: skipping collection_${ct.slug}`, {
          slug: ct.slug,
          error: err
        });
      }
    }

    const globals: TypeEntry[] = [];
    for (const gt of globalTypeRows) {
      if (gt.data_type === 'flat') continue;
      const table = schema[`global_${gt.slug}` as keyof typeof schema];
      if (!table) continue;
      try {
        const [{ n }] = await db
          .select({ n: count() })
          .from(table as any)
          .where(isNotNull((table as any).deleted_at));
        if (n > 0) {
          globals.push({ slug: gt.slug, label: gt.name_plural, count: n });
        }
      } catch (err) {
        log.warn(`Recovery index: skipping global_${gt.slug}`, { slug: gt.slug, error: err });
      }
    }

    const [{ n: filesCount }] = await db
      .select({ n: count() })
      .from(schema.files)
      .where(isNotNull(schema.files.deleted_at));

    return {
      collections,
      globals,
      filesCount,
      totalItems:
        filesCount +
        collections.reduce((acc, c) => acc + c.count, 0) +
        globals.reduce((acc, g) => acc + g.count, 0)
    };
  } catch (err) {
    // A `redirect()` or `error()` thrown deeper is a deliberate response, not a
    // failure — rethrow it untouched. Flattening everything into a 500 here
    // turned auth redirects and 404s into server errors.
    if (isHttpError(err) || isRedirect(err)) throw err;
    log.error('Failed to load recovery index', {}, err as Error);
    throw error(500, 'Failed to load recovery view');
  }
};
