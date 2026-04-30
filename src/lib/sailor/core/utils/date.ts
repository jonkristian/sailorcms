/**
 * Date utility functions for consistent date handling across the CMS
 */

/**
 * Format a date string or Date object to a readable format
 * @param date - ISO string, Date object, or null/undefined
 * @param options - Intl.DateTimeFormatOptions for customization
 * @returns Formatted date string or fallback text
 */
export function formatDate(
  date: string | Date | null | undefined,
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }
): string {
  if (!date) return '-';

  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;

    // Check if the date is valid
    if (isNaN(dateObj.getTime())) {
      return '-';
    }

    return dateObj.toLocaleDateString('en-US', options);
  } catch (error) {
    console.warn('Error formatting date:', error);
    return '-';
  }
}

/**
 * Format a date for display in tables (short format)
 * @param date - ISO string, Date object, or null/undefined
 * @returns Short formatted date string
 */
export function formatTableDate(date: string | Date | null | undefined): string {
  return formatDate(date, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

/**
 * Format a date for display in forms or detailed views
 * @param date - ISO string, Date object, or null/undefined
 * @returns Detailed formatted date string
 */
export function formatDetailedDate(date: string | Date | null | undefined): string {
  return formatDate(date, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Format a date for relative time display (e.g., "2 hours ago")
 * @param date - ISO string, Date object, or null/undefined
 * @returns Relative time string
 */
export function formatRelativeTime(date: string | Date | null | undefined): string {
  if (!date) return '-';

  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;

    if (isNaN(dateObj.getTime())) {
      return '-';
    }

    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - dateObj.getTime()) / 1000);

    if (diffInSeconds < 60) {
      return 'Just now';
    }

    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) {
      return `${diffInMinutes} minute${diffInMinutes !== 1 ? 's' : ''} ago`;
    }

    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) {
      return `${diffInHours} hour${diffInHours !== 1 ? 's' : ''} ago`;
    }

    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) {
      return `${diffInDays} day${diffInDays !== 1 ? 's' : ''} ago`;
    }

    // For older dates, use the standard format
    return formatDate(date);
  } catch (error) {
    console.warn('Error formatting relative time:', error);
    return '-';
  }
}

/**
 * Check if a date string is valid
 * @param date - Date string to validate
 * @returns True if the date is valid
 */
export function isValidDate(date: string | null | undefined): boolean {
  if (!date) return false;

  try {
    const dateObj = new Date(date);
    return !isNaN(dateObj.getTime());
  } catch {
    return false;
  }
}

/**
 * Get current date as ISO string
 * @returns Current date in ISO format
 */
export function getCurrentDateISO(): string {
  return new Date().toISOString();
}

/**
 * Get current timestamp as Date object.
 *
 * Use this for **typed Drizzle** inserts/updates: `db.insert(t).values({ updated_at: getCurrentTimestamp() })`.
 * Drizzle knows the column's `mode` and converts to seconds (`mode: 'timestamp'`)
 * or milliseconds (`mode: 'timestamp_ms'`) automatically.
 *
 * Do NOT use inside raw `sql` template parameters — drizzle has no column
 * knowledge there, so the driver binds the Date as milliseconds. If the
 * column is `mode: 'timestamp'` (seconds, the default in this codebase),
 * the read path multiplies by 1000 and the date jumps far into the future.
 * Use {@link getCurrentTimestampSeconds} for raw SQL.
 */
export function getCurrentTimestamp(): Date {
  return new Date();
}

/**
 * Get current timestamp as Unix seconds (integer).
 *
 * Use this for **raw `sql` template parameters** writing to columns declared
 * as `integer({ mode: 'timestamp' })`. Drizzle binds plain numbers verbatim,
 * so this matches what the read path expects (it multiplies by 1000 to
 * reconstruct a Date).
 */
export function getCurrentTimestampSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
