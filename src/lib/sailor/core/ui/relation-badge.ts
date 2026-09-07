/**
 * Relation counts for admin list rows — the small "16" beside a title, and the
 * count column in the table view.
 *
 * Both many-to-many and `reverse` fields qualify. A single-FK relation does not:
 * its value is one id, not a list, so a count of it is either 0 or 1 and says
 * nothing. The list loaders already attach these values
 * (`loadJunctionValuesForOwners`, `loadReverseRelationsForOwners`), so counting
 * them costs no extra query.
 *
 * Reverse fields are the case this matters most for — "how many products are in
 * this category" is the question the list is asked, and it is the one thing the
 * owning side cannot answer about itself.
 */

export type RelationBadgeField = { key: string; label: string };
export type RelationBadge = { label: string; count: number };

/**
 * Fields whose attached value is a countable relation array.
 *
 * Shared so the tree's badges and the table's count column cannot disagree
 * about what counts — they did, and a single-FK relation rendered a meaningless
 * `0` in one and nothing in the other.
 */
export function relationBadgeFields(fields: Record<string, any> | undefined): RelationBadgeField[] {
  return Object.entries(fields ?? {})
    .filter(
      ([, field]: [string, any]) =>
        (field?.type === 'relation' && field?.relation?.type === 'many-to-many') ||
        field?.type === 'reverse'
    )
    .map(([key, field]: [string, any]) => ({ key, label: field?.label || field?.title || key }));
}

/** Non-zero counts for one row. Empty relations are omitted rather than shown as 0. */
export function relationBadges(
  item: any,
  fields: Record<string, any> | undefined
): RelationBadge[] {
  return relationBadgeFields(fields)
    .map(({ key, label }) => ({
      label,
      count: Array.isArray(item?.[key]) ? item[key].length : 0
    }))
    .filter((badge) => badge.count > 0);
}
