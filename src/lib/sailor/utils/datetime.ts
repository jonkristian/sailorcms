/**
 * Simple date utilities for Sailor CMS
 */

/**
 * Format a date using native Intl.DateTimeFormat
 *
 * @example
 * ```typescript
 * formatDate(new Date(), 'medium'); // "Dec 31, 2023"
 * formatDate(post.published_at, 'short'); // "12/31/2023"
 * formatDate(post.published_at, 'medium', 'nb-NO'); // "31. des. 2023"
 * ```
 */
export function formatDate(
  date: string | Date | null | undefined,
  format: 'short' | 'medium' | 'long' = 'medium',
  locale: string = 'en-US'
): string {
  if (!date) return '';

  const parsedDate = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(parsedDate.getTime())) {
    return '';
  }

  // Use native Intl.DateTimeFormat with dateStyle for cleaner code
  return new Intl.DateTimeFormat(locale, {
    dateStyle: format
  }).format(parsedDate);
}

/**
 * Get relative time (e.g., "2 hours ago") using native Intl.RelativeTimeFormat
 *
 * @example
 * ```typescript
 * timeAgo(post.published_at); // "2 hours ago"
 * timeAgo(post.published_at, 'nb-NO'); // "2 timer siden"
 * ```
 */
export function timeAgo(date: string | Date | null | undefined, locale: string = 'en'): string {
  if (!date) return '';

  const parsedDate = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(parsedDate.getTime())) {
    return '';
  }

  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - parsedDate.getTime()) / 1000);

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  // Handle very recent times
  if (Math.abs(diffInSeconds) < 60) {
    return rtf.format(-diffInSeconds, 'second');
  }

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (Math.abs(diffInMinutes) < 60) {
    return rtf.format(-diffInMinutes, 'minute');
  }

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (Math.abs(diffInHours) < 24) {
    return rtf.format(-diffInHours, 'hour');
  }

  const diffInDays = Math.floor(diffInHours / 24);
  if (Math.abs(diffInDays) < 7) {
    return rtf.format(-diffInDays, 'day');
  }

  if (Math.abs(diffInDays) < 30) {
    const diffInWeeks = Math.floor(diffInDays / 7);
    return rtf.format(-diffInWeeks, 'week');
  }

  if (Math.abs(diffInDays) < 365) {
    const diffInMonths = Math.floor(diffInDays / 30);
    return rtf.format(-diffInMonths, 'month');
  }

  const diffInYears = Math.floor(diffInDays / 365);
  return rtf.format(-diffInYears, 'year');
}

/**
 * Sort items by date field
 *
 * @example
 * ```typescript
 * const sortedPosts = sortByDate(posts, 'published_at', 'desc');
 * ```
 */
export function sortByDate<T>(
  items: T[],
  dateField: keyof T,
  direction: 'asc' | 'desc' = 'desc'
): T[] {
  return [...items].sort((a, b) => {
    const dateA = new Date(a[dateField] as any).getTime();
    const dateB = new Date(b[dateField] as any).getTime();

    return direction === 'asc' ? dateA - dateB : dateB - dateA;
  });
}
