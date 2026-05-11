<script lang="ts">
  import * as Dialog from 'sailorcms/components/ui/dialog/index.js';
  import * as Select from 'sailorcms/components/ui/select/index.js';
  import { Button } from 'sailorcms/components/ui/button/index.js';
  import { Label } from 'sailorcms/components/ui/label/index.js';
  import { Trash2 } from '@lucide/svelte';
  import { m } from '$sailor/i18n';
  import { pluralize } from 'sailorcms/utils/ui/text';
  import { toast } from 'sailorcms/core/ui/toast';
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
          m.toast_items_deleted_count({
            count: userIds.length,
            items: pluralize(userIds.length, m.common_user_singular(), m.common_user_plural())
          })
        );
        open = false;
        onSuccess();
      } else {
        toast.error(result.error || m.toast_delete_users_failed());
      }
    } catch (error) {
      console.error('Failed to delete users:', error);
      toast.error(m.toast_delete_users_failed());
    } finally {
      isLoading = false;
    }
  }

  // Filter available users to exclude those being deleted
  const adoptionCandidates = $derived(availableUsers.filter((user) => !userIds.includes(user.id)));
</script>

<Dialog.Root bind:open onOpenChange={(newOpen) => !newOpen && handleCancel()}>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title class="flex items-center gap-2">
        <Trash2 class="h-5 w-5" />
        {m.users_bulk_delete_dialog_title({
          count: userIds.length,
          users: pluralize(userIds.length, m.common_user_singular(), m.common_user_plural())
        })}
      </Dialog.Title>
      <Dialog.Description>
        {m.users_bulk_delete_dialog_description({
          users: pluralize(userIds.length, m.common_user_singular(), m.common_user_plural())
        })}
      </Dialog.Description>
    </Dialog.Header>

    <div class="space-y-4 py-4">
      {#if adoptionCandidates.length > 0}
        <div class="space-y-3">
          <Label>{m.users_transfer_content_label()}</Label>
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
                {m.users_transfer_select_placeholder()}
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
              {m.users_transfer_will_transfer({
                name:
                  adoptionCandidates.find((u) => u.id === adoptingUserId)?.name ||
                  adoptionCandidates.find((u) => u.id === adoptingUserId)?.email ||
                  ''
              })}
            {:else}
              {m.users_bulk_transfer_will_delete({
                users: pluralize(userIds.length, m.common_user_singular(), m.common_user_plural())
              })}
            {/if}
          </p>
        </div>
      {:else}
        <p class="text-sm">{m.users_no_adoption_candidates()}</p>
      {/if}
    </div>

    <Dialog.Footer class="flex justify-end gap-3">
      <Button type="button" variant="outline" onclick={handleCancel} disabled={isLoading}>
        {m.common_cancel()}
      </Button>
      <Button type="button" variant="destructive" onclick={handleConfirm} disabled={isLoading}>
        {#if isLoading}
          <div
            class="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          ></div>
          {m.users_deleting()}
        {:else}
          {m.users_bulk_delete_button({
            count: userIds.length,
            users: pluralize(userIds.length, m.common_user_singular(), m.common_user_plural())
          })}
        {/if}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
