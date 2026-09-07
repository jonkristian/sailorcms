export type RelationItem = { id: string; title: string };

/**
 * Selection state shared by every many-to-many relation UI.
 *
 * The bound `value` is the single source of truth for membership and order —
 * there is no mirrored copy to keep in sync, so no `$effect`. Titles are a
 * separate lookup, because `onChange` emits bare ids: after the first edit the
 * value no longer carries them.
 *
 * That split is what makes the titles safe. An earlier version kept an
 * authoritative copy of the items and resynced it from `value`, which meant any
 * code path that re-derived from `value` silently renamed every entry to a raw
 * id. Deriving instead removes the failure mode rather than guarding it.
 *
 * Order is meaningful: it is persisted to the junction's `sort`.
 */
export function useRelationSelection(options: {
  /** The bound field value — objects on first load, bare ids after an edit. */
  value: () => string | string[];
  onChange: (ids: string[]) => void;
}) {
  // Populated from the candidate fetch. Reassigned rather than mutated so the
  // derived list below re-runs.
  let titles = $state<Record<string, string>>({});

  /** A bound value entry is an id before the picker has resolved it, an object after. */
  type ValueEntry = string | Partial<RelationItem>;

  const items = $derived(
    (Array.isArray(options.value()) ? (options.value() as ValueEntry[]) : []).map((entry) =>
      entry && typeof entry === 'object'
        ? { id: entry.id ?? '', title: entry.title ?? titles[entry.id ?? ''] ?? entry.id ?? '' }
        : { id: entry, title: titles[entry] ?? entry }
    )
  );

  function commit(next: RelationItem[]) {
    const nextIds = next.map((item) => item.id);
    const prevIds = items.map((item) => item.id);
    const changed = nextIds.length !== prevIds.length || nextIds.some((id, i) => id !== prevIds[i]);
    if (!changed) return;

    // The point where titles are lost, so the point where they are banked: on
    // first load the bound value is objects carrying titles, but `onChange`
    // emits bare ids, and from then on the only titles left are the ones in
    // this lookup. Without this, every attached entry the picker has not
    // happened to fetch — anything past the first page of candidates — falls
    // back to displaying its raw id after the first edit.
    const banked = { ...titles };
    for (const item of next) {
      if (item.title && item.title !== item.id) banked[item.id] = item.title;
    }
    titles = banked;

    options.onChange(nextIds);
  }

  return {
    get items() {
      return items;
    },
    /** Feed in titles learned from a candidate fetch. */
    learnTitles(known: Array<{ id: string; title: string }>) {
      const next = { ...titles };
      for (const item of known) next[item.id] = item.title;
      titles = next;
    },
    has: (id: string) => items.some((item) => item.id === id),
    remove: (id: string) => commit(items.filter((item) => item.id !== id)),
    toggle: (item: RelationItem) =>
      commit(
        items.some((existing) => existing.id === item.id)
          ? items.filter((existing) => existing.id !== item.id)
          : [...items, item]
      ),
    reorder: (next: RelationItem[]) => commit(next)
  };
}
