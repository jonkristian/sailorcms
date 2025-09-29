import { command, getRequestEvent } from '$app/server';
import { db } from '$sailor/core/db/index.server';
import * as schema from '$sailor/generated/schema';
import { asc, sql, eq } from 'drizzle-orm';

/**
 * Get users for selection/search
 */
export const getUsers = command(
  'unchecked',
  async ({
    limit = 100,
    search = ''
  }: {
    limit?: number;
    search?: string;
  } = {}) => {
    const { locals } = getRequestEvent();

    // Check permission to view users
    if (!(await locals.security.hasPermission('read', 'users'))) {
      return { success: false, error: 'Access denied: You do not have permission to view users' };
    }

    try {
      const cleanLimit = Math.max(1, Math.min(1000, limit));
      const cleanSearch = search.trim();

      const where = cleanSearch
        ? sql`(lower(${schema.users.name}) like lower(${`%${cleanSearch}%`}) OR lower(${schema.users.email}) like lower(${`%${cleanSearch}%`}))`
        : undefined;

      const users = await db
        .select({
          id: schema.users.id,
          name: schema.users.name,
          email: schema.users.email
        })
        .from(schema.users)
        .where(where as any)
        .orderBy(asc(schema.users.name))
        .limit(cleanLimit);

      return {
        success: true,
        users
      };
    } catch (error) {
      console.error('Failed to fetch users:', error);
      return {
        success: false,
        error: 'Failed to fetch users'
      };
    }
  }
);

/**
 * Get user roles for selection
 */
export const getUserRoles = command('unchecked', async () => {
  const { locals } = getRequestEvent();

  // Check permission to view users
  if (!(await locals.security.hasPermission('read', 'users'))) {
    return { success: false, error: 'Access denied: You do not have permission to view users' };
  }

  try {
    const roles = await db.query.roles.findMany({
      orderBy: (roles: any, { asc }: any) => [asc(roles.name)]
    });

    return {
      success: true,
      roles
    };
  } catch (error) {
    console.error('Failed to fetch roles:', error);
    return {
      success: false,
      error: 'Failed to fetch roles'
    };
  }
});

/**
 * Get author name by user ID
 */
export const getAuthor = command('unchecked', async ({ userId }: { userId: string }) => {
  if (!userId) return { success: true, name: null };

  try {
    const user = await db
      .select({ name: schema.users.name })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    return {
      success: true,
      name: user[0]?.name || null
    };
  } catch (err) {
    return { success: true, name: null };
  }
});
