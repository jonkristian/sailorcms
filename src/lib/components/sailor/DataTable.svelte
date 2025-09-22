<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
  } from '$lib/components/ui/table';
  import { Badge } from '$lib/components/ui/badge';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { MoreVertical, GripVertical } from '@lucide/svelte';
  import { goto } from '$app/navigation';
  import { formatTableDate } from '$sailor/core/utils/date';
  import FileText from '@lucide/svelte/icons/file-text';

  const {
    items,
    columns,
    actions = [],
    onEdit,
    onDelete,
    editUrl,
    showDragHandle = false,
    dragEnabled = false,
    itemId = (item: any) => item.id
  } = $props<{
    items: any[];
    columns: Array<{
      key: string;
      label: string;
      render?: (item: any) => any;
      className?: string;
    }>;
    actions?: Array<{
      label: string;
      onClick: (item: any) => void;
      variant?: 'default' | 'destructive' | 'secondary';
      separator?: boolean;
    }>;
    onEdit?: (item: any) => void;
    onDelete?: (item: any) => void;
    editUrl?: (item: any) => string;
    showDragHandle?: boolean;
    dragEnabled?: boolean;
    itemId?: (item: any) => string;
  }>();

  function handleEdit(item: any) {
    if (onEdit) {
      onEdit(item);
    } else if (editUrl) {
      goto(editUrl(item));
    }
  }

  function handleDelete(item: any) {
    if (onDelete) {
      onDelete(item);
    }
  }
</script>

<div class="overflow-hidden rounded-lg border">
  <Table>
    <TableHeader class="bg-muted sticky top-0 z-10">
      <TableRow>
        {#if showDragHandle}
          <TableHead></TableHead>
        {/if}
        {#each columns as column (column.key || column.label)}
          <TableHead class={column.className}>{column.label}</TableHead>
        {/each}
        {#if actions.length > 0 || onEdit || onDelete}
          <TableHead></TableHead>
        {/if}
      </TableRow>
    </TableHeader>
    <TableBody>
      {#if items.length > 0}
        {#each items as item (itemId(item))}
          <TableRow>
            {#if showDragHandle}
              <TableCell class="w-8">
                <Button
                  variant="ghost"
                  size="icon"
                  class="text-muted-foreground size-7 cursor-grab hover:cursor-grabbing hover:bg-transparent"
                  disabled={!dragEnabled}
                >
                  <GripVertical class="text-muted-foreground size-3" />
                  <span class="sr-only">Drag to reorder</span>
                </Button>
              </TableCell>
            {/if}
            {#each columns as column (column.key || column.label)}
              <TableCell class={column.className}>
                {#if column.render}
                  {@render column.render(item)}
                {:else}
                  {@const value = item[column.key]}
                  {#if column.key === 'status'}
                    <Badge variant={value === 'published' ? 'default' : 'secondary'}>
                      {value}
                    </Badge>
                  {:else if column.key === 'updated_at' || column.key === 'created_at'}
                    {formatTableDate(value)}
                  {:else if column.key === 'title' && editUrl}
                    <button
                      class="cursor-pointer text-left hover:underline"
                      onclick={() => handleEdit(item)}
                    >
                      {value}
                    </button>
                  {:else}
                    {value}
                  {/if}
                {/if}
              </TableCell>
            {/each}
            {#if actions.length > 0 || onEdit || onDelete}
              <TableCell class="text-right">
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger>
                    <div
                      class="hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring flex h-8 w-8 items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
                    >
                      <MoreVertical class="h-4 w-4" />
                      <span class="sr-only">Open menu</span>
                    </div>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Content align="end" class="w-32">
                    {#if onEdit || editUrl}
                      <DropdownMenu.Item onclick={() => handleEdit(item)}>Edit</DropdownMenu.Item>
                    {/if}
                    {#each actions as action (action.label)}
                      <DropdownMenu.Item
                        onclick={() => action.onClick(item)}
                        variant={action.variant}
                      >
                        {action.label}
                      </DropdownMenu.Item>
                      {#if action.separator}
                        <DropdownMenu.Separator />
                      {/if}
                    {/each}
                    {#if onDelete}
                      <DropdownMenu.Item variant="destructive" onclick={() => handleDelete(item)}>
                        Delete
                      </DropdownMenu.Item>
                    {/if}
                  </DropdownMenu.Content>
                </DropdownMenu.Root>
              </TableCell>
            {/if}
          </TableRow>
        {/each}
      {:else}
        <TableRow>
          <TableCell
            colspan={columns.length +
              (showDragHandle ? 1 : 0) +
              (actions.length > 0 || onEdit || onDelete ? 1 : 0)}
            class="h-24 text-center"
          >
            <div class="text-center">
              <FileText class="text-muted-foreground mx-auto my-4 size-6" />
              <h3 class="text-lg font-medium">No results.</h3>
            </div>
          </TableCell>
        </TableRow>
      {/if}
    </TableBody>
  </Table>
</div>
