<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { History } from '@lucide/svelte';
  import { headerRevisions } from '$sailor/core/ui/header-revisions.svelte';
  import { m } from '$sailor/i18n';
</script>

{#if headerRevisions.openHandler}
  <Button
    type="button"
    variant="ghost"
    size="icon"
    title={headerRevisions.count > 0
      ? m.history_button_title_with_count({ count: headerRevisions.count })
      : m.history_button_title()}
    aria-label={m.history_aria_label()}
    class="hover:bg-muted h-8 w-8"
    onclick={() => headerRevisions.openHandler?.()}
  >
    <History class="h-4 w-4" />
  </Button>
{/if}
