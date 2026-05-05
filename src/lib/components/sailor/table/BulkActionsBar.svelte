<script lang="ts">
  import { Button } from 'sailorcms/components/ui/button/index.js';
  import { m } from '$sailor/i18n';
  import type { Snippet } from 'svelte';

  let {
    selectedCount = 0,
    totalCount = 0,
    labels = { singular: 'item', plural: 'items' },
    actions = [],
    filters,
    children,
    extraActions
  }: {
    selectedCount: number;
    totalCount: number;
    labels?: { singular: string; plural: string };
    actions?: Array<{
      label: string;
      variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
      onClick: () => void;
    }>;
    filters?: Snippet;
    children?: Snippet;
    extraActions?: Snippet;
  } = $props();
</script>

<div class="mb-4 flex items-center justify-between">
  <!-- Left side: Selection Counter and Filters/Search -->
  <div class="flex items-center gap-4">
    {#if selectedCount > 0}
      <div class="text-muted-foreground text-sm">
        {m.bulk_selection_count({
          selected: selectedCount,
          total: totalCount,
          items: totalCount === 1 ? labels.singular : labels.plural
        })}
      </div>
    {:else}
      <!-- Show filters when no selection -->
      {#if filters}
        {@render filters()}
      {:else if children}
        {@render children()}
      {/if}
    {/if}
  </div>

  <!-- Right side: Actions -->
  <div class="flex items-center gap-2">
    {#if extraActions}
      {@render extraActions()}
    {/if}
    {#each actions as action}
      <Button
        variant={action.variant || 'default'}
        class="h-9"
        onclick={action.onClick}
        disabled={selectedCount === 0}
      >
        {action.label}
      </Button>
    {/each}
  </div>
</div>
