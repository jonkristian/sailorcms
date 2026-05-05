<script lang="ts">
  import { goto } from '$app/navigation';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import { toast, toastResult } from 'sailorcms/core/ui/toast';
  import type { PageData } from './$types';
  import Header from 'sailorcms/components/sailor/Header.svelte';
  import Pagination from 'sailorcms/components/sailor/Pagination.svelte';
  import DeleteDialog from 'sailorcms/components/sailor/dialogs/DeleteDialog.svelte';
  import DataTable from 'sailorcms/components/sailor/table/DataTable.svelte';
  import BulkActionsBar from 'sailorcms/components/sailor/table/BulkActionsBar.svelte';
  import FilterBar from 'sailorcms/components/sailor/table/FilterBar.svelte';
  import { m } from '$sailor/i18n';
  import { generateUUID } from 'sailorcms/core/utils/common';
  import { invalidateAll } from '$app/navigation';
  import FileText from '@lucide/svelte/icons/file-text';
  import { useBulkSelection } from '$lib/sailor/composables/useBulkSelection.svelte';
  import { useTableFilters } from '$lib/sailor/composables/useTableFilters.svelte';
  import { formatTableDate } from 'sailorcms/core/utils/date';
  import { getUserLocale } from 'sailorcms/core/ui/user-locale';
  import * as Select from '$lib/components/ui/select/index.js';
  import SelectDialog from 'sailorcms/components/sailor/dialogs/SelectDialog.svelte';
  import {
    cloneCollectionItems,
    deleteCollectionItems,
    updateCollectionItemsAuthor,
    updateCollectionItemsSort,
    updateCollectionItemNesting
  } from '../data.remote.js';

  const { data }: { data: PageData } = $props();

  let items = $derived(data.items);

  // Use server-provided pagination data
  let pagination = $derived(data.pagination);

  // Use composables for selection and delete functionality. SvelteKit reuses
  // this page component across `[slug]` changes, so without an explicit
  // reset the previous slug's selected IDs would persist against the new
  // list. `resetOnPathnameChange` clears selection on slug transitions.
  const selection = useBulkSelection(() => items, { resetOnPathnameChange: true });

  // Custom delete handler for collections (using form actions)
  let deleteDialogOpen = $state(false);
  let deleteDialogLoading = $state(false);
  let pendingDeleteItems: { ids: string[]; count: number } = $state({ ids: [], count: 0 });

  function initiateBulkDelete(selectedIds: string[]) {
    if (selectedIds.length === 0) return;
    pendingDeleteItems = { ids: selectedIds, count: selectedIds.length };
    deleteDialogOpen = true;
  }

  async function executeBulkDelete() {
    deleteDialogLoading = true;
    try {
      const result = await deleteCollectionItems({
        collectionSlug: data.collectionType.slug,
        itemIds: pendingDeleteItems.ids
      });

      if (toastResult(result, m.toast_items_deleted, m.toast_items_delete_failed)) {
        await invalidateAll();
        selection.clearSelection();
        deleteDialogOpen = false;
      }
    } catch (error) {
      toast.error(m.toast_items_delete_failed());
    } finally {
      deleteDialogLoading = false;
    }
  }

  // Set up filters with search and sort
  const sortOptions = $derived(
    data.collectionType.options?.sortable
      ? [
          { label: m.collections_sort_sorted(), value: 'sort' },
          { label: m.collections_sort_title(), value: 'title' },
          { label: m.collections_sort_status(), value: 'status' },
          { label: m.collections_sort_updated(), value: 'updated_at' },
          { label: m.collections_sort_created(), value: 'created_at' }
        ]
      : [
          { label: m.collections_sort_title(), value: 'title' },
          { label: m.collections_sort_status(), value: 'status' },
          { label: m.collections_sort_updated(), value: 'updated_at' },
          { label: m.collections_sort_created(), value: 'created_at' }
        ]
  );

  const tableFilters = useTableFilters({
    baseUrl: () => `/sailor/collections/${data.collectionType.slug}`,
    config: {
      search: true,
      sort: {
        options: () => sortOptions,
        defaultSort: () => (data.collectionType.options?.sortable ? 'sort' : 'updated_at'),
        defaultOrder: () => (data.collectionType.options?.sortable ? 'asc' : 'desc')
      }
    },
    debounceMs: 600
  });

  // Local bulk action state for Select
  let bulkAction = $state('');
  let authorDialogOpen = $state(false);
  let authorOptions: Array<{ label: string; value: string }> = $state([]);
  let selectedAuthorId = $state('');

  async function openAuthorDialog() {
    // Load users list on demand
    try {
      const { getUsers } = await import('sailorcms/remote/users.remote.js');
      const result = await getUsers({});
      if (result.success) {
        authorOptions = result.users.map((u: any) => ({
          label: u.name || u.email || u.id,
          value: u.id
        }));
        authorDialogOpen = true;
      }
    } catch (e) {
      // ignore
    }
  }

  // Column definitions with sorting and fixed widths
  const columns = [
    { key: 'title', label: m.collections_col_title(), sortable: true, width: 300 },
    { key: 'status', label: m.collections_col_status(), sortable: true, width: 100 },
    { key: 'author', label: m.collections_col_author(), sortable: true, width: 150 },
    { key: 'updated_at', label: m.collections_col_updated(), sortable: true, width: 120 },
    { key: 'created_at', label: m.collections_col_created(), sortable: true, width: 120 }
  ];

  function handleEdit(id: string) {
    goto(`/sailor/collections/${data.collectionType.slug}/${id}`);
  }

  async function handleReorder(newItems: any[]) {
    try {
      const updates = newItems.map((item, index) => ({
        id: item.id,
        sort: index + 1
      }));

      const result = await updateCollectionItemsSort({
        collectionSlug: data.collectionType.slug,
        updates
      });

      if (result.success) {
        await invalidateAll();
      } else {
        toast.error(result.error || m.toast_sort_order_update_failed(), {
          id: 'collection-reorder'
        });
      }
    } catch (error) {
      toast.error(m.toast_sort_order_update_failed(), { id: 'collection-reorder' });
    }
  }

  async function handleNestChange(draggedId: string, newParentId: string | null, newIndex: number) {
    try {
      const result = await updateCollectionItemNesting({
        collectionSlug: data.collectionType.slug,
        itemId: draggedId,
        parentId: newParentId,
        newIndex
      });

      if (
        toastResult(result, m.toast_item_moved, m.toast_nesting_update_failed, {
          id: 'collection-nest'
        })
      ) {
        await invalidateAll();
      }
    } catch (error) {
      toast.error(m.toast_nesting_update_failed(), { id: 'collection-nest' });
    }
  }

  // Handle add new item
  function handleAddNew() {
    const newId = generateUUID();
    goto(`/sailor/collections/${data.collectionType.slug}/${newId}`);
  }

  // Handle clone selected items
  async function handleCloneSelected() {
    if (selection.selectedCount === 0) return;

    try {
      const result = await cloneCollectionItems({
        collectionSlug: data.collectionType.slug,
        itemIds: selection.selectedItems
      });

      if (toastResult(result, m.toast_items_cloned, m.toast_items_clone_failed)) {
        await invalidateAll();
        selection.clearSelection();
      }
    } catch (error) {
      toast.error(m.toast_items_clone_failed());
    }
  }
