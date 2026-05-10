import { redirect, error } from '@sveltejs/kit';
import { db } from 'sailorcms/core/db/index.server';
import { log } from 'sailorcms/core/utils/logger';
import { users } from '$sailor/generated/schema';
import { or, like, desc, count } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import type { User } from '$sailor/generated/types';
import type { Pagination } from 'sailorcms/core/types';

export const load: PageServerLoad = async ({ locals, url }) => {
  // Check permission to view users
  if (!(await locals.security.hasPermission('read', 'users'))) {
    throw error(403, 'Access denied: You do not have permission to view users');
  }

  const searchQuery = url.searchParams.get('search') || '';
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const pageSize = Math.max(1, Math.min(100, parseInt(url.searchParams.get('pageSize') || '20')));

  try {
    const where = searchQuery
      ? or(like(users.name, `%${searchQuery}%`), like(users.email, `%${searchQuery}%`))
      : undefined;

    const [countResult, userResults] = await Promise.all([
      db.select({ total: count() }).from(users).where(where),
      db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          created_at: users.created_at,
          updated_at: users.updated_at
        })
        .from(users)
        .where(where)
        .orderBy(desc(users.created_at))
        .limit(pageSize)
        .offset((page - 1) * pageSize)
    ]);

    const totalItems = Number(countResult[0]?.total || 0);
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const validPage = totalPages > 0 ? Math.min(page, totalPages) : 1;

    return {
      users: userResults as User[],
      searchQuery,
      pagination: {
        page: validPage,
        pageSize,
        totalItems,
        totalPages,
        hasNextPage: validPage < totalPages,
        hasPreviousPage: validPage > 1
      } as Pagination
    };
  } catch (error) {
    log.error('Failed to load users', {}, error as Error);
    return {
      users: [] as User[],
      searchQuery,
      pagination: null as Pagination | null
    };
  }
};
