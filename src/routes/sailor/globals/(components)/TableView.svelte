<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import { Plus } from '@lucide/svelte';
  import { goto } from '$app/navigation';
  import { DataTable, BulkActionsBar } from '$lib/components/sailor/table';
  import DeleteDialog from '$lib/components/sailor/dialogs/DeleteDialog.svelte';
  import { useBulkSelection } from '$lib/sailor/composables/useBulkSelection.svelte';
  import { useBulkDelete } from '$lib/sailor/composables/useBulkDelete.svelte';
  import { formatTableDate } from '$sailor/core/utils/date';

  const { global, items, onAddNew, onDelete, onBulkDelete } = $props<{
    global: any;
    items: any[];
    onAddNew?: () => void;
    onDelete: (itemId: string) => void;
    onBulkDelete?: (itemIds: string[]) => void;
  }>();

  // Use composables for selection and delete functionality
  const selection = useBulkSelection(items);

  // Create custom delete handler that uses the provided onDelete/onBulkDelete functions
  async function handleCustomDelete(itemIds: string[]) {
    if (onBulkDelete && itemIds.length > 1) {
      await onBulkDelete(itemIds);
    } else {
      // Delete each item individually
      for (const itemId of itemIds) {
        await onDelete(itemId);
      }
    }
  }

  const bulkDelete = useBulkDelete({
    customDeleteHandler: handleCustomDelete,
    itemType: global.name.singular.toLowerCase(),
    onSuccess: () => {
      selection.clearSelection();
    }
  });

  function handleEditItem(id: string) {
    goto(`/sailor/globals/${global.slug}/${id}`);
  }

  // Generate columns based on fields with showInTable: true, or use defaults
  const tableColumns = Object.entries(global.fields)
    .filter(([_, field]) => (field as any).showInTable === true)
    .sort(([_, a], [__, b]) => ((a as any).order || 99) - ((b as any).order || 99))
    .map(([key, field]) => ({
      key,
      label: (field as any).label || (field as any).title || key
    }));

  // If no table fields defined, use default columns
  const columns =
    tableColumns.length > 0
      ? [...tableColumns, { key: 'created_at', label: 'Created' }]
      : [
          { key: 'title', label: 'Title' },
          { key: 'slug', label: 'Slug' },
          { key: 'status', label: 'Status' },
          { key: 'updated_at', label: 'Last Updated' }
        ];

  // First column should be clickable to open detail view
  const firstColumnKey = columns[0]?.key;
</script>

<div class="space-y-6">
  {#if items.length === 0}
    <div class="flex flex-col items-center justify-center py-12 text-center">
      <h3 class="mb-2 text-lg font-medium">No {global.name.plural.toLowerCase()} yet</h3>
      <p class="text-muted-foreground mb-6 max-w-md">
        {#if global.options?.readonly}
          {global.name.plural} will appear here when data is submitted.
        {:else}
          Get started by creating your first {global.name.singular.toLowerCase()}
        {/if}
      </p>
      {#if onAddNew && !global.options?.readonly}
        <Button onclick={onAddNew}>
          <Plus class="mr-2 h-4 w-4" />
          Add {global.name.singular}
        </Button>
      {/if}
    </div>
  {:else}
    <!-- Table Controls with BulkActionsBar -->
    <BulkActionsBar
      selectedCount={selection.selectedCount}
      totalCount={selection.totalCount}
      itemType={global.name.singular.toLowerCase()}
      actions={[
        {
          label: `Delete (${selection.selectedCount})`,
          variant: 'destructive',
          onClick: () => bulkDelete.initiateBulkDelete(selection.selectedItems)
        }
      ]}
    />

    <DataTable
      {items}
      {columns}
      selectable={true}
      selectedItems={selection.selectedItems}
      onSelect={selection.handleSelect}
      onSelectAll={selection.handleSelectAll}
    >
      {#snippet cellRenderer(item: any, column: any)}
        {@const field = global.fields[column.key]}
        {@const fieldType = field?.type}

        {#if column.key === firstColumnKey}
          <button
            class="cursor-pointer text-left font-medium hover:underline"
            onclick={() => handleEditItem(item.id)}
          >
            {item[column.key] || item.title || item.name || item.id}
          </button>
        {:else if fieldType === 'select'}
          <Badge
            variant={item[column.key] === 'new'
              ? 'default'
              : item[column.key] === 'replied'
                ? 'outline'
                : 'secondary'}
          >
            {field.options?.find((opt: any) => opt.value === item[column.key])?.label ||
              item[column.key]}
          </Badge>
        {:else if fieldType === 'email'}
          <a
            href="mailto:{item[column.key]}"
            class="text-foreground hover:text-primary font-medium underline-offset-4 transition-colors hover:underline"
          >
            {item[column.key]}
          </a>
        {:else if fieldType === 'link'}
          {#if item[column.key]?.includes('@')}
            <a
              href="mailto:{item[column.key]}"
              class="text-foreground hover:text-primary font-medium underline-offset-4 transition-colors hover:underline"
            >
              {item[column.key]}
            </a>
          {:else if item[column.key]?.startsWith('tel:') || item[column.key]?.match(/^[\+]?[1-9][\d]{0,15}$/)}
            <a
              href="tel:{item[column.key]?.replace('tel:', '')}"
              class="text-foreground hover:text-primary font-medium underline-offset-4 transition-colors hover:underline"
            >
              {item[column.key]}
            </a>
          {:else if item[column.key]?.startsWith('http') || item[column.key]?.startsWith('www.')}
            <a
              href={item[column.key]?.startsWith('http')
                ? item[column.key]
                : `https://${item[column.key]}`}
              target="_blank"
              rel="noopener noreferrer"
              class="text-foreground hover:text-primary font-medium underline-offset-4 transition-colors hover:underline"
            >
              {item[column.key]}
            </a>
          {:else}
            {item[column.key] || '-'}
          {/if}
        {:else if column.key === 'updated_at' || column.key === 'created_at'}
          {formatTableDate(item[column.key])}
        {:else}
          {item[column.key] || '-'}
        {/if}
      {/snippet}
      {#snippet empty()}
        <div class="text-center">
          <h3 class="text-sm font-medium">No {global.name.plural.toLowerCase()} found.</h3>
        </div>
      {/snippet}
    </DataTable>
  {/if}
</div>

<!-- Delete Confirmation Dialog -->
<DeleteDialog
  bind:open={bulkDelete.deleteDialogOpen}
  itemCount={bulkDelete.pendingDeleteItems.count}
  itemType={global.name.singular.toLowerCase()}
  onConfirm={bulkDelete.executeBulkDelete}
  isLoading={bulkDelete.deleteDialogLoading}
/>
