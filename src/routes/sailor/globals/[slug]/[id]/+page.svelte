<script lang="ts">
  import { untrack } from 'svelte';
  import { Button } from '$lib/components/ui/button';
  import ArrayField from '$lib/components/sailor/fields/ArrayField.svelte';
  import FieldRenderer from '$lib/components/sailor/fields/FieldRenderer.svelte';
  import { toast, toastResult } from '$sailor/core/ui/toast';
  import { m } from '$sailor/i18n';
  import { invalidateAll } from '$app/navigation';
  import { Save, Pencil } from '@lucide/svelte';
  import { Separator } from '$lib/components/ui/separator';
  import { formatDetailedDate } from '$sailor/core/utils/date';
  import { getUserLocale } from '$sailor/core/ui/user-locale';
  import { useUnsavedChanges } from '$sailor/core/hooks/unsaved-changes.svelte';
  import {
    updateFlatGlobal,
    updateRepeatableGlobal,
    updateRelationalGlobal
  } from '../../data.remote.js';
  import OverlayLoader from '$lib/components/sailor/OverlayLoader.svelte';

  const { data }: { data: any } = $props();

  const unsavedChanges = useUnsavedChanges(() => Object.keys(userChanges).length > 0);

  // User changes to form data
  let userChanges: Record<string, any> = $state({});

  let mode = $state<'edit' | 'read'>(
    untrack(() =>
      data.global.options?.defaultView === 'read' && !data.isNewItem ? 'read' : 'edit'
    )
  );

  // Get current value for a field (user changes or server data)
  function getFieldValue(fieldKey: string) {
    if (userChanges[fieldKey] !== undefined) {
      return userChanges[fieldKey];
    }

    if (data.global && data.item) {
      const field = data.global.fields[fieldKey] as any;
      if (field.type === 'array') {
        return data.item[fieldKey] ?? [];
      } else {
        return data.item[fieldKey] ?? '';
      }
    }

    return '';
  }

  // Update a field value
  function updateField(fieldKey: string, value: any) {
    userChanges[fieldKey] = value;
  }

  let submitting = $state(false);

  // Handle form submission with remote functions
  async function handleSubmit(event: Event) {
    event.preventDefault();

    // Prevent submission for readonly globals or while in read view
    if (data.global.options?.readonly || mode === 'read') {
      return;
    }

    submitting = true;

    try {
      // Prepare data to save (merge user changes with existing data)
      const formData: Record<string, any> = {};

      // Add all fields with current values
      Object.keys(data.global.fields).forEach((fieldKey) => {
        formData[fieldKey] = getFieldValue(fieldKey);
      });

      // Add core fields if they exist
      if (data.item?.id) formData.id = data.item.id;
      if (data.item?.created_at) formData.created_at = data.item.created_at;
      if (data.item?.updated_at) formData.updated_at = data.item.updated_at;

      let result;

      switch (data.global.dataType) {
        case 'flat':
          result = await updateFlatGlobal({
            globalSlug: data.global.slug,
            data: formData
          });
          break;
        case 'repeatable':
          result = await updateRepeatableGlobal({
            globalSlug: data.global.slug,
            itemId: data.item.id,
            data: formData
          });
          break;
        case 'relational':
          result = await updateRelationalGlobal({
            globalSlug: data.global.slug,
            itemId: data.item.id,
            data: formData
          });
          break;
        default:
          throw new Error('Unknown data type');
      }

      if (
        toastResult(result, m.toast_global_saved, m.toast_save_global_failed, {
          id: 'global-save'
        })
      ) {
        userChanges = {};
        await invalidateAll();
      }
    } catch (error) {
      toast.error(m.toast_save_global_failed(), { id: 'global-save' });
    } finally {
      submitting = false;
    }
  }

  // Handle array field changes
  function handleArrayFieldChange(fieldKey: string, items: any[]) {
    updateField(fieldKey, items);
  }

  // Handle array reordering with immediate save
  async function handleArrayReorder(fieldKey: string, items: any[]) {
    try {
      const { reorderArrayItems } = await import('../../data.remote.js');

      const result = await reorderArrayItems({
        globalSlug: data.global.slug,
        fieldName: fieldKey,
        items
      });

      if (result.success) {
        // Reload data to show the updated order
        await invalidateAll();
      } else {
        toast.error(m.toast_reorder_items_failed());
      }
    } catch (error) {
      console.error('Reorder error:', error);
      toast.error(m.toast_reorder_items_failed());
    }
  }

  // Organize fields by position, excluding hidden fields
  let allFields = $derived(
    Object.entries(data.global.fields).filter(([_, field]) => !(field as any).hidden)
  );

  let mainFields = $derived(
    allFields.filter(
      ([_, field]) => (field as any).position === 'main' || (field as any).type === 'array'
    )
  );
  let sidebarFields = $derived(
    allFields.filter(
      ([_, field]) =>
        (field as any).position === 'sidebar' ||
        (!(field as any).position && (field as any).type !== 'array')
    )
  );
  let headerFields = $derived(
    allFields.filter(([_, field]) => (field as any).position === 'header')
  );
  let footerFields = $derived(
    allFields.filter(([_, field]) => (field as any).position === 'footer')
  );
