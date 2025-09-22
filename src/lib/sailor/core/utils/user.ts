import { toast } from '$sailor/core/ui/toast';

/**
 * Get the appropriate color classes for a user role badge
 */
export const getRoleColor = (role: string) => {
  switch (role) {
    case 'admin':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
    case 'editor':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
    case 'viewer':
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
    default:
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300';
  }
};

/**
 * Copy user ID to clipboard with toast feedback
 */
export async function copyUserId(userId: string) {
  if (userId) {
    try {
      await navigator.clipboard.writeText(userId);
      toast.success('User ID copied to clipboard');
    } catch {
      toast.error('Failed to copy User ID');
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
