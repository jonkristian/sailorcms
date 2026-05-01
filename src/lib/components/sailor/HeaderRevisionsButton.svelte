<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { History } from '@lucide/svelte';
  import { headerRevisions } from '$sailor/core/ui/header-revisions.svelte';
</script>

{#if headerRevisions.openHandler}
  <Button
    type="button"
    variant="ghost"
    size="icon"
    title={`Revision history${headerRevisions.count > 0 ? ` (${headerRevisions.count})` : ''}`}
    aria-label="Revision history"
    class="hover:bg-muted h-8 w-8"
    onclick={() => headerRevisions.openHandler?.()}
  >
    <History class="h-4 w-4" />
  </Button>
{/if}
