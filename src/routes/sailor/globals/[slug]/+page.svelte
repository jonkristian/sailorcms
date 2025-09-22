<script lang="ts">
  import type { PageData } from './$types';
  import { toast } from '$sailor/core/ui/toast';
  import { goto } from '$app/navigation';
  import { invalidateAll } from '$app/navigation';
  import { FlatView, TableView, RepeatableNestedView, RepeatableInlineView } from '../(components)';
  import Header from '$lib/components/sailor/Header.svelte';
  import { generateUUID } from '$sailor/core/utils/common';
  import { deleteGlobalItem } from '../data.remote.js';

  const { data } = $props<{ data: PageData }>();

  let items = $derived(data.items);

  // Store the nestable add function when available
  let nestableAddFunction = $state<(() => void) | null>(null);
  let inlineAddFunction = $state<(() => void) | null>(null);
  let inlineSaveFunction = $state<(() => Promise<void>) | null>(null);
  let inlineExpandCollapseFunction = $state<((expand: boolean) => void) | null>(null);

  // Create form data for singleton globals
  let formData = $state<Record<string, any>>({});
  let submitting = $state(false);

  // Use permissions from layout
  let canCreate = $derived(data.permissions.globals.create);

  // Initialize form data for flat globals
  if (data.global.dataType === 'flat' && data.existingData) {
    formData = { ...data.existingData };
  }

  // Handle delete item
  async function handleDelete(itemId: string) {
    try {
      const result = await deleteGlobalItem({
        globalSlug: data.global.slug,
        itemId: itemId
      });

      if (result.success) {
        toast.success('Item deleted successfully');
        // Refresh the page data to reflect the changes
        await invalidateAll();
      } else {
        toast.error(result.error || 'Failed to delete item');
      }
    } catch (error) {
      toast.error('Failed to delete item');
    }
  }

  // Handle bulk delete (without individual confirmations)
  async function handleBulkDelete(itemIds: string[]) {
    try {
      const results = [];

      // Delete each item without individual confirmations
      for (const itemId of itemIds) {
        const result = await deleteGlobalItem({
          globalSlug: data.global.slug,
          itemId: itemId
        });

        results.push({
          id: itemId,
          success: result.success,
          error: result.success ? null : result.error
        });
      }

      const successCount = results.filter((r) => r.success).length;
      const errorCount = results.filter((r) => !r.success).length;

      if (successCount > 0) {
        toast.success(`${successCount} item(s) deleted successfully`);
        await invalidateAll();
      }

      if (errorCount > 0) {
        const firstError = results.find((r) => !r.success)?.error || 'Failed to delete some items';
        toast.error(firstError);
      }
    } catch (error) {
      toast.error('Failed to delete some items');
    }
  }

  // Handle add new item
  function handleAddNew() {
    if (data.global.dataType === 'repeatable' && data.global.options?.nestable) {
      // For nestable repeatable globals, the NestedView component handles this
      return;
    } else if (data.global.dataType === 'repeatable' && data.global.options?.inline) {
      // For inline repeatable globals, the InlineView component handles this
      return;
    } else {
      // For relational globals, navigate to edit page
      const newId = generateUUID();
      goto(`/sailor/globals/${data.global.slug}/${newId}`);
    }
  }
</script>

<svelte:head>
  <title>{data.global.name.plural} - Sailor CMS</title>
</svelte:head>

<div class="container mx-auto px-6">
  {#key data.global.slug}
    <Header
      title={data.global.name.plural}
      description={data.global.description}
      itemCount={data.global.dataType === 'flat' ? undefined : items.length}
      showAddButton={data.global.dataType !== 'flat' && canCreate && !data.global.options?.readonly}
      showCountBadge={data.global.dataType !== 'flat'}
      addButtonAction={data.global.dataType === 'repeatable' && data.global.options?.nestable
        ? nestableAddFunction || (() => {})
        : data.global.dataType === 'repeatable' && data.global.options?.inline
          ? inlineAddFunction || (() => {})
          : handleAddNew}
      showSaveButton={data.global.dataType === 'repeatable' && data.global.options?.inline}
      saveButtonAction={inlineSaveFunction || (async () => {})}
      showExpandCollapseButton={data.global.dataType === 'repeatable' &&
        data.global.options?.inline}
      expandCollapseAction={inlineExpandCollapseFunction || (() => {})}
      {submitting}
    />

    {#if data.global.dataType === 'flat'}
      <!-- FlatView: Flat Global with static fields (like Settings) -->
      <FlatView global={data.global} bind:formData {submitting} permissions={data.permissions} />
    {:else if data.global.dataType === 'repeatable' && data.global.options?.nestable}
      <!-- RepeatableNestedView: Repeatable Global with hierarchy (like Categories) -->
      <RepeatableNestedView
        global={data.global}
        {items}
        bind:formData
        exposeAddFunction={(fn) => (nestableAddFunction = fn)}
        permissions={data.permissions}
      />
    {:else if data.global.dataType === 'repeatable' && data.global.options?.inline}
      <!-- RepeatableInlineView: Repeatable Global with inline editing (like FAQs) -->
      <RepeatableInlineView
        global={data.global}
        {items}
        {submitting}
        exposeAddFunction={(fn) => (inlineAddFunction = fn)}
        exposeSaveFunction={(fn) => (inlineSaveFunction = fn)}
        exposeExpandCollapseFunction={(fn) => (inlineExpandCollapseFunction = fn)}
        permissions={data.permissions}
      />
    {:else if data.global.dataType === 'repeatable'}
      <!-- TableView: Repeatable Global with separate edit pages (simple repeatable) -->
      <TableView
        global={data.global}
        {items}
        onAddNew={handleAddNew}
        onDelete={handleDelete}
        onBulkDelete={handleBulkDelete}
      />
    {:else if data.global.dataType === 'relational'}
      <!-- TableView: Relational Global with separate edit pages (like Menus) -->
      <TableView
        global={data.global}
        {items}
        onAddNew={handleAddNew}
        onDelete={handleDelete}
        onBulkDelete={handleBulkDelete}
      />
    {:else}
      <!-- Fallback for unknown dataType -->
      <div class="rounded-lg border border-dashed border-red-300 p-4 text-center text-red-500">
        Unknown dataType: {data.global.dataType}
      </div>
    {/if}
  {/key}
</div>
