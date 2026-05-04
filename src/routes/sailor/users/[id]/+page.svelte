<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { enhance, applyAction } from '$app/forms';
  import { page } from '$app/state';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import * as Select from '$lib/components/ui/select';
  import * as Card from '$lib/components/ui/card';
  import { Badge } from '$lib/components/ui/badge';
  import { Save, Trash2, Shield, Copy, User as UserIcon, AlertTriangle } from '@lucide/svelte';
  import * as Dialog from '$lib/components/ui/dialog';
  import { toast } from '$sailor/core/ui/toast';
  import { m } from '$sailor/i18n';
  import { formatDate } from '$sailor/core/utils/date';
  import { getUserLocale } from '$sailor/core/ui/user-locale';
  import { getRoleColor, copyUserId, shortenUserId } from '$lib/sailor/core/utils/user';
  import type { PageData, ActionData } from './$types';
  import Header from 'sailorcms/components/sailor/Header.svelte';

  // Extract the type of availableUsers from PageData
  type AvailableUser = NonNullable<PageData['availableUsers']>[number];

  const { data, form }: { data: PageData; form?: ActionData } = $props();

  let deleteDialogOpen = $state(false);
  let roleChangeWarningOpen = $state(false);
  let deleteLoading = $state(false);
  let adoptingUserId = $state('');

  const roleOptions = $derived([
    {
      value: 'user',
      label: m.users_role_user_label(),
      description: m.users_role_user_description()
    },
    {
      value: 'editor',
      label: m.users_role_editor_label(),
      description: m.users_role_editor_description()
    },
    {
      value: 'admin',
      label: m.users_role_admin_label(),
      description: m.users_role_admin_description()
    }
  ]);

  let formData = $state({
    // svelte-ignore state_referenced_locally
    name: form?.values?.name || data.targetUser?.name || '',
    // svelte-ignore state_referenced_locally
    email: form?.values?.email || data.targetUser?.email || '',
    password: '',
    confirmPassword: '',
    // svelte-ignore state_referenced_locally
    role: form?.values?.role || data.targetUser?.role || 'user'
  });

  function handleSubmit(event: SubmitEvent) {
    // Client-side validation for password confirmation
    if (
      (data.isCreateMode || formData.password) &&
      formData.password !== formData.confirmPassword
    ) {
      event.preventDefault();
      toast.error(m.toast_passwords_no_match());
      return;
    }

    // Warn if admin is demoting themselves
    if (
      !data.isCreateMode &&
      data.targetUser?.role === 'admin' &&
      formData.role !== 'admin' &&
      data.targetUser?.id === page.data.user?.id
    ) {
      event.preventDefault();
      roleChangeWarningOpen = true;
      return;
    }
  }

  async function confirmRoleChange() {
    roleChangeWarningOpen = false;
    // Resubmit the form without the check
    const form = document.querySelector('form');
    if (form) {
      form.dispatchEvent(new Event('submit', { cancelable: false }));
    }
  }
</script>

<svelte:head>
  <title>{data.isCreateMode ? m.users_create_title() : m.users_edit_title()} - Sailor CMS</title>
</svelte:head>

