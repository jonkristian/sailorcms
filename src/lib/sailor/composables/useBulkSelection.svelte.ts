/**
 * Composable for managing bulk selection state and handlers
 */
export function useBulkSelection<T extends { id: string }>(itemsOrGetter: T[] | (() => T[])) {
  let selectedItems = $state<string[]>([]);

  const items = $derived(typeof itemsOrGetter === 'function' ? itemsOrGetter() : itemsOrGetter);

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
