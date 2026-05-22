/**
 * Shared helpers used by both `collections.ts` and `globals.ts`. Internal —
 * not re-exported through `utils/data/index.ts`.
 */

/**
 * Coerce a stored timestamp into a `Date`. Tolerates:
 *  - Date instances (passed through)
 *  - ISO strings
 *  - Numbers — distinguishes seconds vs. milliseconds by magnitude
 *    (`> 10000000000` ≈ Sat Nov 20 2286 in seconds, so anything larger is
 *    treated as ms — covers both legacy second-precision rows and Drizzle's
 *    millisecond-mode timestamps).
 * Falls back to `new Date()` rather than throwing, so a corrupt row doesn't
 * break a list render.
 */
export function parseDate(dateValue: unknown): Date {
  if (!dateValue) return new Date();
  if (dateValue instanceof Date) return dateValue;
  if (typeof dateValue === 'string') {
    const isoDate = new Date(dateValue);
    if (!isNaN(isoDate.getTime())) return isoDate;
  }
  if (typeof dateValue === 'number') {
    const timestamp = dateValue > 10000000000 ? dateValue : dateValue * 1000;
    return new Date(timestamp);
  }
  return new Date();
}

/**
 * Bucket items by the value at `fieldName`. If the value is an array (e.g. a
 * `type: 'tags'` field), the item appears in every bucket named by the tag's
 * `name` / `title` / string form. Otherwise the value is stringified into a
 * single bucket key.
 */
export function groupItemsByField<T>(items: T[], fieldName: string): Record<string, T[]> {
  return items.reduce(
    (groups, item) => {
      const value = (item as any)[fieldName];

      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          const tagNames = value.map((tag) =>
            typeof tag === 'string' ? tag : tag.name || tag.title || String(tag)
          );

          tagNames.forEach((tagName) => {
            if (!groups[tagName]) {
              groups[tagName] = [];
            }
            groups[tagName].push(item);
          });
        } else {
          const key = typeof value === 'string' ? value : String(value);
          if (!groups[key]) {
            groups[key] = [];
          }
          groups[key].push(item);
        }
      }

      return groups;
    },
    {} as Record<string, T[]>
  );
}
