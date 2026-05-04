<script lang="ts">
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import { Trash2 } from '@lucide/svelte';
  import { toast } from '$sailor/core/ui/toast';
  import { invalidateAll } from '$app/navigation';
  import DeleteDialog from '$lib/components/sailor/dialogs/DeleteDialog.svelte';
  import { deleteTag } from '$sailor/remote/tags.remote.js';
  import Header from '$lib/components/sailor/Header.svelte';
  import { m } from '$sailor/i18n';
  import { pluralize } from '$sailor/utils/ui/text';

  let { data } = $props();

  let deleteDialogOpen = $state(false);
  let deleteDialogLoading = $state(false);
  let pendingDeleteTag: { id: string; name: string } | null = $state(null);

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
        toast.success(m.toast_tag_deleted_named({ name: pendingDeleteTag.name }));
        await invalidateAll();
        deleteDialogOpen = false;
      } else {
        throw new Error(result.error || m.toast_delete_tag_failed());
      }
    } catch (error) {
      console.error('Failed to delete tag:', error);
      toast.error(m.toast_delete_tag_failed());
    } finally {
      deleteDialogLoading = false;
    }
  }

  function getEntityTypeLabel(entityType: string): string {
    switch (entityType) {
      case 'file':
        return m.settings_taggables_entity_files();
      case 'collection':
        return m.settings_taggables_entity_collections();
      default:
        return entityType.charAt(0).toUpperCase() + entityType.slice(1);
    }
  }
</script>

<svelte:head>
  <title>{m.settings_taggables_page_title()} - Sailor CMS</title>
</svelte:head>

<div class="container mx-auto px-6">
  <Header
    title={m.settings_taggables_page_title()}
    description={m.settings_taggables_description()}
  />

  <!-- Tags Overview -->
  <div class="mt-6 space-y-4">
    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <div class="rounded-lg border p-4">
        <div class="text-2xl font-bold">{data.tags.length}</div>
        <p class="text-muted-foreground text-sm">{m.settings_taggables_total()}</p>
      </div>
      <div class="rounded-lg border p-4">
        <div class="text-2xl font-bold">
          {data.tags.filter((tag) => tag.usage.length > 0).length}
        </div>
        <p class="text-muted-foreground text-sm">{m.settings_taggables_in_use()}</p>
      </div>
      <div class="rounded-lg border p-4">
        <div class="text-2xl font-bold">
          {data.tags.filter((tag) => tag.usage.length === 0).length}
        </div>
        <p class="text-muted-foreground text-sm">{m.settings_taggables_unused()}</p>
      </div>
    </div>
  </div>

  <!-- All Available Tags -->
  <div class="mt-8 space-y-3">
    <h2 class="text-lg font-medium">{m.settings_taggables_all_heading()}</h2>
    <div class="rounded-lg border">
      <div class="divide-y">
        {#each data.tags as tag (tag.id)}
          {@const totalUses = tag.usage.reduce((sum, u) => sum + u.usage_count, 0)}
          <div class="flex items-center justify-between p-4">
            <div class="flex items-center gap-3">
              <Badge variant="outline">{tag.name}</Badge>
              {#if tag.usage.length > 0}
                <span class="text-muted-foreground text-sm">
                  {m.settings_taggables_usage_summary({
                    count: totalUses,
                    times: pluralize(totalUses, m.common_time_singular(), m.common_time_plural()),
                    typeCount: tag.usage.length,
                    types: pluralize(
                      tag.usage.length,
                      m.common_entity_type_singular(),
                      m.common_entity_type_plural()
                    )
                  })}
                </span>
              {:else}
                <span class="text-muted-foreground text-sm">{m.settings_taggables_not_used()}</span>
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
      <h2 class="text-lg font-medium">
        {m.settings_taggables_usage_heading({ label: getEntityTypeLabel(entityType) })}
      </h2>
      <div class="rounded-lg border">
        <div class="divide-y">
          {#each tags as tag (tag.id)}
            <div class="flex items-center justify-between p-4">
              <div class="flex items-center gap-3">
                <Badge variant="outline">{tag.name}</Badge>
                <span class="text-muted-foreground text-sm">
                  {m.settings_taggables_used_count({
                    count: tag.usage[0].usage_count,
                    times: pluralize(
                      tag.usage[0].usage_count,
                      m.common_time_singular(),
                      m.common_time_plural()
                    )
                  })}
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
      <p class="text-muted-foreground">{m.settings_taggables_no_tags()}</p>
    </div>
  {/if}
</div>

<!-- Delete Confirmation Dialog -->
<DeleteDialog
  bind:open={deleteDialogOpen}
  itemCount={1}
  labels={{ singular: m.common_tag_singular(), plural: m.common_tag_plural() }}
  itemName={pendingDeleteTag?.name}
  onConfirm={executeDeleteTag}
  isLoading={deleteDialogLoading}
/>
