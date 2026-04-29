<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { Button } from '$lib/components/ui/button';
  import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
  } from '$lib/components/ui/table';
  import Header from '$lib/components/sailor/Header.svelte';
  import DeleteDialog from '$lib/components/sailor/dialogs/DeleteDialog.svelte';
  import { toast } from '$sailor/core/ui/toast';
  import { formatTableDate } from '$sailor/core/utils/date';
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import Inbox from '@lucide/svelte/icons/inbox';
  import { restoreCollectionItem } from '../collections/data.remote.js';
  import { restoreGlobalItem } from '../globals/data.remote.js';
  import { restoreFile } from '$sailor/remote/files.remote.js';
  import { purgeCollectionItem, purgeGlobalItem, purgeFile } from './data.remote.js';
  import type { PageData } from './$types';

  const { data }: { data: PageData } = $props();

  let purgeDialogOpen = $state(false);
  let purgeDialogLoading = $state(false);
  let pendingPurge = $state<{
    kind: 'collection' | 'global' | 'file';
    slug?: string;
    id: string;
    title: string;
  } | null>(null);

  const totalItems = $derived(
    data.collections.reduce((n, g) => n + g.items.length, 0) +
      data.globals.reduce((n, g) => n + g.items.length, 0) +
      data.files.length
  );

  async function handleRestoreCollection(slug: string, id: string) {
    try {
      const result = await restoreCollectionItem({ collectionSlug: slug, itemId: id });
      if (result.success) {
        toast.success(result.message || 'Item restored');
        await invalidateAll();
      } else {
        toast.error(result.error || 'Failed to restore item');
      }
    } catch {
      toast.error('Failed to restore item');
    }
  }

  async function handleRestoreGlobal(slug: string, id: string) {
    try {
      const result = await restoreGlobalItem({ globalSlug: slug, itemId: id });
      if (result.success) {
        toast.success(result.message || 'Item restored');
        await invalidateAll();
      } else {
        toast.error(result.error || 'Failed to restore item');
      }
    } catch {
      toast.error('Failed to restore item');
    }
  }

  async function handleRestoreFile(id: string) {
    try {
      const result = await restoreFile({ fileId: id });
      if (result.success) {
        toast.success(result.message || 'File restored');
        await invalidateAll();
      } else {
        toast.error(result.error || 'Failed to restore file');
      }
    } catch {
      toast.error('Failed to restore file');
    }
  }

  function initiatePurge(
    kind: 'collection' | 'global' | 'file',
    id: string,
    title: string,
    slug?: string
  ) {
    pendingPurge = { kind, slug, id, title };
    purgeDialogOpen = true;
  }

  async function executePurge() {
    if (!pendingPurge) return;
    purgeDialogLoading = true;
    try {
      let result;
      if (pendingPurge.kind === 'collection') {
        result = await purgeCollectionItem({
          collectionSlug: pendingPurge.slug!,
          itemId: pendingPurge.id
        });
      } else if (pendingPurge.kind === 'global') {
        result = await purgeGlobalItem({
          globalSlug: pendingPurge.slug!,
          itemId: pendingPurge.id
        });
      } else {
        result = await purgeFile({ fileId: pendingPurge.id });
      }

      if (result.success) {
        toast.success(result.message || 'Permanently deleted');
        await invalidateAll();
        purgeDialogOpen = false;
        pendingPurge = null;
      } else {
        toast.error(result.error || 'Failed to permanently delete');
      }
    } catch {
      toast.error('Failed to permanently delete');
    } finally {
      purgeDialogLoading = false;
    }
  }
</script>

<svelte:head>
  <title>Recovery - Sailor CMS</title>
</svelte:head>

