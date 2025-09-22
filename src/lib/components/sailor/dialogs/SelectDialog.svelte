<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Select from '$lib/components/ui/select/index.js';
  import { Button } from '$lib/components/ui/button';

  export interface SelectItem {
    label: string;
    value: string;
    description?: string;
  }

  let {
    open = $bindable(false),
    title = 'Select',
    description = '',
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    items = [] as SelectItem[],
    selected = $bindable('' as string),
    onConfirm
  } = $props<{
    open: boolean;
    title?: string;
    description?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    items: SelectItem[];
    selected?: string;
    onConfirm?: (value: string) => void;
  }>();

  function handleConfirm() {
    if (!selected) return;
    onConfirm?.(selected);
    open = false;
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-[425px]">
    <Dialog.Header>
      <Dialog.Title>{title}</Dialog.Title>
      {#if description}
        <Dialog.Description>{description}</Dialog.Description>
      {/if}
    </Dialog.Header>

    <div class="space-y-3 py-2">
      <Select.Root type="single" value={selected} onValueChange={(v) => (selected = v)}>
        <Select.Trigger class="h-9 w-full"
          >{selected
            ? items.find((item: SelectItem) => item.value === selected)?.label
            : 'Select...'}</Select.Trigger
        >
        <Select.Content>
          {#each items as item (item.value)}
            <Select.Item value={item.value}>{item.label}</Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </div>

    <Dialog.Footer>
      <Button variant="ghost" onclick={() => (open = false)}>{cancelLabel}</Button>
      <Button onclick={handleConfirm} disabled={!selected}>{confirmLabel}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
