/**
 * Authentication and authorization utility functions
 */

import type { User } from './acl';

/**
 * Check if user has admin role
 */
export function isAdmin(user: User | null | undefined): boolean {
  return user?.role === 'admin';
}

/**
 * Check if user has editor role or higher (editor, admin)
 */
export function isEditor(user: User | null | undefined): boolean {
  return user?.role === 'editor' || isAdmin(user);
}

/**
 * Check if user can access private content (is the author or is admin)
 */
export function canAccessPrivateContent(user: User | null | undefined, authorId: string): boolean {
  return isAdmin(user) || user?.id === authorId;
}

/**
 * Build access control conditions for collection queries
 * Allows access to all content for admins, or only public + user's private content for regular users
 */
export function buildAccessControlConditions(user: User | null | undefined, tableRef: any) {
  if (isAdmin(user)) {
    // Admins can see everything
    return undefined;
  }

  // Regular users can see public content + their own private content
  const { eq, or, and } = require('drizzle-orm');

  return or(
    eq(tableRef.status, 'published'),
    eq(tableRef.status, 'draft'),
    eq(tableRef.status, 'archived'),
    and(eq(tableRef.status, 'private'), eq(tableRef.author, user?.id || ''))
  );
}
