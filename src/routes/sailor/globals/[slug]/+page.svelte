<script lang="ts">
  import type { PageData } from './$types';
  import { toast, toastResult } from 'sailorcms/core/ui/toast';
  import { m } from '$sailor/i18n';
  import { pluralize } from 'sailorcms/utils/ui/text';
  import { goto } from '$app/navigation';
  import { invalidateAll } from '$app/navigation';
  import { FlatView, TableView, RepeatableNestedView, RepeatableInlineView } from '../(components)';
  import Header from 'sailorcms/components/sailor/Header.svelte';
  import { generateUUID } from 'sailorcms/core/utils/common';
  import { deleteGlobalItem, reorderGlobalItems } from '../data.remote.js';
  import OverlayLoader from 'sailorcms/components/sailor/OverlayLoader.svelte';

  const { data }: { data: PageData } = $props();

  let items = $derived(data.items);

  // Store the nestable add function when available
  let nestableAddFunction: (() => void) | null = $state(null);
  let inlineAddFunction: (() => void) | null = $state(null);
  let inlineSaveFunction: (() => Promise<void>) | null = $state(null);
  let inlineExpandCollapseFunction: ((expand: boolean) => void) | null = $state(null);

  // Create form data for singleton globals
  let formData: Record<string, any> = $state({});
  let submitting = $state(false);

  // Use permissions from layout
  let canCreate = $derived(data.permissions.globals.create);

  // Initialize form data for flat globals
  if (
    // svelte-ignore state_referenced_locally
    data.global.dataType === 'flat' &&
    // svelte-ignore state_referenced_locally
    data.existingData
  ) {
    formData = {
      // svelte-ignore state_referenced_locally
      ...data.existingData
    };
  }

  // Handle delete item
  async function handleDelete(itemId: string) {
    try {
      const result = await deleteGlobalItem({
        globalSlug: data.global.slug,
        itemId: itemId
      });

      if (toastResult(result, m.toast_item_deleted, m.toast_delete_item_failed)) {
        // Refresh the page data to reflect the changes
        await invalidateAll();
      }
    } catch (error) {
      toast.error(m.toast_delete_item_failed());
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
        toast.success(
          m.toast_items_deleted_count({
            count: successCount,
            items: pluralize(successCount, m.common_item_singular(), m.common_item_plural())
          })
        );
        await invalidateAll();
      }

      if (errorCount > 0) {
        const firstError =
          results.find((r) => !r.success)?.error || m.toast_delete_some_items_failed();
        toast.error(firstError);
      }
    } catch (error) {
      toast.error(m.toast_delete_some_items_failed());
    }
  }

  async function handleReorder(newItems: any[]) {
    try {
      const result = await reorderGlobalItems({
        globalSlug: data.global.slug,
        items: newItems.map((item) => ({ id: item.id, parent_id: item.parent_id ?? null }))
      });

      if (result.success) {
        await invalidateAll();
      } else {
        toast.error(result.error || m.toast_sort_order_update_failed());
      }
    } catch {
      toast.error(m.toast_sort_order_update_failed());
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

<OverlayLoader>
  <div class="container mx-auto px-6">
    {#key data.global.slug}
      <Header
        title={data.global.name.plural}
        description={data.global.description}
        itemCount={data.global.dataType === 'flat' ? undefined : items.length}
        showAddButton={data.global.dataType !== 'flat' &&
          canCreate &&
          !data.global.options?.readonly}
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
          bind:addFn={nestableAddFunction}
          permissions={data.permissions}
        />
      {:else if data.global.dataType === 'repeatable' && data.global.options?.inline}
        <!-- RepeatableInlineView: Repeatable Global with inline editing (like FAQs) -->
        <RepeatableInlineView
          global={data.global}
          {items}
          {submitting}
          bind:addFn={inlineAddFunction}
          bind:saveFn={inlineSaveFunction}
          bind:expandCollapseFn={inlineExpandCollapseFunction}
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
          sortable={!!data.global.options?.sortable}
          onReorder={handleReorder}
        />
      {:else if data.global.dataType === 'relational'}
        <!-- TableView: Relational Global with separate edit pages (like Menus) -->
        <TableView
          global={data.global}
          {items}
          onAddNew={handleAddNew}
          onDelete={handleDelete}
          onBulkDelete={handleBulkDelete}
          sortable={!!data.global.options?.sortable}
          onReorder={handleReorder}
        />
      {:else}
        <!-- Fallback for unknown dataType -->
        <div class="rounded-lg border border-dashed border-red-300 p-4 text-center text-red-500">
          Unknown dataType: {data.global.dataType}
        </div>
      {/if}
    {/key}
  </div>
</OverlayLoader>
