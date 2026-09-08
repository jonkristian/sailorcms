import { toast } from 'sailorcms/core/ui/toast';
import { m } from '$sailor/i18n';

/**
 * Colour classes for a user role badge.
 *
 * Amber for `admin` rather than red: red reads as danger or error, and an
 * account having full access is neither — it is the state you would expect the
 * owner's account to be in. Amber says "elevated, look twice" without implying
 * something is wrong.
 *
 * The seeded roles are `admin`, `editor` and `viewer`; anything else is a
 * custom role and gets the neutral fallback.
 */
export const getRoleColor = (role: string) => {
  switch (role) {
    case 'admin':
      return 'bg-amber-100 text-amber-900 dark:bg-amber-900/60 dark:text-amber-200';
    case 'editor':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
    case 'author':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
    case 'viewer':
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
  }
};

/**
 * Copy user ID to clipboard with toast feedback
 */
export async function copyUserId(userId: string) {
  if (userId) {
    try {
      await navigator.clipboard.writeText(userId);
      toast.success(m.toast_user_id_copied());
    } catch {
      toast.error(m.toast_user_id_copy_failed());
    }
  }
}

/**
 * Shorten a user ID for display purposes
 */
export function shortenUserId(userId: string) {
  if (!userId) return 'N/A';
  if (userId.length <= 12) return userId;
  return `${userId.slice(0, 8)}...${userId.slice(-4)}`;
}
