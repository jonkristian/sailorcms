<script lang="ts">
  import { Button } from 'sailorcms/components/ui/button/index.js';
  import { Badge } from 'sailorcms/components/ui/badge/index.js';
  import { Plus } from '@lucide/svelte';
  import { goto } from '$app/navigation';
  import DataTable from 'sailorcms/components/sailor/table/DataTable.svelte';
  import BulkActionsBar from 'sailorcms/components/sailor/table/BulkActionsBar.svelte';
  import DeleteDialog from 'sailorcms/components/sailor/dialogs/DeleteDialog.svelte';
  import Pagination from 'sailorcms/components/sailor/Pagination.svelte';
  import type { Pagination as PaginationData } from 'sailorcms/core/types';
  import { useBulkSelection } from 'sailorcms/composables/useBulkSelection.svelte';
  import { useBulkDelete } from 'sailorcms/composables/useBulkDelete.svelte';
  import { formatTableDate } from 'sailorcms/core/utils/date';
  import { getUserLocale } from 'sailorcms/core/ui/user-locale';
  import { getStatusBadge } from 'sailorcms/core/ui/status-badge';
  import { relationBadgeFields } from 'sailorcms/core/ui/relation-badge';
  import { m } from '$sailor/i18n';

  const {
    global,
    items,
    onAddNew,
    onDelete,
    onBulkDelete,
    sortable = false,
    nestable = false,
    onReorder,
    onNestChange,
    pagination
  }: {
    global: any;
    items: any[];
    onAddNew?: () => void;
    onDelete: (itemId: string) => void;
    onBulkDelete?: (itemIds: string[]) => void;
    sortable?: boolean;
    /** Render the parent/child tree rather than a flat list. `DataTable` builds
     *  it from `parent_id`; without this a nestable global loses its hierarchy. */
    nestable?: boolean;
    onReorder?: (items: any[]) => void;
    onNestChange?: (draggedId: string, newParentId: string | null, newIndex: number) => void;
    pagination?: PaginationData | null;
  } = $props();

  // Use composables for selection and delete functionality. SvelteKit
  // reuses the parent page component across `[slug]` changes, so without an
  // explicit reset the previous slug's selected IDs would persist against
  // the new list. `resetOnPathnameChange` clears selection on slug
  // transitions.
  const selection = useBulkSelection(() => items, { resetOnPathnameChange: true });

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
    onSuccess: () => {
      selection.clearSelection();
    }
  });

  function handleEditItem(id: string) {
    goto(`/sailor/globals/${global.slug}/${id}`);
  }

  // Generate columns based on fields with showInTable: true, or use defaults
  let tableColumns = $derived(
    Object.entries(global.fields)
      .filter(([_, field]) => (field as any).showInTable === true)
      .sort(([_, a], [__, b]) => ((a as any).order || 99) - ((b as any).order || 99))
      .map(([key, field]) => ({
        key,
        label: (field as any).label || (field as any).title || key
      }))
  );

  // If no table fields defined, use default columns
  let columns = $derived(
    tableColumns.length > 0
      ? [...tableColumns, { key: 'created_at', label: m.globals_table_col_created() }]
      : [
          { key: 'title', label: m.globals_table_col_title() },
          { key: 'slug', label: m.globals_table_col_slug() },
          { key: 'status', label: m.globals_table_col_status() },
          { key: 'updated_at', label: m.globals_table_col_last_updated() }
        ]
  );

  // First column should be clickable to open detail view — but only if it
  // holds something label-shaped. A `reverse` or `relation` column holds an
  // array, so making it the clickable label renders the array and skips the
  // branch that would have counted it. Falls back to `title`, which every
  // content table has.
  /**
   * Which columns render as a relation count. Shared with the tree's badges via
   * `relationBadgeFields`, so the two cannot disagree about what is countable —
   * they did, and a single-FK relation rendered a bare `0` here and no badge
   * there. Independent of `nestable`: a flat global still counts, it just has
   * nothing to roll up.
   */
  const countableKeys = $derived(
    new Set(relationBadgeFields(global.fields).map((field) => field.key))
  );

  /**
   * Relation counts rolled up through the tree, keyed `field -> item id`.
   *
   * A category with no edges of its own still contains everything its children
   * do, and roots render collapsed — so the direct count showed "0 produkter"
   * for a category holding thirty. Rolls up by union of ids rather than summing
   * counts, so a row filed under two sibling categories is counted once.
   *
   * Display only: the field's own value is untouched, so nothing here changes
   * what a `reverse` read returns or how `orderBy: 'relation'` sorts.
   */
  const rolledUpCounts = $derived.by(() => {
    const keys = columns.map((column) => column.key).filter((key) => countableKeys.has(key));
    const result = new Map<string, Map<string, number>>();
    if (keys.length === 0 || !nestable) return result;

    const childrenOf = new Map<string, any[]>();
    for (const item of items ?? []) {
      const parent = item?.parent_id;
      if (!parent) continue;
      (childrenOf.get(parent) ?? childrenOf.set(parent, []).get(parent)!).push(item);
    }

    for (const key of keys) {
      const counts = new Map<string, number>();
      // `seen` guards a corrupted parent chain; without it a cycle recurses
      // until the stack gives out.
      const collect = (item: any, seen: Set<string>): Set<string> => {
        const ids = new Set<string>();
        if (!item?.id || seen.has(item.id)) return ids;
        seen.add(item.id);
        for (const row of Array.isArray(item[key]) ? item[key] : []) {
          const id = row && typeof row === 'object' ? row.id : row;
          if (id) ids.add(id);
        }
        for (const child of childrenOf.get(item.id) ?? []) {
          for (const id of collect(child, seen)) ids.add(id);
        }
        counts.set(item.id, ids.size);
        return ids;
      };
      for (const item of items ?? []) collect(item, new Set());
      result.set(key, counts);
    }
    return result;
  });

  const LABEL_UNSUITABLE = new Set(['reverse', 'relation', 'array', 'file', 'tags']);
  let firstColumnKey = $derived(
    columns.find((column) => !LABEL_UNSUITABLE.has((global.fields as any)?.[column.key]?.type))
      ?.key ?? 'title'
  );
