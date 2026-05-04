<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Label } from '$lib/components/ui/label';
  import ArrayField from 'sailorcms/components/sailor/fields/ArrayField.svelte';
  import FieldRenderer from 'sailorcms/components/sailor/fields/FieldRenderer.svelte';
  import { toast, toastResult, requirePermission } from '$sailor/core/ui/toast';
  import { m } from '$sailor/i18n';
  import { invalidateAll } from '$app/navigation';
  import { updateFlatGlobal } from '../data.remote.js';

  const {
    global,
    formData = $bindable(),
    permissions
  }: {
    global: any;
    formData: Record<string, any>;
    submitting: boolean;
    permissions: {
      globals: {
        create: boolean;
        update: boolean;
        delete: boolean;
        view: boolean;
      };
    };
  } = $props();

  let submitting = $state(false);

  // Use permissions passed from layout
  let canUpdate = $derived(permissions.globals.update);

  // Generate form fields based on global definition
  const getFormFields = (global: any) => {
    return Object.entries(global.fields).map(([key, field]: [string, any]) => ({ key, field }));
  };

  let formFields = $derived(getFormFields(global));

  // Handle array field changes
  function handleArrayFieldChange(fieldKey: string, items: any[]) {
    formData[fieldKey] = items;
  }

  // Handle form submission
  async function handleSubmit(event: Event) {
    event.preventDefault();

    if (!requirePermission(canUpdate, m.toast_perm_update_global)) return;

    submitting = true;

    try {
      const result = await updateFlatGlobal({
        globalSlug: global.slug,
        data: formData
      });

      if (toastResult(result, m.toast_global_settings_saved, m.toast_save_global_settings_failed)) {
        // Manual invalidation needed because we use "unchecked" command mode
        await invalidateAll();
      }
    } catch (error) {
      toast.error(m.toast_save_global_settings_failed());
    } finally {
      submitting = false;
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

<div class="max-w-2xl">
  <form onsubmit={handleSubmit} class="space-y-6">
    {#each formFields as { key, field }}
      {#if field.type === 'array'}
        <div class="space-y-2">
          <Label for={key}>{field.label}</Label>
          <ArrayField
            items={formData[key] || []}
            itemSchema={field.items?.properties || {}}
            onChange={(items) => handleArrayFieldChange(key, items)}
          />
        </div>
      {:else}
        <FieldRenderer
          {field}
          value={formData[key]}
          fieldKey={key}
          titleValue={getTitleValue(key)}
          currentItemId={null}
          entityType="global_{global.slug}"
          readonly={!canUpdate}
          onChange={(value) => (formData[key] = value)}
        />
      {/if}
    {/each}

    <Button type="submit" disabled={submitting || !canUpdate} class="mt-6">
      {#if submitting}
        {m.global_saving()}
      {:else}
        {m.global_save_button({ label: global.name.singular })}
      {/if}
    </Button>
  </form>
</div>