</script>

<svelte:head>
  <title>{data.global.name.singular} - Sailor CMS</title>
</svelte:head>

<OverlayLoader>
  <div class="container mx-auto px-6 py-6">
    <form onsubmit={handleSubmit} class="flex h-[calc(100vh-12rem)] gap-6">
      <!-- Main Content Area -->
      <div class="flex flex-1 flex-col">
        <!-- Header Fields -->
        {#if headerFields.length > 0}
          <div class="mb-6 space-y-4 border-b pb-4">
            {#each headerFields as [fieldKey, field]}
              {@const typedField = field as any}
              <div class="space-y-2">
                {#if mode === 'edit' && typedField.type === 'array'}
                  <label class="text-sm font-medium" for={fieldKey}>{typedField.label}</label>
                  <ArrayField
                    items={getFieldValue(fieldKey) || []}
                    itemSchema={typedField.items?.properties || {}}
                    onChange={(items) => handleArrayFieldChange(fieldKey, items)}
                    onReorder={(items) => handleArrayReorder(fieldKey, items)}
                    globalSlug={data.global.slug}
                    fieldName={fieldKey}
                    nestable={typedField.nestable || false}
                  />
                {:else}
                  <FieldRenderer
                    field={typedField}
                    value={getFieldValue(fieldKey)}
                    {fieldKey}
                    titleValue={fieldKey === 'slug' ? getFieldValue('title') : null}
                    currentItemId={data.item?.id}
                    entityType="global_{data.global.slug}"
                    onChange={(value) => updateField(fieldKey, value)}
                    readonly={data.global.options?.readonly}
                    {mode}
                  />
                {/if}
              </div>
            {/each}
          </div>
        {/if}

        <!-- Main Fields -->
        <div class="flex-1 overflow-y-auto">
          <div class="space-y-6">
            {#if mainFields.length > 0}
              <div
                class={mode === 'read'
                  ? 'border-input divide-border/40 divide-y rounded-lg border px-6'
                  : 'space-y-6'}
              >
                {#each mainFields as [fieldKey, field]}
                  {@const typedField = field as any}
                  <div class={mode === 'read' ? '' : 'space-y-2'}>
                    {#if mode === 'edit' && typedField.type === 'array'}
                      <div class="border-input rounded-lg border p-6">
                        <label class="text-sm font-medium" for={fieldKey}>{typedField.label}</label>
                        <ArrayField
                          items={getFieldValue(fieldKey) || []}
                          itemSchema={typedField.items?.properties || {}}
                          onChange={(items) => handleArrayFieldChange(fieldKey, items)}
                          onReorder={(items) => handleArrayReorder(fieldKey, items)}
                          globalSlug={data.global.slug}
                          fieldName={fieldKey}
                          nestable={typedField.nestable || false}
                        />
                      </div>
                    {:else}
                      <FieldRenderer
                        field={typedField}
                        value={getFieldValue(fieldKey)}
                        {fieldKey}
                        titleValue={fieldKey === 'slug' ? getFieldValue('title') : null}
                        currentItemId={data.item?.id}
                        entityType="global_{data.global.slug}"
                        onChange={(value) => updateField(fieldKey, value)}
                        readonly={data.global.options?.readonly}
                        {mode}
                      />
                    {/if}
                  </div>
                {/each}
              </div>
            {:else}
              <div class="flex flex-col items-center justify-center py-12 text-center">
                <h3 class="mb-2 text-lg font-medium">{m.global_no_main_fields_title()}</h3>
                <p class="text-muted-foreground">{m.global_no_main_fields_text()}</p>
              </div>
            {/if}
          </div>
        </div>

        <!-- Footer Fields -->
        {#if footerFields.length > 0}
          <div class="mt-6 space-y-4 border-t pt-4">
            {#each footerFields as [fieldKey, field]}
              {@const typedField = field as any}
              <div class="space-y-2">
                {#if mode === 'edit' && typedField.type === 'array'}
                  <label class="text-sm font-medium" for={fieldKey}>{typedField.label}</label>
                  <ArrayField
                    items={getFieldValue(fieldKey) || []}
                    itemSchema={typedField.items?.properties || {}}
                    onChange={(items) => handleArrayFieldChange(fieldKey, items)}
                    onReorder={(items) => handleArrayReorder(fieldKey, items)}
                    globalSlug={data.global.slug}
                    fieldName={fieldKey}
                    nestable={typedField.nestable || false}
                  />
                {:else}
                  <FieldRenderer
                    field={typedField}
                    value={getFieldValue(fieldKey)}
                    {fieldKey}
                    titleValue={fieldKey === 'slug' ? getFieldValue('title') : null}
                    currentItemId={data.item?.id}
                    entityType="global_{data.global.slug}"
                    onChange={(value) => updateField(fieldKey, value)}
                    readonly={data.global.options?.readonly}
                    {mode}
                  />
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Right Sidebar -->
      <div class="bg-background w-80 border-l">
        <div class="h-full overflow-y-auto p-4 pt-4">
          <div class="space-y-6">
            <!-- Sidebar Fields -->
            {#if sidebarFields.length > 0}
              <div class="space-y-4">
                {#each sidebarFields as [fieldKey, field]}
                  {@const typedField = field as any}
                  <div class="space-y-2">
                    {#if mode === 'edit' && typedField.type === 'array'}
                      <label class="text-sm font-medium" for={fieldKey}>{typedField.label}</label>
                      <ArrayField
                        items={getFieldValue(fieldKey) || []}
                        itemSchema={typedField.items?.properties || {}}
                        onChange={(items) => handleArrayFieldChange(fieldKey, items)}
                        nestable={typedField.nestable || false}
                      />
                    {:else}
                      <FieldRenderer
                        field={typedField}
                        value={getFieldValue(fieldKey)}
                        {fieldKey}
                        titleValue={fieldKey === 'slug' ? getFieldValue('title') : null}
                        currentItemId={data.item?.id}
                        entityType="global_{data.global.slug}"
                        onChange={(value) => updateField(fieldKey, value)}
                        readonly={data.global.options?.readonly}
                        variant="sidebar"
                        {mode}
                      />
                    {/if}
                  </div>
                {/each}
              </div>
              <Separator />
            {/if}

            <!-- Metadata -->
            <div class="space-y-4">
              {#if data.item?.created_at}
                <div class="flex items-center justify-between">
                  <span class="text-sm font-medium">{m.common_created()}</span>
                  <span class="text-muted-foreground text-sm">
                    {formatDetailedDate(data.item.created_at, getUserLocale())}
                  </span>
                </div>
              {/if}

              {#if data.item?.updated_at}
                <div class="flex items-center justify-between">
                  <span class="text-sm font-medium">{m.common_updated()}</span>
                  <span class="text-muted-foreground text-sm">
                    {formatDetailedDate(data.item.updated_at, getUserLocale())}
                  </span>
                </div>
              {/if}
            </div>

            <!-- Save / Edit Button -->
            {#if !data.global.options?.readonly}
              {#if mode === 'read'}
                <Button type="button" onclick={() => (mode = 'edit')} class="w-full">
                  <Pencil class="mr-2 h-4 w-4" />
                  {m.global_edit_button({ label: data.global.name.singular })}
                </Button>
              {:else}
                <Button type="submit" disabled={submitting} class="w-full">
                  {#if submitting}
                    <Save class="mr-2 h-4 w-4 animate-spin" />
                    {m.global_saving()}
                  {:else}
                    <Save class="mr-2 h-4 w-4" />
                    {m.global_save_button({ label: data.global.name.singular })}
                  {/if}
                </Button>
                {#if data.global.options?.defaultView === 'read' && !data.isNewItem}
                  <button
                    type="button"
                    class="text-muted-foreground hover:text-foreground w-full text-sm underline-offset-4 hover:underline"
                    onclick={() => {
                      userChanges = {};
                      mode = 'read';
                    }}
                  >
                    {m.global_cancel()}
                  </button>
                {/if}
              {/if}
            {/if}
          </div>
        </div>
      </div>
    </form>
  </div>
</OverlayLoader>
