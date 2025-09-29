import { redirect, error } from '@sveltejs/kit';
import { db } from '$sailor/core/db/index.server';
import { log } from '$sailor/core/utils/logger';
import { users } from '$sailor/generated/schema';
import { or, like, desc } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import type { User } from '$sailor/generated/types';

export const load: PageServerLoad = async ({ locals, url }) => {
  // Check permission to view users
  if (!(await locals.security.hasPermission('read', 'users'))) {
    throw error(403, 'Access denied: You do not have permission to view users');
  }

  const searchQuery = url.searchParams.get('search') || '';

  try {
    // Build query with optional search filter
    let query = db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        created_at: users.created_at,
        updated_at: users.updated_at
      })
      .from(users);

    // Apply search filter if provided
    if (searchQuery) {
      query = query.where(
        or(like(users.name, `%${searchQuery}%`), like(users.email, `%${searchQuery}%`))
      );
    }

    // Order by created date
    const userResults = await query.orderBy(desc(users.created_at));

    return {
      users: userResults as User[],
      searchQuery
    };
  } catch (error) {
    log.error('Failed to load users', {}, error as Error);
    return {
      users: [] as User[],
      searchQuery
    };
  }
};