</script>

<svelte:head>
  <title>{data.collectionType.name.plural} - Sailor CMS</title>
</svelte:head>

{#key data.collectionType.slug}
  <div class="container mx-auto px-6">
    <Header
      title={data.collectionType.name.plural}
      description={data.collectionType.description}
      itemCount={pagination.totalItems}
      showAddButton={true}
      showCountBadge={true}
      addButtonAction={handleAddNew}
    />

    {#if items.length > 0}
      <!-- Table Controls with FilterBar -->
      <BulkActionsBar
        selectedCount={selection.selectedCount}
        totalCount={selection.totalCount}
        labels={{
          singular: data.collectionType.name.singular.toLowerCase(),
          plural: data.collectionType.name.plural.toLowerCase()
        }}
        actions={selection.selectedCount > 0
          ? [
              {
                label: m.globals_table_delete_count({ count: selection.selectedCount }),
                variant: 'destructive',
                onClick: () => initiateBulkDelete(selection.selectedItems)
              }
            ]
          : []}
      >
        {#snippet extraActions()}
          {#if selection.selectedCount > 0}
            <div class="flex items-center gap-2">
              <Select.Root
                type="single"
                value={bulkAction}
                onValueChange={async (value) => {
                  if (!value) return;
                  if (value === 'change-author') {
                    await openAuthorDialog();
                  } else if (value === 'clone') {
                    await handleCloneSelected();
                  }
                  bulkAction = '';
                }}
              >
                <Select.Trigger class="h-9 w-44"
                  >{m.collections_bulk_action_select()}</Select.Trigger
                >
                <Select.Content>
                  <Select.Item value="change-author"
                    >{m.collections_action_change_author()}</Select.Item
                  >
                  <Select.Item value="clone">{m.collections_action_clone()}</Select.Item>
                </Select.Content>
              </Select.Root>
            </div>
          {/if}
        {/snippet}
        {#snippet filters()}
          <div class="flex items-center gap-4">
            <FilterBar config={{ search: true }} {tableFilters} />

            <!-- Sort dropdown -->
            <Select.Root
              type="single"
              value={tableFilters.sortBy}
              onValueChange={(value) => {
                if (value) {
                  const newOrder = value === 'sort' ? 'asc' : 'desc';
                  tableFilters.handleSort(value, newOrder);
                }
              }}
            >
              <Select.Trigger class="h-9">
                {sortOptions.find((o) => o.value === tableFilters.sortBy)?.label ||
                  m.common_unknown()}
              </Select.Trigger>
              <Select.Content>
                {#each sortOptions as option}
                  <Select.Item value={option.value}>{option.label}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </div>
        {/snippet}
      </BulkActionsBar>
    {/if}

    <!-- Simple HTML table using DataTable component -->
    {#if items.length > 0}
      <DataTable
        {items}
        {columns}
        sortable={data.collectionType.options?.sortable && tableFilters.sortBy === 'sort'}
        nestable={data.collectionType.options?.nestable || false}
        selectable={true}
        selectedItems={selection.selectedItems}
        onSelect={selection.handleSelect}
        onSelectAll={selection.handleSelectAll}
        onReorder={handleReorder}
        onNestChange={handleNestChange}
        sortBy={tableFilters.sortBy}
        sortOrder={tableFilters.sortOrder}
        onColumnSort={tableFilters.handleColumnSort}
      >
        {#snippet cellRenderer(item: any, column: any)}
          {#if column.key === 'title'}
            <button
              class="cursor-pointer text-left font-medium hover:underline"
              title={item.slug ? `Slug: ${item.slug}` : undefined}
              onclick={() => handleEdit(item.id)}
            >
              {item.title || item.name || item.id}
            </button>
          {:else if column.key === 'status'}
            <Badge variant={item.status === 'published' ? 'default' : 'secondary'}>
              {item.status}
            </Badge>
          {:else if column.key === 'author'}
            {item.author_name || item.author_email || m.common_unknown()}
          {:else if column.key === 'updated_at' || column.key === 'created_at'}
            {formatTableDate(item[column.key], getUserLocale())}
          {:else}
            {item[column.key] || '-'}
          {/if}
        {/snippet}
        {#snippet empty()}
          <div class="text-center">
            <FileText class="text-muted-foreground mx-auto my-2 size-6" />
            <h3 class="text-sm font-medium">
              No {data.collectionType.name.plural.toLowerCase()} found.
            </h3>
          </div>
        {/snippet}
      </DataTable>
    {:else}
      <div class="rounded-lg border p-8 text-center">
        <FileText class="text-muted-foreground mx-auto my-2 size-6" />
        <h3 class="text-lg font-medium">
          {m.collections_empty_title({
            plural: data.collectionType.name.plural.toLowerCase()
          })}
        </h3>
        <p class="text-muted-foreground mt-1">
          {m.collections_empty_text({
            singular: data.collectionType.name.singular.toLowerCase()
          })}
        </p>
      </div>
    {/if}

    <Pagination
      page={data.pagination.page}
      pageSize={data.pagination.pageSize}
      totalItems={data.pagination.totalItems}
      totalPages={data.pagination.totalPages}
      hasNextPage={data.pagination.hasNextPage}
      hasPreviousPage={data.pagination.hasPreviousPage}
      useUrlNavigation={true}
      showTotalItems={true}
      showPageSizeSelector={true}
    />

    <!-- Delete Confirmation Dialog -->
    <DeleteDialog
      bind:open={deleteDialogOpen}
      itemCount={pendingDeleteItems.count}
      labels={{
        singular: data.collectionType.name.singular.toLowerCase(),
        plural: data.collectionType.name.plural.toLowerCase()
      }}
      onConfirm={executeBulkDelete}
      isLoading={deleteDialogLoading}
    />

    <!-- Change Author Dialog -->
    <SelectDialog
      bind:open={authorDialogOpen}
      title={m.collections_change_author_dialog_title()}
      description={m.collections_change_author_dialog_description()}
      confirmLabel={m.common_apply()}
      cancelLabel={m.common_cancel()}
      items={authorOptions}
      bind:selected={selectedAuthorId}
      onConfirm={async (authorId: string) => {
        try {
          const result = await updateCollectionItemsAuthor({
            collectionSlug: data.collectionType.slug,
            itemIds: selection.selectedItems,
            authorId
          });

          if (toastResult(result, m.toast_author_updated, m.toast_author_update_failed)) {
            await invalidateAll();
            selection.clearSelection();
          }
        } catch (error) {
          toast.error(m.toast_author_update_failed());
        }
      }}
    />
  </div>
{/key}
