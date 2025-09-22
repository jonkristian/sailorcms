<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Select from '$lib/components/ui/select';
  import { Button } from '$lib/components/ui/button';
  import { Label } from '$lib/components/ui/label';
  import { Trash2 } from '@lucide/svelte';
  import { toast } from '$sailor/core/ui/toast';
  import type { User } from '$sailor/generated/types';
  import { bulkDeleteUsers } from '../data.remote.js';

  let {
    open = $bindable(),
    userIds = [],
    availableUsers = [],
    onSuccess = () => {},
    onCancel = () => {},
    isLoading = $bindable(false)
  }: {
    open?: boolean;
    userIds?: string[];
    availableUsers?: User[];
    onSuccess?: () => void;
    onCancel?: () => void;
    isLoading?: boolean;
  } = $props();

  let adoptingUserId = $state('');

  function handleCancel() {
    if (isLoading) return;
    open = false;
    onCancel();
  }

  async function handleConfirm() {
    if (isLoading) return;

    isLoading = true;
    try {
      const result = await bulkDeleteUsers({
        ids: userIds,
        adoptingUserId: adoptingUserId || undefined
      });

      if (result.success) {
        toast.success(
          result.message ||
            `${userIds.length} user${userIds.length === 1 ? '' : 's'} deleted successfully`
        );
        open = false;
        onSuccess();
      } else {
        toast.error(result.error || 'Failed to delete users');
      }
    } catch (error) {
      console.error('Failed to delete users:', error);
      toast.error('Failed to delete users');
    } finally {
      isLoading = false;
    }
  }

  // Filter available users to exclude those being deleted
  const adoptionCandidates = $derived(availableUsers.filter((user) => !userIds.includes(user.id)));
</script>

<Dialog.Root bind:open onOpenChange={(newOpen) => !newOpen && handleCancel()}>
  <Dialog.Content class="sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title class="flex items-center gap-2">
        <Trash2 class="h-5 w-5" />
        Delete {userIds.length} User{userIds.length === 1 ? '' : 's'}
      </Dialog.Title>
      <Dialog.Description>
        This action cannot be undone. The selected user{userIds.length === 1 ? '' : 's'} will be permanently
        removed.
      </Dialog.Description>
    </Dialog.Header>

    <div class="space-y-4 py-4">
      {#if adoptionCandidates.length > 0}
        <div class="space-y-3">
          <Label>Transfer content to:</Label>
          <Select.Root
            type="single"
            value={adoptingUserId}
            onValueChange={(value) => {
              adoptingUserId = value || '';
            }}
          >
            <Select.Trigger class="w-full">
              {#if adoptingUserId}
                {adoptionCandidates.find((u) => u.id === adoptingUserId)?.name ||
                  adoptionCandidates.find((u) => u.id === adoptingUserId)?.email}
              {:else}
                Select user (or delete all content)
              {/if}
            </Select.Trigger>
            <Select.Content>
              {#each adoptionCandidates as user (user.id)}
                <Select.Item value={user.id}>
                  {user.name || user.email}
                </Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>

          <p class="text-muted-foreground text-xs">
            {#if adoptingUserId}
              Content will be transferred to {adoptionCandidates.find(
                (u) => u.id === adoptingUserId
              )?.name || adoptionCandidates.find((u) => u.id === adoptingUserId)?.email}.
            {:else}
              All content created by selected user{userIds.length === 1 ? '' : 's'} will be permanently
              deleted.
            {/if}
          </p>
        </div>
      {:else}
        <p class="text-sm">All content will be permanently deleted.</p>
      {/if}
    </div>

    <Dialog.Footer class="flex justify-end gap-3">
      <Button type="button" variant="outline" onclick={handleCancel} disabled={isLoading}>
        Cancel
      </Button>
      <Button type="button" variant="destructive" onclick={handleConfirm} disabled={isLoading}>
        {#if isLoading}
          <div
            class="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          ></div>
          Deleting...
        {:else}
          Delete {userIds.length} User{userIds.length === 1 ? '' : 's'}
        {/if}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