<div class="container mx-auto px-6">
  <Header
    title="Recovery"
    description="Restore deleted items, or permanently remove them. Restored items return to the root of their collection — re-organize as needed."
    itemCount={totalItems}
    showCountBadge={true}
  />

  {#if totalItems === 0}
    <div class="rounded-lg border p-12 text-center">
      <Inbox class="text-muted-foreground mx-auto my-2 size-8" />
      <h3 class="text-lg font-medium">Nothing to recover</h3>
      <p class="text-muted-foreground mt-1">
        Deleted content and files appear here so you can restore or permanently remove them.
      </p>
    </div>
  {/if}

  {#each data.collections as group}
    <section class="mb-8">
      <h2 class="mb-3 text-lg font-semibold">{group.label}</h2>
      <div class="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead class="w-48">Deleted</TableHead>
              <TableHead class="w-40">Deleted by</TableHead>
              <TableHead class="w-48 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {#each group.items as item}
              <TableRow>
                <TableCell class="font-medium">{item.title || item.id}</TableCell>
                <TableCell>{formatTableDate(item.deleted_at)}</TableCell>
                <TableCell>{item.deleted_by_name || '—'}</TableCell>
                <TableCell class="text-right">
                  <div class="flex justify-end gap-2">
                    {#if data.permissions.restore}
                      <Button
                        variant="outline"
                        size="sm"
                        onclick={() => handleRestoreCollection(group.slug, item.id)}
                      >
                        <RotateCcw class="mr-1 size-3.5" />
                        Restore
                      </Button>
                    {/if}
                    {#if data.permissions.purge}
                      <Button
                        variant="ghost"
                        size="sm"
                        onclick={() =>
                          initiatePurge('collection', item.id, item.title || item.id, group.slug)}
                      >
                        <Trash2 class="size-3.5" />
                      </Button>
                    {/if}
                  </div>
                </TableCell>
              </TableRow>
            {/each}
          </TableBody>
        </Table>
      </div>
    </section>
  {/each}

  {#each data.globals as group}
    <section class="mb-8">
      <h2 class="mb-3 text-lg font-semibold">{group.label}</h2>
      <div class="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead class="w-48">Deleted</TableHead>
              <TableHead class="w-40">Deleted by</TableHead>
              <TableHead class="w-48 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {#each group.items as item}
              <TableRow>
                <TableCell class="font-medium">{item.title || item.id}</TableCell>
                <TableCell>{formatTableDate(item.deleted_at)}</TableCell>
                <TableCell>{item.deleted_by_name || '—'}</TableCell>
                <TableCell class="text-right">
                  <div class="flex justify-end gap-2">
                    {#if data.permissions.restore}
                      <Button
                        variant="outline"
                        size="sm"
                        onclick={() => handleRestoreGlobal(group.slug, item.id)}
                      >
                        <RotateCcw class="mr-1 size-3.5" />
                        Restore
                      </Button>
                    {/if}
                    {#if data.permissions.purge}
                      <Button
                        variant="ghost"
                        size="sm"
                        onclick={() =>
                          initiatePurge('global', item.id, item.title || item.id, group.slug)}
                      >
                        <Trash2 class="size-3.5" />
                      </Button>
                    {/if}
                  </div>
                </TableCell>
              </TableRow>
            {/each}
          </TableBody>
        </Table>
      </div>
    </section>
  {/each}

  {#if data.files.length > 0}
    <section class="mb-8">
      <h2 class="mb-3 text-lg font-semibold">Files</h2>
      <div class="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead class="w-48">Deleted</TableHead>
              <TableHead class="w-40">Deleted by</TableHead>
              <TableHead class="w-48 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {#each data.files as file}
              <TableRow>
                <TableCell class="font-medium">{file.title || file.id}</TableCell>
                <TableCell>{formatTableDate(file.deleted_at)}</TableCell>
                <TableCell>{file.deleted_by_name || '—'}</TableCell>
                <TableCell class="text-right">
                  <div class="flex justify-end gap-2">
                    {#if data.permissions.restoreFiles}
                      <Button
                        variant="outline"
                        size="sm"
                        onclick={() => handleRestoreFile(file.id)}
                      >
                        <RotateCcw class="mr-1 size-3.5" />
                        Restore
                      </Button>
                    {/if}
                    {#if data.permissions.purgeFiles}
                      <Button
                        variant="ghost"
                        size="sm"
                        onclick={() => initiatePurge('file', file.id, file.title || file.id)}
                      >
                        <Trash2 class="size-3.5" />
                      </Button>
                    {/if}
                  </div>
                </TableCell>
              </TableRow>
            {/each}
          </TableBody>
        </Table>
      </div>
    </section>
  {/if}

  <DeleteDialog
    bind:open={purgeDialogOpen}
    itemCount={1}
    itemType="item"
    itemName={pendingPurge?.title || ''}
    onConfirm={executePurge}
    isLoading={purgeDialogLoading}
    permanent={true}
  />
</div>