<div class="container mx-auto px-6">
  <div class="space-y-6">
    <Header
      title={data.isCreateMode ? m.users_create_title() : m.users_edit_title()}
      description={m.users_form_description()}
    />

    <div class="flex gap-6">
      <!-- Main Content -->
      <div class="flex-1">
        <div class="space-y-6">
          <Card.Root>
            <Card.Header>
              <Card.Title class="flex items-center gap-2">
                <UserIcon class="h-5 w-5" />
                {m.users_card_title()}
              </Card.Title>
              <Card.Description>
                {data.isCreateMode
                  ? m.users_create_card_description()
                  : m.users_edit_card_description()}
              </Card.Description>
            </Card.Header>
            <Card.Content>
              <form
                action="?/{data.isCreateMode ? 'create' : 'update'}"
                method="POST"
                use:enhance={() => {
                  return async ({ result }) => {
                    if (result.type === 'success' && result.data?.success) {
                      toast.success(result.data.message as string);
                      // Refresh page data to update sidebar info
                      await invalidateAll();
                    } else if (result.type === 'failure') {
                      toast.error((result.data?.error as string) || m.toast_generic_error());
                      await applyAction(result);
                    }
                  };
                }}
                onsubmit={handleSubmit}
                class="space-y-4"
              >
                <!-- Name -->
                <div class="space-y-2">
                  <Label for="name">{m.users_field_name()}</Label>
                  <Input
                    id="name"
                    name="name"
                    bind:value={formData.name}
                    placeholder={m.users_field_name_placeholder()}
                    required
                  />
                </div>

                <!-- Email -->
                <div class="space-y-2">
                  <Label for="email">{m.users_field_email()}</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    bind:value={formData.email}
                    placeholder={m.users_field_email_placeholder()}
                    required
                  />
                </div>

                <hr class="my-6" />

                <!-- Password -->
                <div class="space-y-2">
                  <Label for="password"
                    >{data.isCreateMode
                      ? m.users_field_password()
                      : m.users_field_new_password()}</Label
                  >
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    bind:value={formData.password}
                    placeholder={data.isCreateMode
                      ? m.users_field_password_create_placeholder()
                      : m.users_field_password_edit_placeholder()}
                    required={data.isCreateMode}
                  />
                  <p class="text-muted-foreground text-sm">
                    {data.isCreateMode
                      ? m.users_field_password_create_help()
                      : m.users_field_password_edit_help()}
                  </p>
                </div>

                <!-- Confirm Password -->
                <div class="space-y-2">
                  <Label for="confirmPassword">
                    {data.isCreateMode
                      ? m.users_field_confirm_password()
                      : m.users_field_confirm_new_password()}
                  </Label>
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    bind:value={formData.confirmPassword}
                    placeholder={data.isCreateMode
                      ? m.users_field_confirm_password_create_placeholder()
                      : m.users_field_confirm_password_edit_placeholder()}
                    required={data.isCreateMode || formData.password !== ''}
                    class={formData.confirmPassword &&
                    formData.password !== formData.confirmPassword
                      ? 'border-red-500'
                      : ''}
                  />
                  {#if formData.confirmPassword && formData.password !== formData.confirmPassword}
                    <p class="text-sm text-red-500">{m.toast_passwords_no_match()}</p>
                  {/if}
                </div>

                <!-- Role -->
                <div class="space-y-2">
                  <Label for="role">{m.users_field_role()}</Label>
                  <Select.Root
                    type="single"
                    value={formData.role}
                    onValueChange={(value) => {
                      formData.role = value || 'user';
                    }}
                  >
                    <Select.Trigger>
                      {roleOptions.find((option) => option.value === formData.role)?.label ||
                        m.users_select_role()}
                    </Select.Trigger>
                    <Select.Content>
                      {#each roleOptions as option (option.value)}
                        <Select.Item value={option.value}>
                          <div class="flex flex-col">
                            <span class="font-medium">{option.label}</span>
                            <span class="text-muted-foreground text-xs">{option.description}</span>
                          </div>
                        </Select.Item>
                      {/each}
                    </Select.Content>
                  </Select.Root>
                  <input type="hidden" name="role" bind:value={formData.role} />
                </div>

                <!-- Error Display -->
                {#if form?.error}
                  <div class="rounded-md border border-red-200 bg-red-50 p-3">
                    <p class="text-sm text-red-800">{form.error}</p>
                  </div>
                {/if}

                <!-- Actions -->
                <div class="flex items-center gap-3 pt-4">
                  <Button type="submit">
                    <Save class="mr-2 h-4 w-4" />
                    {data.isCreateMode ? m.users_create_button() : m.users_update_button()}
                  </Button>
                  <Button type="button" variant="outline" onclick={() => goto('/sailor/users')}>
                    {m.common_cancel()}
                  </Button>
                </div>
              </form>
            </Card.Content>
          </Card.Root>
        </div>
      </div>

      <!-- Right Sidebar -->
      <div class="bg-background w-70 border-l">
        <div class="h-full overflow-y-auto pt-4 pl-4">
          <div class="space-y-6">
            {#if data.isCreateMode}
              <!-- Create Help -->
              <div>
                <h3 class="text-lg font-semibold">{m.users_help_create_title()}</h3>
                <div class="mt-3 space-y-3">
                  <div>
                    <p class="text-sm font-medium">{m.users_help_role_selection_title()}</p>
                    <p class="text-muted-foreground text-sm">
                      {m.users_help_role_selection_text()}
                    </p>
                  </div>
                  <div>
                    <p class="text-sm font-medium">{m.users_help_account_setup_title()}</p>
                    <p class="text-muted-foreground text-sm">
                      {m.users_help_account_setup_text()}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h3 class="text-lg font-semibold">{m.users_help_password_requirements()}</h3>
                <div class="mt-3">
                  <ul class="text-muted-foreground space-y-1 text-sm">
                    <li>• {m.users_help_password_min()}</li>
                    <li>• {m.users_help_password_match()}</li>
                    <li>• {m.users_help_password_required()}</li>
                  </ul>
                </div>
              </div>
            {:else}
              <!-- Account Summary -->
              <div>
                <h3 class="flex items-center gap-2 text-lg font-semibold">
                  <Shield class="h-5 w-5" />
                  {m.users_summary_title()}
                </h3>
                <p class="text-muted-foreground mt-1 mb-4 text-sm">
                  {m.users_summary_description()}
                </p>

                <div class="space-y-3">
                  <div class="flex items-center justify-between">
                    <span class="text-sm font-medium">{m.users_summary_user_id()}</span>
                    <div class="flex items-center gap-1">
                      <code class="bg-muted rounded px-2 py-1 text-xs">
                        {shortenUserId(data.targetUser?.id || '')}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        onclick={() => copyUserId(data.targetUser?.id || '')}
                        class="h-6 w-6 p-0"
                      >
                        <Copy class="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  <div class="flex items-center justify-between">
                    <span class="text-sm font-medium">{m.users_summary_role()}</span>
                    <Badge class={getRoleColor(data.targetUser?.role || '')}>
                      {data.targetUser?.role || m.users_summary_role_not_set()}
                    </Badge>
                  </div>

                  <div class="flex items-center justify-between">
                    <span class="text-sm font-medium">{m.users_summary_member_since()}</span>
                    <span class="text-muted-foreground text-sm">
                      {data.targetUser?.created_at
                        ? formatDate(data.targetUser.created_at, getUserLocale())
                        : m.users_summary_na()}
                    </span>
                  </div>

                  <div class="flex items-center justify-between">
                    <span class="text-sm font-medium">{m.users_summary_last_updated()}</span>
                    <span class="text-muted-foreground text-sm">
                      {data.targetUser?.updated_at
                        ? formatDate(data.targetUser.updated_at, getUserLocale())
                        : m.users_summary_na()}
                    </span>
                  </div>
                </div>
              </div>

              <hr class="my-4" />
              <!-- Danger Zone -->
              <div>
                <h3 class="text-lg font-semibold text-red-900">{m.users_danger_zone()}</h3>
                <p class="text-muted-foreground mt-1 mb-3 text-sm">
                  {m.users_danger_description()}
                </p>
                <Button
                  variant="destructive"
                  onclick={() => (deleteDialogOpen = true)}
                  size="sm"
                  class="w-full"
                >
                  <Trash2 class="mr-2 h-4 w-4" />
                  {m.users_delete_button()}
                </Button>
              </div>
            {/if}
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- User Delete Dialog with Content Adoption -->
<Dialog.Root bind:open={deleteDialogOpen}>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title class="flex items-center gap-2 text-red-600">
        <Trash2 class="h-5 w-5" />
        {m.users_delete_dialog_title()}
      </Dialog.Title>
      <Dialog.Description>
        {m.users_delete_dialog_description({
          name: data.targetUser?.name || m.common_user_singular()
        })}
      </Dialog.Description>
    </Dialog.Header>

    <form
      action="?/delete"
      method="POST"
      use:enhance={() => {
        deleteLoading = true;
        return async ({ result }) => {
          deleteLoading = false;
          if (result.type === 'redirect') {
            toast.success(m.toast_user_deleted());
            deleteDialogOpen = false;
            goto('/sailor/users');
          } else if (result.type === 'failure') {
            toast.error((result.data?.error as string) || m.toast_delete_user_failed());
          }
        };
      }}
    >
      <div class="py-4">
        {#if data.availableUsers && data.availableUsers.length > 0}
          <div class="space-y-3">
            <Label>{m.users_transfer_content_label()}</Label>
            <Select.Root
              type="single"
              value={adoptingUserId}
              onValueChange={(value) => {
                adoptingUserId = value || '';
              }}
            >
              <Select.Trigger>
                {#if adoptingUserId}
                  {data.availableUsers.find((user: AvailableUser) => user.id === adoptingUserId)
                    ?.name ||
                    data.availableUsers.find((user: AvailableUser) => user.id === adoptingUserId)
                      ?.email}
                {:else}
                  {m.users_transfer_select_placeholder()}
                {/if}
              </Select.Trigger>
              <Select.Content>
                {#each data.availableUsers as user (user.id)}
                  <Select.Item value={user.id}>
                    {user.name || user.email}
                  </Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
            <input type="hidden" name="adoptingUserId" bind:value={adoptingUserId} />

            <p class="text-muted-foreground text-xs">
              {#if adoptingUserId}
                {m.users_transfer_will_transfer({
                  name:
                    data.availableUsers.find((user: AvailableUser) => user.id === adoptingUserId)
                      ?.name ||
                    data.availableUsers.find((user: AvailableUser) => user.id === adoptingUserId)
                      ?.email ||
                    ''
                })}
              {:else}
                {m.users_transfer_will_delete()}
              {/if}
            </p>
          </div>
        {:else}
          <p class="text-sm">{m.users_no_adoption_candidates()}</p>
        {/if}
      </div>

      <Dialog.Footer class="flex justify-end gap-3">
        <Dialog.Close>
          <Button type="button" variant="outline" disabled={deleteLoading}
            >{m.common_cancel()}</Button
          >
        </Dialog.Close>
        <Button type="submit" variant="destructive" disabled={deleteLoading}>
          {#if deleteLoading}
            {m.users_deleting()}
          {:else}
            {m.users_delete_button()}
          {/if}
        </Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>

<!-- Role Change Warning Dialog -->
<Dialog.Root bind:open={roleChangeWarningOpen}>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title class="flex items-center gap-2 text-amber-600">
        <AlertTriangle class="h-5 w-5" />
        {m.users_role_warning_title()}
      </Dialog.Title>
      <Dialog.Description>
        {m.users_role_warning_description()}
      </Dialog.Description>
    </Dialog.Header>
    <div class="py-4">
      <ul class="text-muted-foreground space-y-2 text-sm">
        <li>• {m.users_role_warning_li1()}</li>
        <li>• {m.users_role_warning_li2()}</li>
        <li>• {m.users_role_warning_li3()}</li>
        <li>• {m.users_role_warning_li4()}</li>
      </ul>
      <div class="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3">
        <p class="text-sm font-medium text-amber-800">{m.users_role_warning_confirm()}</p>
      </div>
    </div>
    <Dialog.Footer class="flex justify-end gap-3">
      <Dialog.Close>
        <Button variant="outline">{m.common_cancel()}</Button>
      </Dialog.Close>
      <Button variant="destructive" onclick={confirmRoleChange}
        >{m.users_role_warning_button()}</Button
      >
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
