<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { AlertTriangle } from '@lucide/svelte';

  let {
    open = $bindable(),
    itemCount = 1,
    itemType = 'item',
    itemName = '',
    onConfirm,
    onCancel = () => {},
    isLoading = false
  }: {
    open?: boolean;
    itemCount?: number;
    itemType?: string;
    itemName?: string;
    onConfirm: () => void | Promise<void>;
    onCancel?: () => void;
    isLoading?: boolean;
  } = $props();

  async function handleConfirm() {
    await onConfirm();
  }

  function handleCancel() {
    if (isLoading) return;
    onCancel();
  }
</script>

<Dialog.Root bind:open onOpenChange={(newOpen) => !newOpen && handleCancel()}>
  <Dialog.Content class="max-w-md">
    <Dialog.Header>
      <div class="flex items-center gap-3">
        <div class="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
          <AlertTriangle class="h-6 w-6 text-red-600" />
        </div>
        <div>
          <Dialog.Title class="text-left">
            Delete {itemCount === 1 ? itemType : `${itemCount} ${itemType}s`}
          </Dialog.Title>
          <Dialog.Description class="text-left">This action cannot be undone.</Dialog.Description>
        </div>
      </div>
    </Dialog.Header>

    <div class="py-4">
      {#if itemCount === 1}
        <p class="text-sm">
          Are you sure you want to delete this {itemType}?
          {#if itemName}
            <span class="font-medium">"{itemName}"</span> will be permanently removed.
          {:else}
            This {itemType} will be permanently removed.
          {/if}
        </p>
      {:else}
        <p class="text-sm">
          Are you sure you want to delete these <span class="font-medium"
            >{itemCount} {itemType}s</span
          >? This action cannot be undone and will permanently remove all selected items.
        </p>
      {/if}
    </div>

    <Dialog.Footer class="flex gap-3">
      <Button variant="outline" onclick={handleCancel} disabled={isLoading}>Cancel</Button>
      <Button variant="destructive" onclick={handleConfirm} disabled={isLoading}>
        {#if isLoading}
          <div
            class="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          ></div>
        {/if}
        Delete {itemCount === 1 ? itemType : `${itemCount} ${itemType}s`}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
