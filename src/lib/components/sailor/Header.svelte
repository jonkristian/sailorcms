<script lang="ts">
  import { Button } from 'sailorcms/components/ui/button/index.js';
  import { Badge } from 'sailorcms/components/ui/badge/index.js';
  import { Plus, Save, ChevronDown, ChevronUp } from '@lucide/svelte';
  import { m } from '$sailor/i18n';
  import { pluralize } from 'sailorcms/utils/ui/text';

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

  // Items render collapsed by default in the inline/nested views, so the
  // toggle should offer "Expand All" first, not "Collapse All".
  let allExpanded = $state(false);

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
            aria-label={m.header_add_button_aria()}
            disabled={submitting}
          >
            <Plus class="h-3 w-3" />
          </Button>
        {/if}
        {#if showCountBadge && itemCount !== undefined}
          <Badge variant="secondary"
            >{itemCount}
            {pluralize(itemCount, m.common_item_singular(), m.common_item_plural())}</Badge
          >
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
            aria-label={allExpanded ? m.header_collapse_all_aria() : m.header_expand_all_aria()}
          >
            {#if allExpanded}
              <ChevronUp class="mr-2 h-4 w-4" />
              {m.header_collapse_all()}
            {:else}
              <ChevronDown class="mr-2 h-4 w-4" />
              {m.header_expand_all()}
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
            {m.header_save_changes()}
          </Button>
        {/if}
      </div>
    {/if}
  </div>
</div>
