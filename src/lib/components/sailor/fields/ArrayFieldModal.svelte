<script lang="ts">
  import { Button } from 'sailorcms/components/ui/button/index.js';
  import * as Dialog from 'sailorcms/components/ui/dialog/index.js';
  import { m } from '$sailor/i18n';

  import FieldRenderer from './FieldRenderer.svelte';

  const {
    isOpen,
    item,
    itemSchema,
    onSave,
    onClose,
    itemIndex
  }: {
    isOpen: boolean;
    item: any;
    itemSchema: any;
    onSave: (updatedItem: any) => void;
    onClose: () => void;
    itemIndex: number;
  } = $props();

  let formData = $derived({ ...(item || {}) });

  // Handle dialog close events
  function handleOpenChange(open: boolean) {
    if (!open) {
      onClose();
    }
  }

  function handleSave() {
    onSave(formData);
    onClose();
  }

  function handleFieldChange(fieldKey: string, value: any) {
    formData = { ...formData, [fieldKey]: value };
  }

  // Generate form fields based on item schema
  let formFields = $derived(
    Object.entries(itemSchema as Record<string, any>).map(([key, field]) => ({
      key,
      field
    }))
  );
</script>

<Dialog.Root open={isOpen} onOpenChange={handleOpenChange}>
  <Dialog.Content class="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
    <Dialog.Header>
      <Dialog.Title>
        {m.array_modal_title({ index: itemIndex + 1 })}
      </Dialog.Title>
      <Dialog.Description>{m.array_modal_description()}</Dialog.Description>
    </Dialog.Header>

    <div class="space-y-6">
      {#each formFields as { key, field }}
        <FieldRenderer
          {field}
          value={formData[key]}
          onChange={(value) => handleFieldChange(key, value)}
          fieldKey={key}
        />
      {/each}
    </div>

    <Dialog.Footer>
      <Button type="button" variant="outline" onclick={onClose}>{m.array_modal_cancel()}</Button>
      <Button type="button" onclick={handleSave}>{m.array_modal_save()}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
