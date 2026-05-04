<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import ArrayField from 'sailorcms/components/sailor/fields/ArrayField.svelte';
  import FieldRenderer from 'sailorcms/components/sailor/fields/FieldRenderer.svelte';
  import { Dialog, DialogContent, DialogHeader, DialogTitle } from '$lib/components/ui/dialog';
  import { toast, toastResult } from '$sailor/core/ui/toast';
  import { m } from '$sailor/i18n';
  import { invalidateAll } from '$app/navigation';
  import {
    updateFlatGlobal,
    updateRepeatableGlobal,
    updateRelationalGlobal
  } from '../data.remote.js';

  const {
    global,
    formData,
    isOpen,
    isNewItem,
    editingItem,
    onClose,
    onFormDataChange
  }: {
    global: any;
    formData: Record<string, any>;
    isOpen: boolean;
    isNewItem: boolean;
    editingItem: any;
    onClose: () => void;
    onFormDataChange?: (key: string, value: any) => void;
  } = $props();

  let saving = $state(false);

  // Handle form submission with remote functions
  async function handleSubmit(event: Event) {
    event.preventDefault();
    saving = true;

    try {
      let result;

      switch (global.dataType) {
        case 'flat':
          result = await updateFlatGlobal({
            globalSlug: global.slug,
            data: formData
          });
          break;
        case 'repeatable':
          result = await updateRepeatableGlobal({
            globalSlug: global.slug,
            itemId: isNewItem ? editingItem.id : editingItem.id,
            data: formData
          });
          break;
        case 'relational':
          result = await updateRelationalGlobal({
            globalSlug: global.slug,
            itemId: isNewItem ? editingItem.id : editingItem.id,
            data: formData
          });
          break;
        default:
          throw new Error('Unknown data type');
      }

      if (
        toastResult(
          result,
          isNewItem ? m.toast_item_created : m.toast_item_saved,
          m.toast_save_item_failed
        )
      ) {
        // Manual invalidation needed because we use "unchecked" command mode
        await invalidateAll();
        onClose();
      }
    } catch (error) {
      toast.error(m.toast_save_item_failed());
    } finally {
      saving = false;
    }
  }

  // Generate form fields based on global definition (exclude hidden fields)
  const getFormFields = (global: any) => {
    return Object.entries(global.fields)
      .filter(([key, field]: [string, any]) => !field.hidden)
      .map(([key, field]: [string, any]) => ({ key, field }));
  };

  let formFields = $derived(getFormFields(global));

  // Handle array field changes
  function handleArrayFieldChange(fieldKey: string, items: any[]) {
    if (onFormDataChange) {
      onFormDataChange(fieldKey, items);
    }
  }

  // Handle field changes
  function handleFieldChange(fieldKey: string, value: any) {
    if (onFormDataChange) {
      onFormDataChange(fieldKey, value);
    }
  }

  // Handle dialog close events
  function handleOpenChange(open: boolean) {
    if (!open) {
      onClose();
    }
  }

  // Get title value for slug generation
  function getTitleValue(fieldKey: string) {
    // Check if this is a slug field and if there's a title field
    if (fieldKey === 'slug' && formData.title) {
      return formData.title;
    }
    return null;
  }
</script>

<Dialog open={isOpen} onOpenChange={handleOpenChange}>
  <DialogContent class="max-h-[90vh] overflow-y-auto sm:max-w-xl">
    <DialogHeader>
      <DialogTitle>
        {isNewItem
          ? m.global_modal_add_title({ label: global.name.singular })
          : m.global_modal_edit_title({ label: global.name.singular })}
      </DialogTitle>
    </DialogHeader>
    <form onsubmit={handleSubmit} class="space-y-6">
      {#each formFields as { key, field }}
        <div class="space-y-2">
          {#if field.type === 'array'}
            <label for={key} class="text-sm font-medium">{field.label}</label>
            <ArrayField
              items={formData[key] || []}
              itemSchema={field.items?.properties || {}}
              onChange={(items) => handleArrayFieldChange(key, items)}
            />
          {:else}
            <FieldRenderer
              {field}
              value={formData[key]}
              fieldKey={key}
              titleValue={getTitleValue(key)}
              currentItemId={editingItem?.id}
              entityType="global_{global.slug}"
              onChange={(value) => handleFieldChange(key, value)}
            />
          {/if}
        </div>
      {/each}

      <div class="flex justify-end gap-2">
        <Button type="button" variant="outline" onclick={onClose}>{m.global_cancel()}</Button>
        <Button type="submit" disabled={saving}>
          {#if saving}
            {m.global_saving()}
          {:else}
            {isNewItem ? m.global_modal_create() : m.global_modal_save()}
          {/if}
        </Button>
      </div>
    </form>
  </DialogContent>
</Dialog>
