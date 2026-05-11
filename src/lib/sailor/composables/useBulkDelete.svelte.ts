import { invalidateAll } from '$app/navigation';

interface BulkDeleteOptions {
  customDeleteHandler: (ids: string[]) => Promise<void>;
  onSuccess?: (deletedCount: number) => void;
}

/**
 * Composable for managing bulk delete operations with confirmation dialog.
 * The caller's `customDeleteHandler` owns its own toasts and error handling.
 */
export function useBulkDelete(options: BulkDeleteOptions) {
  let deleteDialogOpen = $state(false);
  let deleteDialogLoading = $state(false);
  let pendingDeleteItems: { ids: string[]; count: number } = $state({ ids: [], count: 0 });

  function initiateBulkDelete(selectedIds: string[]) {
    if (selectedIds.length === 0) return;
    pendingDeleteItems = { ids: selectedIds, count: selectedIds.length };
    deleteDialogOpen = true;
  }

  async function executeBulkDelete() {
    deleteDialogLoading = true;
    try {
      const count = pendingDeleteItems.count;
      await options.customDeleteHandler(pendingDeleteItems.ids);
      await invalidateAll();
      deleteDialogOpen = false;
      options.onSuccess?.(count);
    } finally {
      deleteDialogLoading = false;
    }
  }

  function cancelDelete() {
    deleteDialogOpen = false;
    pendingDeleteItems = { ids: [], count: 0 };
  }

  return {
    get deleteDialogOpen() {
      return deleteDialogOpen;
    },
    set deleteDialogOpen(value: boolean) {
      deleteDialogOpen = value;
    },
    get deleteDialogLoading() {
      return deleteDialogLoading;
    },
    get pendingDeleteItems() {
      return pendingDeleteItems;
    },
    initiateBulkDelete,
    executeBulkDelete,
    cancelDelete
  };
}
