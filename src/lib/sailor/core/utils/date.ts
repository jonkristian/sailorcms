/**
 * Date utility functions for consistent date handling across the CMS.
 *
 * Locale resolution: every formatter accepts an optional `locale` (BCP-47 string).
 * Callers in the admin UI should pass `page.data.user?.preferences?.date_format`
 * via {@link getUserLocale} so per-user date format preferences are honoured.
 * When omitted, helpers fall back to {@link DEFAULT_LOCALE}.
 */

import { DEFAULT_PREFERENCES } from './user-preferences';

export const DEFAULT_LOCALE = DEFAULT_PREFERENCES.date_format ?? 'en-US';

// `'auto'` is a sentinel meaning "use the host environment's default" — it's
// not a valid BCP-47 tag, so passing it to Intl.* throws RangeError. Convert
// to `undefined`, which Intl interprets as "use the default locale".
function intlLocale(locale: string | undefined): string | undefined {
  return !locale || locale === 'auto' ? undefined : locale;
}

/**
 * Format a date string or Date object to a readable format.
 * @param date - ISO string, Date object, or null/undefined
 * @param locale - BCP-47 locale (e.g. 'en-US', 'nb-NO'). Defaults to {@link DEFAULT_LOCALE}.
 * @param options - Intl.DateTimeFormatOptions for customization
 */
export function formatDate(
  date: string | Date | null | undefined,
  locale: string = DEFAULT_LOCALE,
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

    return dateObj.toLocaleDateString(intlLocale(locale), options);
  } catch (error) {
    console.warn('Error formatting date:', error);
    return '-';
  }
}

/** Short date format (used in tables / list rows). */
export function formatTableDate(
  date: string | Date | null | undefined,
  locale: string = DEFAULT_LOCALE
): string {
  return formatDate(date, locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

/** Long date + time (forms, detail views, audit lines). */
export function formatDetailedDate(
  date: string | Date | null | undefined,
  locale: string = DEFAULT_LOCALE
): string {
  return formatDate(date, locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/** Locale-aware "5/1/2026, 12:11:14 PM"-style timestamp. */
export function formatTimestamp(
  date: string | Date | null | undefined,
  locale: string = DEFAULT_LOCALE
): string {
  if (!date) return '-';
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(dateObj.getTime())) return '-';
    return dateObj.toLocaleString(intlLocale(locale));
  } catch (error) {
    console.warn('Error formatting timestamp:', error);
    return '-';
  }
}

/**
 * Format a date for relative time display (e.g., "2 hours ago").
 * Uses `Intl.RelativeTimeFormat` so the short/long forms localise correctly.
 * Falls back to {@link formatDate} once the gap exceeds a week.
 */
export function formatRelativeTime(
  date: string | Date | null | undefined,
  locale: string = DEFAULT_LOCALE
): string {
  if (!date) return '-';

  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(dateObj.getTime())) return '-';

    const diffInSeconds = Math.floor((Date.now() - dateObj.getTime()) / 1000);
    const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: 'auto' });

    if (diffInSeconds < 60) return rtf.format(0, 'second');
    if (diffInSeconds < 3600) return rtf.format(-Math.floor(diffInSeconds / 60), 'minute');
    if (diffInSeconds < 86400) return rtf.format(-Math.floor(diffInSeconds / 3600), 'hour');
    if (diffInSeconds < 604800) return rtf.format(-Math.floor(diffInSeconds / 86400), 'day');

    // For older dates, defer to the absolute-date formatter.
    return formatDate(date, locale);
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
