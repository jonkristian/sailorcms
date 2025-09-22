import { command } from '$app/server';
import { db } from '$sailor/core/db/index.server';
import { asc, desc } from 'drizzle-orm';
import * as schema from '$sailor/generated/schema';

/**
 * Get items from a global table for relation fields
 */
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

    const result = await db
      .select({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        id: (globalTable as any).id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        title: (globalTable as any).title
      })
      .from(globalTable)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .orderBy(asc((globalTable as any).sort), desc((globalTable as any).created_at));

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
