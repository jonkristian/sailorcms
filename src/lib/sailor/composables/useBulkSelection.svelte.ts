import { afterNavigate } from '$app/navigation';

/**
 * Composable for managing bulk selection state and handlers.
 *
 * Pass `resetOnPathnameChange: true` to auto-clear the selection whenever
 * the URL pathname changes — this is what lets `/sailor/collections/[slug]`
 * and similar param-only routes drop their selection on slug change.
 * Without it, SvelteKit reuses the page component across slugs and the
 * previous IDs stay selected against a now-different list. Pagination
 * (query-param-only navigation) leaves the pathname unchanged, so
 * selection survives `?page=N` transitions as expected.
 *
 * ```ts
 * const selection = useBulkSelection(() => items, {
 *   resetOnPathnameChange: true
 * });
 * ```
 */
export function useBulkSelection<T extends { id: string }>(
  itemsOrGetter: T[] | (() => T[]),
  options?: { resetOnPathnameChange?: boolean }
) {
  let selectedItems: string[] = $state([]);

  const items = $derived(typeof itemsOrGetter === 'function' ? itemsOrGetter() : itemsOrGetter);

  if (options?.resetOnPathnameChange) {
    afterNavigate(({ from, to }) => {
      if (from && to && from.url.pathname !== to.url.pathname) {
        selectedItems = [];
      }
    });
  }

  function handleSelect(id: string, selected: boolean) {
    if (selected) {
      selectedItems = [...selectedItems, id];
    } else {
      selectedItems = selectedItems.filter((item) => item !== id);
    }
  }

  function handleSelectAll(selected: boolean) {
    if (selected) {
      selectedItems = items.map((item) => item.id);
    } else {
      selectedItems = [];
    }
  }

  function clearSelection() {
    selectedItems = [];
  }

  function isSelected(id: string) {
    return selectedItems.includes(id);
  }

  return {
    get selectedItems() {
      return selectedItems;
    },
    get selectedCount() {
      return selectedItems.length;
    },
    get totalCount() {
      return items.length;
    },
    handleSelect,
    handleSelectAll,
    clearSelection,
    isSelected
  };
}
