<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import Header from '$lib/components/sailor/Header.svelte';
  import Pagination from '$lib/components/sailor/Pagination.svelte';
  import DeleteDialog from '$lib/components/sailor/dialogs/DeleteDialog.svelte';
  import { Button } from '$lib/components/ui/button';
  import { toast } from '$sailor/core/ui/toast';
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import { restoreCollectionItem } from '../../../collections/data.remote.js';
  import { purgeCollectionItem } from '../../data.remote.js';
  import RecoverySection from '../../(components)/RecoverySection.svelte';
  import type { PageData } from './$types';

  const { data }: { data: PageData } = $props();

  let purgeDialogOpen = $state(false);
  let purgeDialogLoading = $state(false);
  let pendingPurge = $state<{ items: Array<{ id: string; title: string }>; label: string } | null>(
    null
  );

  async function bulkRestore(ids: string[]) {
    if (ids.length === 0) return;
    const results = await Promise.all(
      ids.map((id) =>
        restoreCollectionItem({ collectionSlug: data.slug, itemId: id }).catch(() => ({
          success: false,
          error: 'Failed to restore'
        }))
      )
    );
    const ok = results.filter((r) => r.success).length;
    const failed = results.length - ok;

    if (ok > 0 && failed === 0) {
      toast.success(`Restored ${ok} item${ok === 1 ? '' : 's'}`);
    } else if (ok > 0 && failed > 0) {
      toast.error(`Restored ${ok}, ${failed} failed`);
    } else {
      toast.error('Failed to restore');
    }

    await invalidateAll();
  }

  function initiatePurge(items: Array<{ id: string; title: string }>) {
    if (items.length === 0) return;
    pendingPurge = {
      items,
      label: items.length === 1 ? items[0].title : `${items.length} items`
    };
    purgeDialogOpen = true;
  }

  async function executePurge() {
    if (!pendingPurge) return;
    purgeDialogLoading = true;
    try {
      const results = await Promise.all(
        pendingPurge.items.map(async (it) => {
          try {
            return await purgeCollectionItem({
              collectionSlug: data.slug,
              itemId: it.id
            });
          } catch {
            return { success: false, error: 'Failed to delete' };
          }
        })
      );
      const ok = results.filter((r) => r.success).length;
      const failed = results.length - ok;

      if (ok > 0 && failed === 0) {
        toast.success(`Permanently deleted ${ok} item${ok === 1 ? '' : 's'}`);
      } else if (ok > 0 && failed > 0) {
        toast.error(`Deleted ${ok}, ${failed} failed`);
      } else {
        toast.error('Failed to permanently delete');
      }

      await invalidateAll();
      purgeDialogOpen = false;
      pendingPurge = null;
    } finally {
      purgeDialogLoading = false;
    }
  }
</script>

<svelte:head>
  <title>{data.label} - Recovery - Sailor CMS</title>
</svelte:head>

<div class="container mx-auto px-6">
  <div class="mb-2">
    <Button variant="ghost" size="sm" href="/sailor/recovery" class="px-2">
      <ChevronLeft class="mr-1 size-4" />
      Recovery
    </Button>
  </div>

  <Header
    title={data.label}
    description="Soft-deleted items. Restore to return them to the collection, or permanently delete."
    itemCount={data.pagination.totalItems}
    showCountBadge={true}
  />

  <RecoverySection
    itemType={data.itemType}
    items={data.items}
    canRestore={data.permissions.restore}
    canPurge={data.permissions.purge}
    onRestore={bulkRestore}
    onPurge={initiatePurge}
  />

  {#if data.pagination.totalPages > 1}
    <Pagination
      page={data.pagination.page}
      pageSize={data.pagination.pageSize}
      totalItems={data.pagination.totalItems}
      totalPages={data.pagination.totalPages}
      hasNextPage={data.pagination.hasNextPage}
      hasPreviousPage={data.pagination.hasPreviousPage}
      useUrlNavigation={true}
    />
  {/if}

  <DeleteDialog
    bind:open={purgeDialogOpen}
    itemCount={pendingPurge?.items.length ?? 1}
    itemType={data.itemType}
    itemName={pendingPurge?.label || ''}
    onConfirm={executePurge}
    isLoading={purgeDialogLoading}
    permanent={true}
  />
</div>
