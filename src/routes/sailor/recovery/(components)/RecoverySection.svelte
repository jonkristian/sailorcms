<script lang="ts">
  import { Button } from 'sailorcms/components/ui/button/index.js';
  import DataTable from 'sailorcms/components/sailor/table/DataTable.svelte';
  import BulkActionsBar from 'sailorcms/components/sailor/table/BulkActionsBar.svelte';
  import { useBulkSelection } from 'sailorcms/composables/useBulkSelection.svelte';
  import { formatTableDate } from 'sailorcms/core/utils/date';
  import { getUserLocale } from 'sailorcms/core/ui/user-locale';
  import FileWithControls from 'sailorcms/components/sailor/FileWithControls.svelte';
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import { m } from '$sailor/i18n';

  type Item = {
    id: string;
    title: string;
    deleted_at: any;
    deleted_by_name: string | null;
    mime_type?: string | null;
    url?: string;
  };

  let {
    label,
    titleColumnLabel = m.recovery_col_title(),
    labels = { singular: 'item', plural: 'items' },
    items,
    canRestore,
    canPurge,
    showPreview = false,
    onRestore,
    onPurge
  }: {
    label?: string;
    titleColumnLabel?: string;
    labels?: { singular: string; plural: string };
    items: Item[];
    canRestore: boolean;
    canPurge: boolean;
    showPreview?: boolean;
    onRestore: (ids: string[]) => Promise<void> | void;
    onPurge: (items: Array<{ id: string; title: string }>) => void;
  } = $props();

  // Recovery section is mounted under `/sailor/recovery/{collections,globals}/[slug]`
  // — opt into pathname-based selection reset so switching `[slug]` clears.
  const selection = useBulkSelection(() => items, { resetOnPathnameChange: true });

  const columns = $derived(
    [
      showPreview ? { key: 'preview', label: '', width: 80 } : null,
      { key: 'title', label: titleColumnLabel },
      { key: 'deleted_at', label: m.recovery_col_deleted_at(), width: 192 },
      { key: 'deleted_by_name', label: m.recovery_col_deleted_by(), width: 160 },
      { key: 'actions', label: '', width: 192 }
    ].filter((c): c is { key: string; label: string; width?: number } => c !== null)
  );

  async function handleBulkRestore() {
    const ids = [...selection.selectedItems];
    await onRestore(ids);
    selection.clearSelection();
  }

  function handleBulkPurge() {
    const ids = new Set(selection.selectedItems);
    const picked = items.filter((i) => ids.has(i.id)).map((i) => ({ id: i.id, title: i.title }));
    onPurge(picked);
  }

  const actions = $derived.by(() => {
    const list: Array<{
      label: string;
      variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
      onClick: () => void;
    }> = [];
    if (canRestore) {
      list.push({
        label: m.recovery_action_restore_count({ count: selection.selectedCount }),
        variant: 'outline',
        onClick: handleBulkRestore
      });
    }
    if (canPurge) {
      list.push({
        label: m.recovery_action_delete_count({ count: selection.selectedCount }),
        variant: 'destructive',
        onClick: handleBulkPurge
      });
    }
    return list;
  });
</script>

<section class="space-y-3">
  <BulkActionsBar
    selectedCount={selection.selectedCount}
    totalCount={selection.totalCount}
    {labels}
    {actions}
  >
    {#if label}
      <h2 class="text-lg font-semibold">{label}</h2>
    {/if}
  </BulkActionsBar>

  <DataTable
    {items}
    {columns}
    selectable={true}
    selectedItems={selection.selectedItems}
    onSelect={selection.handleSelect}
    onSelectAll={selection.handleSelectAll}
  >
    {#snippet cellRenderer(item: Item, column: { key: string })}
      {#if column.key === 'preview'}
        <div class="h-16 w-16 shrink-0 overflow-hidden">
          <FileWithControls
            src={item.mime_type?.startsWith('image/') ? (item.url ?? '') : ''}
            alt={item.title}
            filename={item.title}
            mimeType={item.mime_type ?? ''}
            aspectRatio="aspect-square"
            controls={[]}
            showFilename={false}
          />
        </div>
      {:else if column.key === 'title'}
        <span class="font-medium">{item.title || item.id}</span>
      {:else if column.key === 'deleted_at'}
        {formatTableDate(item.deleted_at, getUserLocale())}
      {:else if column.key === 'deleted_by_name'}
        {item.deleted_by_name || '—'}
      {:else if column.key === 'actions'}
        <div class="flex justify-end gap-2">
          {#if canRestore}
            <Button variant="outline" size="sm" onclick={() => onRestore([item.id])}>
              <RotateCcw class="mr-1 size-3.5" />
              {m.recovery_action_restore()}
            </Button>
          {/if}
        </div>
      {/if}
    {/snippet}
  </DataTable>
</section>
