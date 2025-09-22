<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import { Plus, Save, ChevronDown, ChevronUp } from '@lucide/svelte';

  // All props are optional for flexibility
  const {
    title = '',
    description = '',
    itemCount = 0,
    showAddButton = false,
    showCountBadge = false,
    addButtonAction = undefined,
    showSaveButton = false,
    saveButtonAction = undefined,
    showExpandCollapseButton = false,
    expandCollapseAction = undefined,
    submitting = false
  } = $props();

  let allExpanded = $state(true);

  function handleExpandCollapse() {
    allExpanded = !allExpanded;
    if (expandCollapseAction) {
      expandCollapseAction(allExpanded);
    }
  }
</script>

<div class="mb-6">
  <div class="flex items-center justify-between">
    <div>
      <div class="flex items-center space-x-3">
        <h1 class="text-3xl font-bold tracking-tight">{title}</h1>
        {#if showAddButton}
          <Button
            variant="default"
            size="icon"
            class="h-6 w-6 rounded-full"
            onclick={addButtonAction}
            aria-label="Add new"
            disabled={submitting}
          >
            <Plus class="h-3 w-3" />
          </Button>
        {/if}
        {#if showCountBadge && itemCount !== undefined}
          <Badge variant="secondary">{itemCount} item{itemCount !== 1 ? 's' : ''}</Badge>
        {/if}
      </div>
      {#if description}
        <p class="text-muted-foreground">{description}</p>
      {/if}
    </div>

    <!-- Action buttons on the right -->
    {#if showSaveButton || showExpandCollapseButton}
      <div class="flex items-center gap-2">
        {#if showExpandCollapseButton}
          <Button
            variant="outline"
            size="sm"
            onclick={handleExpandCollapse}
            disabled={submitting}
            aria-label={allExpanded ? 'Collapse all' : 'Expand all'}
          >
            {#if allExpanded}
              <ChevronUp class="mr-2 h-4 w-4" />
              Collapse All
            {:else}
              <ChevronDown class="mr-2 h-4 w-4" />
              Expand All
            {/if}
          </Button>
        {/if}
        {#if showSaveButton}
          <Button variant="default" size="sm" onclick={saveButtonAction} disabled={submitting}>
            {#if submitting}
              <div
                class="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
              ></div>
            {:else}
              <Save class="mr-2 h-4 w-4" />
            {/if}
            Save Changes
          </Button>
        {/if}
      </div>
    {/if}
  </div>
</div>
