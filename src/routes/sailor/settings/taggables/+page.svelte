<script lang="ts">
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import { Trash2 } from '@lucide/svelte';
  import { toast } from '$sailor/core/ui/toast';
  import { invalidateAll } from '$app/navigation';
  import DeleteDialog from '$lib/components/sailor/dialogs/DeleteDialog.svelte';
  import { deleteTag } from '$sailor/remote/tags.remote.js';
  import Header from '$lib/components/sailor/Header.svelte';

  let { data } = $props();

  let deleteDialogOpen = $state(false);
  let deleteDialogLoading = $state(false);
  let pendingDeleteTag = $state<{ id: string; name: string } | null>(null);

  // Group tags by entity type
  let tagsByEntityType = $derived(() => {
    const grouped: { [key: string]: typeof data.tags } = {};

    data.tags.forEach((tag) => {
      tag.usage.forEach((usage) => {
        if (!grouped[usage.entity_type]) {
          grouped[usage.entity_type] = [];
        }
        const existingTag = grouped[usage.entity_type].find((t) => t.id === tag.id);
        if (!existingTag) {
          grouped[usage.entity_type].push({
            ...tag,
            usage: [usage]
          });
        }
      });
    });

    return grouped;
  });

  function handleDeleteTag(tag: { id: string; name: string }) {
    pendingDeleteTag = tag;
    deleteDialogOpen = true;
  }

  async function executeDeleteTag() {
    if (!pendingDeleteTag) return;

    deleteDialogLoading = true;
    try {
      const result = await deleteTag({ tagId: pendingDeleteTag.id });

      if (result.success) {
        toast.success(`Tag "${pendingDeleteTag.name}" deleted successfully`);
        await invalidateAll();
        deleteDialogOpen = false;
      } else {
        throw new Error(result.error || 'Failed to delete tag');
      }
    } catch (error) {
      console.error('Failed to delete tag:', error);
      toast.error('Failed to delete tag');
    } finally {
      deleteDialogLoading = false;
    }
  }

  function getEntityTypeLabel(entityType: string): string {
    switch (entityType) {
      case 'file':
        return 'Media Files';
      case 'collection':
        return 'Collection Items';
      default:
        return entityType.charAt(0).toUpperCase() + entityType.slice(1);
    }
  }
</script>

<svelte:head>
  <title>Taggables - Sailor CMS</title>
</svelte:head>

<div class="container mx-auto px-6">
  <Header
    title="Taggables"
    description="Manage tags and view where they are being used across your content."
  />

  <!-- Tags Overview -->
  <div class="mt-6 space-y-4">
    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <div class="rounded-lg border p-4">
        <div class="text-2xl font-bold">{data.tags.length}</div>
        <p class="text-muted-foreground text-sm">Total Tags</p>
      </div>
      <div class="rounded-lg border p-4">
        <div class="text-2xl font-bold">
          {data.tags.filter((tag) => tag.usage.length > 0).length}
        </div>
        <p class="text-muted-foreground text-sm">Tags in Use</p>
      </div>
      <div class="rounded-lg border p-4">
        <div class="text-2xl font-bold">
          {data.tags.filter((tag) => tag.usage.length === 0).length}
        </div>
        <p class="text-muted-foreground text-sm">Unused Tags</p>
      </div>
    </div>
  </div>

  <!-- All Available Tags -->
  <div class="mt-8 space-y-3">
    <h2 class="text-lg font-medium">All Tags</h2>
    <div class="rounded-lg border">
      <div class="divide-y">
        {#each data.tags as tag (tag.id)}
          <div class="flex items-center justify-between p-4">
            <div class="flex items-center gap-3">
              <Badge variant="outline">{tag.name}</Badge>
              {#if tag.usage.length > 0}
                <span class="text-muted-foreground text-sm">
                  Used {tag.usage.reduce((sum, u) => sum + u.usage_count, 0)} time{tag.usage.reduce(
                    (sum, u) => sum + u.usage_count,
                    0
                  ) !== 1
                    ? 's'
                    : ''}
                  across {tag.usage.length} entity type{tag.usage.length !== 1 ? 's' : ''}
                </span>
              {:else}
                <span class="text-muted-foreground text-sm">Not used</span>
              {/if}
            </div>
            <Button
              variant="ghost"
              size="sm"
              class="text-muted-foreground hover:text-red-600"
              onclick={() => handleDeleteTag({ id: tag.id, name: tag.name })}
            >
              <Trash2 class="h-4 w-4" />
            </Button>
          </div>
        {/each}
      </div>
    </div>
  </div>

  <!-- Tags by Entity Type -->
  {#each Object.entries(tagsByEntityType) as [entityType, tags] (entityType)}
    <div class="mt-8 space-y-3">
      <h2 class="text-lg font-medium">{getEntityTypeLabel(entityType)} Usage</h2>
      <div class="rounded-lg border">
        <div class="divide-y">
          {#each tags as tag (tag.id)}
            <div class="flex items-center justify-between p-4">
              <div class="flex items-center gap-3">
                <Badge variant="outline">{tag.name}</Badge>
                <span class="text-muted-foreground text-sm">
                  Used {tag.usage[0].usage_count} time{tag.usage[0].usage_count !== 1 ? 's' : ''}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                class="text-muted-foreground hover:text-red-600"
                onclick={() => handleDeleteTag({ id: tag.id, name: tag.name })}
              >
                <Trash2 class="h-4 w-4" />
              </Button>
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/each}

  <!-- No tags at all -->
  {#if data.tags.length === 0}
    <div class="py-8 text-center">
      <p class="text-muted-foreground">No tags found. Tags will appear here as you create them.</p>
    </div>
  {/if}
</div>

<!-- Delete Confirmation Dialog -->
<DeleteDialog
  bind:open={deleteDialogOpen}
  itemCount={1}
  itemType="tag"
  itemName={pendingDeleteTag?.name}
  onConfirm={executeDeleteTag}
  isLoading={deleteDialogLoading}
/>
