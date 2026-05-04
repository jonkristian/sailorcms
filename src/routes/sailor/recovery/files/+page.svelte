<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import Header from 'sailorcms/components/sailor/Header.svelte';
  import Pagination from 'sailorcms/components/sailor/Pagination.svelte';
  import DeleteDialog from 'sailorcms/components/sailor/dialogs/DeleteDialog.svelte';
  import { Button } from '$lib/components/ui/button';
  import { toast } from '$sailor/core/ui/toast';
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import { restoreFile } from '$sailor/remote/files.remote.js';
  import { purgeFile } from '../data.remote.js';
  import RecoverySection from '../(components)/RecoverySection.svelte';
  import { m } from '$sailor/i18n';
  import { pluralize } from '$sailor/utils/ui/text';
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
        restoreFile({ fileId: id }).catch(() => ({
          success: false,
          error: 'Failed to restore'
        }))
      )
    );
    const ok = results.filter((r) => r.success).length;
    const failed = results.length - ok;

    if (ok > 0 && failed === 0) {
      toast.success(
        m.toast_items_restored({
          count: ok,
          items: pluralize(ok, m.common_file_singular(), m.common_file_plural())
        })
      );
    } else if (ok > 0 && failed > 0) {
      toast.error(m.toast_restore_partial({ ok, failed }));
    } else {
      toast.error(m.toast_restore_failed());
    }

    await invalidateAll();
  }

  function initiatePurge(items: Array<{ id: string; title: string }>) {
    if (items.length === 0) return;
    pendingPurge = {
      items,
      label: items.length === 1 ? items[0].title : `${items.length} files`
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
            return await purgeFile({ fileId: it.id });
          } catch {
            return { success: false, error: 'Failed to delete' };
          }
        })
      );
      const ok = results.filter((r) => r.success).length;
      const failed = results.length - ok;

      if (ok > 0 && failed === 0) {
        toast.success(
          m.toast_items_permanent_deleted({
            count: ok,
            items: pluralize(ok, m.common_file_singular(), m.common_file_plural())
          })
        );
      } else if (ok > 0 && failed > 0) {
        toast.error(m.toast_delete_partial({ ok, failed }));
      } else {
        toast.error(m.toast_permanent_delete_failed());
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
  <title>{m.recovery_breadcrumb_title({ label: m.recovery_files_title() })} - Sailor CMS</title>
</svelte:head>

<div class="container mx-auto px-6">
  <div class="mb-2">
    <Button variant="ghost" size="sm" href="/sailor/recovery" class="px-2">
      <ChevronLeft class="mr-1 size-4" />
      {m.recovery_back_button()}
    </Button>
  </div>

  <Header
    title={m.recovery_files_title()}
    description={m.recovery_files_description()}
    itemCount={data.pagination.totalItems}
    showCountBadge={true}
  />

  <RecoverySection
    titleColumnLabel={m.recovery_files_column_name()}
    labels={{ singular: m.common_file_singular(), plural: m.common_file_plural() }}
    showPreview={true}
    items={data.files}
    canRestore={data.permissions.restoreFiles}
    canPurge={data.permissions.purgeFiles}
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
    labels={{ singular: m.common_file_singular(), plural: m.common_file_plural() }}
    itemName={pendingPurge?.label || ''}
    onConfirm={executePurge}
    isLoading={purgeDialogLoading}
    permanent={true}
  />
</div>
