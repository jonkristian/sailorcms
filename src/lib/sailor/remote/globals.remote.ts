import { command } from '$app/server';
import { db } from 'sailorcms/core/db/index.server';
import { and, asc, desc, eq } from 'drizzle-orm';
import * as schema from '$sailor/generated/schema';
import { fieldConfigurations } from '$sailor/generated/fields';
import { getContentSettings } from 'sailorcms/utils/data/collections';

export const getGlobalItems = command('unchecked', async ({ slug }: { slug: string }) => {
  try {
    // Validate slug format (alphanumeric, underscores, hyphens only)
    const slugPattern = /^[a-zA-Z0-9_-]+$/;
    if (!slugPattern.test(slug)) {
      return { success: false, error: 'Invalid slug format' };
    }

    // Fetch items from the global table
    const globalTable = schema[`global_${slug}` as keyof typeof schema];
    if (!globalTable) {
      return { success: false, error: `Global table for '${slug}' not found` };
    }

    // For localized globals, title + sort live on `_locales` (and main's
    // copies may have been dropped by `doctor --fix`). Pull them via JOIN at
    // the default locale; otherwise use main directly.
    const isLocalized = (fieldConfigurations as any).globals?.[slug]?.localized === true;
    const localesTable = isLocalized
      ? (schema[`global_${slug}_locales` as keyof typeof schema] as any)
      : null;
    const defaultLocale = isLocalized ? getContentSettings().defaultLocale : null;

    const result =
      isLocalized && localesTable && defaultLocale
        ? await db
            .select({
              id: (globalTable as any).id,
              title: localesTable.title
            })
            .from(globalTable)
            .innerJoin(
              localesTable,
              and(
                eq(localesTable[`${slug}_id`], (globalTable as any).id),
                eq(localesTable.locale, defaultLocale)
              )
            )
            .orderBy(asc(localesTable.sort), desc((globalTable as any).created_at))
        : await db
            .select({
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              id: (globalTable as any).id,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              title: (globalTable as any).title
            })
            .from(globalTable)
            .orderBy(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              asc((globalTable as any).sort),
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              desc((globalTable as any).created_at)
            );

    const items = result.map((row: any) => ({
      id: row.id,
      title: row.title
    }));

    return { success: true, items };
  } catch (error) {
    console.error('Failed to fetch global items:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch global items'
    };
  }
});
