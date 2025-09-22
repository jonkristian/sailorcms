<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import type { Snippet } from 'svelte';

  let {
    selectedCount = 0,
    totalCount = 0,
    itemType = 'item',
    actions = [],
    filters,
    children,
    extraActions
  } = $props<{
    selectedCount: number;
    totalCount: number;
    itemType?: string;
    actions?: Array<{
      label: string;
      variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
      onClick: () => void;
    }>;
    filters?: Snippet;
    children?: Snippet;
    extraActions?: Snippet;
  }>();

  const pluralItemType = $derived(itemType + (itemType.endsWith('s') ? '' : 's'));
</script>

<div class="mb-4 flex items-center justify-between">
  <!-- Left side: Selection Counter and Filters/Search -->
  <div class="flex items-center gap-4">
    {#if selectedCount > 0}
      <div class="text-muted-foreground text-sm">
        {selectedCount} of {totalCount}
        {totalCount === 1 ? itemType : pluralItemType} selected
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
