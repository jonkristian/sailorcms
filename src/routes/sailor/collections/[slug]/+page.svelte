<script lang="ts">
  import { goto } from '$app/navigation';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import { toast } from '$sailor/core/ui/toast';
  import type { PageData } from './$types';
  import Header from '$lib/components/sailor/Header.svelte';
  import Pagination from '$lib/components/sailor/Pagination.svelte';
  import DeleteDialog from '$lib/components/sailor/dialogs/DeleteDialog.svelte';
  import { DataTable, BulkActionsBar, FilterBar } from '$lib/components/sailor/table';
  import { generateUUID } from '$sailor/core/utils/common';
  import { invalidateAll } from '$app/navigation';
  import FileText from '@lucide/svelte/icons/file-text';
  import { useBulkSelection } from '$lib/sailor/composables/useBulkSelection.svelte';
  import { useTableFilters } from '$lib/sailor/composables/useTableFilters.svelte';
  import { formatTableDate } from '$sailor/core/utils/date';
  import * as Select from '$lib/components/ui/select/index.js';
  import SelectDialog from '$lib/components/sailor/dialogs/SelectDialog.svelte';
  import {
    cloneCollectionItems,
    deleteCollectionItems,
    updateCollectionItemsAuthor,
    updateCollectionItemsSort,
    updateCollectionItemNesting
  } from '../data.remote.js';

  const { data } = $props<{ data: PageData }>();

  let items = $derived(data.items);

  // Use server-provided pagination data
  let pagination = $derived(data.pagination);

  // Use composables for selection and delete functionality
  const selection = useBulkSelection(() => items);

  // Custom delete handler for collections (using form actions)
  let deleteDialogOpen = $state(false);
  let deleteDialogLoading = $state(false);
  let pendingDeleteItems = $state<{ ids: string[]; count: number }>({ ids: [], count: 0 });

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

      if (result.success) {
        toast.success(result.message || 'Items deleted successfully');
        await invalidateAll();
        selection.clearSelection();
        deleteDialogOpen = false;
      } else {
        toast.error(result.error || 'Failed to delete items');
      }
    } catch (error) {
      toast.error('Failed to delete items');
    } finally {
      deleteDialogLoading = false;
    }
  }

  // Set up filters with search and sort
  const sortOptions = data.collectionType.options?.sortable
    ? [
        { label: 'Sorted', value: 'sort' },
        { label: 'Title', value: 'title' },
        { label: 'Status', value: 'status' },
        { label: 'Updated', value: 'updated_at' },
        { label: 'Created', value: 'created_at' }
      ]
    : [
        { label: 'Title', value: 'title' },
        { label: 'Status', value: 'status' },
        { label: 'Updated', value: 'updated_at' },
        { label: 'Created', value: 'created_at' }
      ];

  const tableFilters = useTableFilters({
    baseUrl: `/sailor/collections/${data.collectionType.slug}`,
    config: {
      search: true,
      sort: {
        options: sortOptions,
        defaultSort: data.collectionType.options?.sortable ? 'sort' : 'updated_at',
        defaultOrder: data.collectionType.options?.sortable ? 'asc' : 'desc'
      }
    },
    debounceMs: 600
  });

  // Local bulk action state for Select
  let bulkAction = $state('');
  let authorDialogOpen = $state(false);
  let authorOptions = $state<Array<{ label: string; value: string }>>([]);
  let selectedAuthorId = $state('');

  async function openAuthorDialog() {
    // Load users list on demand
    try {
      const { getUsers } = await import('$sailor/remote/users.remote.js');
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
    { key: 'title', label: 'Title', sortable: true, width: 300 },
    { key: 'status', label: 'Status', sortable: true, width: 100 },
    { key: 'author', label: 'Author', sortable: true, width: 150 },
    { key: 'updated_at', label: 'Last Updated', sortable: true, width: 120 },
    { key: 'created_at', label: 'Created', sortable: true, width: 120 }
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
        toast.error(result.error || 'Failed to update sort order');
      }
    } catch (error) {
      toast.error('Failed to update sort order');
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

      if (result.success) {
        await invalidateAll();
        toast.success('Item moved successfully');
      } else {
        toast.error(result.error || 'Failed to update nesting');
      }
    } catch (error) {
      toast.error('Failed to update nesting');
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

      if (result.success) {
        toast.success(result.message || 'Items cloned successfully');
        await invalidateAll();
        selection.clearSelection();
      } else {
        toast.error(result.error || 'Failed to clone items');
      }
    } catch (error) {
      toast.error('Failed to clone items');
    }
  }
</script>

<svelte:head>
  <title>{data.collectionType.name.plural} - Sailor CMS</title>
</svelte:head>

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
      itemType={data.collectionType.name.singular.toLowerCase()}
      actions={selection.selectedCount > 0
        ? [
            {
              label: `Delete (${selection.selectedCount})`,
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
              <Select.Trigger class="h-9 w-44">Bulk actions…</Select.Trigger>
              <Select.Content>
                <Select.Item value="change-author">Change author…</Select.Item>
                <Select.Item value="clone">Clone selected…</Select.Item>
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
              {sortOptions.find((o) => o.value === tableFilters.sortBy)?.label || 'Unknown'}
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
          {item.author_name || item.author_email || 'Unknown'}
        {:else if column.key === 'updated_at' || column.key === 'created_at'}
          {formatTableDate(item[column.key])}
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
      <h3 class="text-lg font-medium">No {data.collectionType.name.plural.toLowerCase()} found</h3>
      <p class="text-muted-foreground mt-1">
        Get started by creating your first {data.collectionType.name.singular.toLowerCase()}.
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
</div>

<!-- Delete Confirmation Dialog -->
<DeleteDialog
  bind:open={deleteDialogOpen}
  itemCount={pendingDeleteItems.count}
  itemType={data.collectionType.name.singular.toLowerCase()}
  onConfirm={executeBulkDelete}
  isLoading={deleteDialogLoading}
/>

<!-- Change Author Dialog -->
<SelectDialog
  bind:open={authorDialogOpen}
  title="Change author"
  description="Select an author to assign to the selected items"
  confirmLabel="Apply"
  cancelLabel="Cancel"
  items={authorOptions}
  bind:selected={selectedAuthorId}
  onConfirm={async (authorId: string) => {
    try {
      const result = await updateCollectionItemsAuthor({
        collectionSlug: data.collectionType.slug,
        itemIds: selection.selectedItems,
        authorId
      });

      if (result.success) {
        toast.success(result.message || 'Author updated successfully');
        await invalidateAll();
        selection.clearSelection();
      } else {
        toast.error(result.error || 'Failed to update author');
      }
    } catch (error) {
      toast.error('Failed to update author');
    }
  }}
/>
