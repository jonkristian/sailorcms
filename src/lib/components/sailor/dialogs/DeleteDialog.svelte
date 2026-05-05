<script lang="ts">
  import * as Dialog from 'sailorcms/components/ui/dialog/index.js';
  import { Button } from 'sailorcms/components/ui/button/index.js';
  import { AlertTriangle } from '@lucide/svelte';
  import { m } from '$sailor/i18n';

  let {
    open = $bindable(),
    itemCount = 1,
    labels = { singular: 'item', plural: 'items' },
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
    labels?: { singular: string; plural: string };
    itemName?: string;
    onConfirm: () => void | Promise<void>;
    onCancel?: () => void;
    isLoading?: boolean;
    permanent?: boolean;
  } = $props();

  const titleText = $derived.by(() => {
    if (itemCount === 1) {
      return permanent
        ? m.delete_dialog_title_one_permanent({ item: labels.singular })
        : m.delete_dialog_title_one({ item: labels.singular });
    }
    return permanent
      ? m.delete_dialog_title_many_permanent({ count: itemCount, items: labels.plural })
      : m.delete_dialog_title_many({ count: itemCount, items: labels.plural });
  });

  const bodyText = $derived.by(() => {
    if (itemCount === 1) {
      if (itemName) {
        return permanent
          ? m.delete_dialog_body_one_named_permanent({ name: itemName })
          : m.delete_dialog_body_one_named_soft({ name: itemName });
      }
      return permanent
        ? m.delete_dialog_body_one_permanent({ item: labels.singular })
        : m.delete_dialog_body_one_soft({ item: labels.singular });
    }
    return permanent
      ? m.delete_dialog_body_many_permanent({ count: itemCount, items: labels.plural })
      : m.delete_dialog_body_many_soft({ count: itemCount, items: labels.plural });
  });

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
          <Dialog.Title class="text-left">{titleText}</Dialog.Title>
          <Dialog.Description class="text-left">
            {permanent
              ? m.delete_dialog_description_permanent()
              : m.delete_dialog_description_soft()}
          </Dialog.Description>
        </div>
      </div>
    </Dialog.Header>

    <div class="py-4">
      <p class="text-sm">{bodyText}</p>
    </div>

    <Dialog.Footer class="flex gap-3">
      <Button variant="outline" onclick={handleCancel} disabled={isLoading}>
        {m.common_cancel()}
      </Button>
      <Button variant="destructive" onclick={handleConfirm} disabled={isLoading}>
        {#if isLoading}
          <div
            class="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          ></div>
        {/if}
        {titleText}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
