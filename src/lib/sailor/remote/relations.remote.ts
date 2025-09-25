import { command } from '$app/server';
import { db } from '$sailor/core/db/index.server';
import * as schema from '$sailor/generated/schema';
import { sql } from 'drizzle-orm';

export const getRelationItem = command(
  'unchecked',
  async ({ scope, slug, id }: { scope: 'global' | 'collection'; slug: string; id: string }) => {
    try {
      if (!id || !slug || (scope !== 'global' && scope !== 'collection')) {
        return { success: false, error: 'Invalid parameters' };
      }

      const tableName = `${scope}_${slug}`;
      const table = (schema as any)[tableName];

      if (table) {
        const rows = await db
          .select({ id: (table as any).id, title: (table as any).title })
          .from(table)
          .where(sql`${(table as any).id} = ${id}`)
          .limit(1);
        const row = rows[0];
        if (!row) return { success: true, item: null };
        return { success: true, item: { id: row.id, title: row.title } };
      }

      // Fallback to raw SQL for dynamic table name if not in schema map
      const result = await db.run(
        sql`SELECT id, title FROM ${sql.identifier(tableName)} WHERE id = ${id} LIMIT 1`
      );
      const row = result.rows[0];
      if (!row) return { success: true, item: null };
      return { success: true, item: { id: row.id, title: row.title } };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load relation item'
      };
    }
  }
);
