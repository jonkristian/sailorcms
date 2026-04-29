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
    isLoading = false,
    // When false (default): items are soft-deleted and can be restored from
    // /sailor/recovery. When true: this is the recovery purge — irreversible.
    permanent = false
  }: {
    open?: boolean;
    itemCount?: number;
    itemType?: string;
    itemName?: string;
    onConfirm: () => void | Promise<void>;
    onCancel?: () => void;
    isLoading?: boolean;
    permanent?: boolean;
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
  <Dialog.Content>
    <Dialog.Header>
      <div class="flex items-center gap-3">
        <div class="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
          <AlertTriangle class="h-6 w-6 text-red-600" />
        </div>
        <div>
          <Dialog.Title class="text-left">
            {permanent ? 'Permanently delete' : 'Delete'}
            {itemCount === 1 ? itemType : `${itemCount} ${itemType}s`}
          </Dialog.Title>
          <Dialog.Description class="text-left">
            {permanent ? 'This action cannot be undone.' : 'You can restore from Recovery.'}
          </Dialog.Description>
        </div>
      </div>
    </Dialog.Header>

    <div class="py-4">
      {#if itemCount === 1}
        <p class="text-sm">
          {#if permanent}
            Permanently delete this {itemType}?
            {#if itemName}<span class="font-medium">"{itemName}"</span>{/if}
            This cannot be undone.
          {:else}
            Delete this {itemType}?
            {#if itemName}<span class="font-medium">"{itemName}"</span>{/if}
            It will be moved to Recovery, where you can restore or permanently delete it.
          {/if}
        </p>
      {:else if permanent}
        <p class="text-sm">
          Permanently delete these <span class="font-medium">{itemCount} {itemType}s</span>? This
          cannot be undone.
        </p>
      {:else}
        <p class="text-sm">
          Delete these <span class="font-medium">{itemCount} {itemType}s</span>? They will be moved
          to Recovery, where you can restore or permanently delete them.
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
        {permanent ? 'Permanently delete' : 'Delete'}
        {itemCount === 1 ? itemType : `${itemCount} ${itemType}s`}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