</script>

<div class="space-y-6">
  {#if items.length === 0}
    <div class="flex flex-col items-center justify-center py-12 text-center">
      <h3 class="mb-2 text-lg font-medium">
        {m.globals_table_empty_title({ plural: global.name.plural.toLowerCase() })}
      </h3>
      <p class="text-muted-foreground mb-6 max-w-md">
        {#if global.options?.readonly}
          {m.globals_table_empty_readonly({ plural: global.name.plural })}
        {:else}
          {m.globals_table_empty_text({ singular: global.name.singular.toLowerCase() })}
        {/if}
      </p>
      {#if onAddNew && !global.options?.readonly}
        <Button onclick={onAddNew}>
          <Plus class="mr-2 h-4 w-4" />
          {m.globals_table_add_button({ label: global.name.singular })}
        </Button>
      {/if}
    </div>
  {:else}
    <!-- Table Controls with BulkActionsBar -->
    <BulkActionsBar
      selectedCount={selection.selectedCount}
      totalCount={selection.totalCount}
      labels={{
        singular: global.name.singular.toLowerCase(),
        plural: global.name.plural.toLowerCase()
      }}
      actions={[
        {
          label: m.globals_table_delete_count({ count: selection.selectedCount }),
          variant: 'destructive',
          onClick: () => bulkDelete.initiateBulkDelete(selection.selectedItems)
        }
      ]}
    />

    <DataTable
      {items}
      {columns}
      {sortable}
      {nestable}
      {onReorder}
      {onNestChange}
      selectable={true}
      selectedItems={selection.selectedItems}
      onSelect={selection.handleSelect}
      onSelectAll={selection.handleSelectAll}
    >
      {#snippet cellRenderer(item: any, column: any)}
        {@const field = global.fields[column.key]}
        {@const fieldType = field?.type}

        {#if column.key === firstColumnKey}
          {@const label = item[column.key] || item.title || item.name || item.id}
          <button
            class="block w-full cursor-pointer truncate text-left font-medium hover:underline"
            title={label}
            onclick={() => handleEditItem(item.id)}
          >
            {label}
          </button>
        {:else if column.key === 'status'}
          {@const badge = getStatusBadge(item[column.key])}
          <Badge class={badge.classes}>{badge.label}</Badge>
        {:else if countableKeys.has(column.key)}
          <!-- Relations render as a count, forward or reverse. The list loaders
               already attach the values, so this costs no extra query. In a
               nestable global the count includes descendants — see
               `rolledUpCounts`. -->
          {@const direct = Array.isArray(item[column.key]) ? item[column.key].length : 0}
          {@const count = rolledUpCounts.get(column.key)?.get(item.id) ?? direct}
          <span class="text-muted-foreground text-sm tabular-nums">{count}</span>
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
          {formatTableDate(item[column.key], getUserLocale())}
        {:else}
          {item[column.key] || '-'}
        {/if}
      {/snippet}
      {#snippet empty()}
        <div class="text-center">
          <h3 class="text-sm font-medium">
            {m.globals_table_no_results({ plural: global.name.plural.toLowerCase() })}
          </h3>
        </div>
      {/snippet}
    </DataTable>

    {#if pagination}
      <Pagination
        page={pagination.page}
        pageSize={pagination.pageSize}
        totalItems={pagination.totalItems}
        totalPages={pagination.totalPages}
        hasNextPage={pagination.hasNextPage}
        hasPreviousPage={pagination.hasPreviousPage}
        useUrlNavigation={true}
        showTotalItems={true}
        showPageSizeSelector={true}
      />
    {/if}
  {/if}
</div>

<!-- Delete Confirmation Dialog -->
<DeleteDialog
  bind:open={bulkDelete.deleteDialogOpen}
  itemCount={bulkDelete.pendingDeleteItems.count}
  labels={{
    singular: global.name.singular.toLowerCase(),
    plural: global.name.plural.toLowerCase()
  }}
  onConfirm={bulkDelete.executeBulkDelete}
  isLoading={bulkDelete.deleteDialogLoading}
/>
