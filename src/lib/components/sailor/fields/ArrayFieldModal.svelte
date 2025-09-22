<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import * as Dialog from '$lib/components/ui/dialog';

  import FieldRenderer from './FieldRenderer.svelte';

  const { isOpen, item, itemSchema, onSave, onClose, itemIndex } = $props<{
    isOpen: boolean;
    item: any;
    itemSchema: any;
    onSave: (updatedItem: any) => void;
    onClose: () => void;
    itemIndex: number;
  }>();

  let formData = $state({ ...item });

  // Update formData when item changes
  $effect(() => {
    if (item) {
      formData = { ...item };
    }
  });

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
  const formFields = Object.entries(itemSchema as Record<string, any>).map(([key, field]) => ({
    key,
    field
  }));
</script>

<Dialog.Root open={isOpen} onOpenChange={handleOpenChange}>
  <Dialog.Content class="max-h-[90vh] max-w-2xl overflow-y-auto">
    <Dialog.Header>
      <Dialog.Title>
        Edit Item {itemIndex + 1}
      </Dialog.Title>
      <Dialog.Description>Update the details for this item</Dialog.Description>
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
      <Button type="button" variant="outline" onclick={onClose}>Cancel</Button>
      <Button type="button" onclick={handleSave}>Save</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
