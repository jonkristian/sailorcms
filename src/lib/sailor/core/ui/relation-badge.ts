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
/** `field key -> item id -> count`. */
export type RelationCounts = Map<string, Map<string, number>>;

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

/**
 * Counts for a whole list, rolled up through `parent_id`.
 *
 * A category with no edges of its own still contains everything its children
 * do, so a direct count reads "0 products" for a category holding thirty — and
 * in the table, where rows start collapsed, that 0 is the only thing on screen.
 *
 * Rolls up by union of ids rather than by summing counts, so an entry filed
 * under two sibling categories is counted once. Summing would look right on any
 * data where nothing is cross-filed and quietly overcount everywhere else.
 *
 * A flat list has no `parent_id`, so every count is simply its own.
 */
export function relationCounts(
  items: any[] | undefined,
  fields: Record<string, any> | undefined
): RelationCounts {
  const result: RelationCounts = new Map();
  const keys = relationBadgeFields(fields).map((field) => field.key);
  if (keys.length === 0 || !items?.length) return result;

  const childrenOf = new Map<string, any[]>();
  for (const item of items) {
    const parent = item?.parent_id;
    if (!parent) continue;
    const siblings = childrenOf.get(parent) ?? [];
    siblings.push(item);
    childrenOf.set(parent, siblings);
  }

  for (const key of keys) {
    const counts = new Map<string, number>();
    // `seen` guards a corrupted parent chain; without it a cycle recurses until
    // the stack gives out, and `doctor` exists because that state is reachable.
    const collect = (item: any, seen: Set<string>): Set<string> => {
      const ids = new Set<string>();
      if (!item?.id || seen.has(item.id)) return ids;
      seen.add(item.id);
      for (const row of Array.isArray(item[key]) ? item[key] : []) {
        const id = row && typeof row === 'object' ? row.id : row;
        if (id) ids.add(id);
      }
      for (const child of childrenOf.get(item.id) ?? []) {
        for (const id of collect(child, seen)) ids.add(id);
      }
      counts.set(item.id, ids.size);
      return ids;
    };
    for (const item of items) collect(item, new Set());
    result.set(key, counts);
  }
  return result;
}

/**
 * Non-zero counts for one row. Empty relations are omitted rather than shown
 * as 0.
 *
 * Pass the `counts` from {@link relationCounts} to get the rolled-up figure;
 * without it the badge shows only what is attached to this row directly.
 */
export function relationBadges(
  item: any,
  fields: Record<string, any> | undefined,
  counts?: RelationCounts
): RelationBadge[] {
  return relationBadgeFields(fields)
    .map(({ key, label }) => ({
      label,
      count: counts?.get(key)?.get(item?.id) ?? (Array.isArray(item?.[key]) ? item[key].length : 0)
    }))
    .filter((badge) => badge.count > 0);
}
