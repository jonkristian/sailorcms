import { toast } from '$sailor/core/ui/toast';
import { invalidateAll } from '$app/navigation';

interface BulkDeleteOptions {
  endpoint?: string;
  customDeleteHandler?: (ids: string[]) => Promise<void>;
  itemType: string;
  onSuccess?: (deletedCount: number) => void;
  onError?: (error: string) => void;
}

/**
 * Composable for managing bulk delete operations with confirmation dialog
 */
export function useBulkDelete(options: BulkDeleteOptions) {
  let deleteDialogOpen = $state(false);
  let deleteDialogLoading = $state(false);
  let pendingDeleteItems = $state<{ ids: string[]; count: number }>({ ids: [], count: 0 });

  function initiateBulkDelete(selectedIds: string[]) {
    if (selectedIds.length === 0) return;
    pendingDeleteItems = { ids: selectedIds, count: selectedIds.length };
    deleteDialogOpen = true;
  }

  async function executeBulkDelete() {
    deleteDialogLoading = true;
    try {
      const count = pendingDeleteItems.count;

      if (options.customDeleteHandler) {
        // Use custom delete handler
        await options.customDeleteHandler(pendingDeleteItems.ids);
      } else if (options.endpoint) {
        // Use endpoint-based deletion
        const response = await fetch(options.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: pendingDeleteItems.ids })
        });

        if (!response.ok) {
          const result = await response.json();
          throw new Error(result.error || `Failed to delete ${options.itemType}s`);
        }
      } else {
        throw new Error('Either endpoint or customDeleteHandler must be provided');
      }

      const message = `${count} ${options.itemType}${count === 1 ? '' : 's'} deleted successfully`;
      toast.success(message);

      await invalidateAll();
      deleteDialogOpen = false;

      options.onSuccess?.(count);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : `Failed to delete ${options.itemType}s`;
      toast.error(errorMessage);
      options.onError?.(errorMessage);
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
