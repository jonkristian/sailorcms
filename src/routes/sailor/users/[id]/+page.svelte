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
  import { formatDate } from '$sailor/core/utils/date';
  import { getRoleColor, copyUserId, shortenUserId } from '$lib/sailor/core/utils/user';
  import type { PageData, ActionData } from './$types';
  import Header from '$lib/components/sailor/Header.svelte';

  // Extract the type of availableUsers from PageData
  type AvailableUser = NonNullable<PageData['availableUsers']>[number];

  const { data, form } = $props<{ data: PageData; form?: ActionData }>();

  let deleteDialogOpen = $state(false);
  let roleChangeWarningOpen = $state(false);
  let deleteLoading = $state(false);
  let adoptingUserId = $state('');

  const roleOptions = [
    { value: 'user', label: 'User', description: 'Basic access with limited permissions' },
    {
      value: 'editor',
      label: 'Editor',
      description: 'Can manage content and access most features'
    },
    { value: 'admin', label: 'Admin', description: 'Full access to all features and settings' }
  ];

  let formData = $state({
    name: form?.values?.name || data.targetUser?.name || '',
    email: form?.values?.email || data.targetUser?.email || '',
    password: '',
    confirmPassword: '',
    role: form?.values?.role || data.targetUser?.role || 'user'
  });

  function handleSubmit(event: SubmitEvent) {
    // Client-side validation for password confirmation
    if (
      (data.isCreateMode || formData.password) &&
      formData.password !== formData.confirmPassword
    ) {
      event.preventDefault();
      toast.error('Passwords do not match');
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
  <title>{data.isCreateMode ? 'Create' : 'Edit'} User - Sailor CMS</title>
</svelte:head>

<div class="container mx-auto px-6">
  <div class="space-y-6">
    <Header
      title="{data.isCreateMode ? 'Create' : 'Edit'} User"
      description="User information and preferences."
    />

    <div class="flex gap-6">
      <!-- Main Content -->
      <div class="flex-1">
        <div class="space-y-6">
          <Card.Root>
            <Card.Header>
              <Card.Title class="flex items-center gap-2">
                <UserIcon class="h-5 w-5" />
                User Information
              </Card.Title>
              <Card.Description>
                {data.isCreateMode
                  ? 'Enter the details for the new user account'
                  : "Update the user's account details"}
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
                      toast.error((result.data?.error as string) || 'An error occurred');
                      await applyAction(result);
                    }
                  };
                }}
                onsubmit={handleSubmit}
                class="space-y-4"
              >
                <!-- Name -->
                <div class="space-y-2">
                  <Label for="name">Name</Label>
                  <Input
                    id="name"
                    name="name"
                    bind:value={formData.name}
                    placeholder="John Doe"
                    required
                  />
                </div>

                <!-- Email -->
                <div class="space-y-2">
                  <Label for="email">E-mail</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    bind:value={formData.email}
                    placeholder="john@example.com"
                    required
                  />
                </div>

                <hr class="my-6" />

                <!-- Password -->
                <div class="space-y-2">
                  <Label for="password">{data.isCreateMode ? 'Password' : 'New Password'}</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    bind:value={formData.password}
                    placeholder={data.isCreateMode
                      ? 'Minimum 6 characters'
                      : 'Leave empty to keep current password'}
                    required={data.isCreateMode}
                  />
                  <p class="text-muted-foreground text-sm">
                    {data.isCreateMode
                      ? 'Password must be at least 6 characters long'
                      : 'Leave empty to keep the current password. If changing, minimum 6 characters.'}
                  </p>
                </div>

                <!-- Confirm Password -->
                <div class="space-y-2">
                  <Label for="confirmPassword">
                    {data.isCreateMode ? 'Confirm Password' : 'Confirm New Password'}
                  </Label>
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    bind:value={formData.confirmPassword}
                    placeholder={data.isCreateMode ? 'Repeat password' : 'Repeat new password'}
                    required={data.isCreateMode || formData.password !== ''}
                    class={formData.confirmPassword &&
                    formData.password !== formData.confirmPassword
                      ? 'border-red-500'
                      : ''}
                  />
                  {#if formData.confirmPassword && formData.password !== formData.confirmPassword}
                    <p class="text-sm text-red-500">Passwords do not match</p>
                  {/if}
                </div>

                <!-- Role -->
                <div class="space-y-2">
                  <Label for="role">Role</Label>
                  <Select.Root
                    type="single"
                    value={formData.role}
                    onValueChange={(value) => {
                      formData.role = value || 'user';
                    }}
                  >
                    <Select.Trigger>
                      {roleOptions.find((option) => option.value === formData.role)?.label ||
                        'Select a role'}
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
                    {data.isCreateMode ? 'Create User' : 'Update User'}
                  </Button>
                  <Button type="button" variant="outline" onclick={() => goto('/sailor/users')}>
                    Cancel
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
                <h3 class="text-lg font-semibold">Creating New User</h3>
                <div class="mt-3 space-y-3">
                  <div>
                    <p class="text-sm font-medium">Role Selection</p>
                    <p class="text-muted-foreground text-sm">
                      Choose the appropriate role in the dropdown. Each role has different
                      permissions and access levels.
                    </p>
                  </div>
                  <div>
                    <p class="text-sm font-medium">Account Setup</p>
                    <p class="text-muted-foreground text-sm">
                      New users will receive login credentials and can access the CMS immediately
                      after creation.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h3 class="text-lg font-semibold">Password Requirements</h3>
                <div class="mt-3">
                  <ul class="text-muted-foreground space-y-1 text-sm">
                    <li>• Minimum 6 characters</li>
                    <li>• Must match confirmation</li>
                    <li>• Required for new accounts</li>
                  </ul>
                </div>
              </div>
            {:else}
              <!-- Account Summary -->
              <div>
                <h3 class="flex items-center gap-2 text-lg font-semibold">
                  <Shield class="h-5 w-5" />
                  Account Summary
                </h3>
                <p class="text-muted-foreground mt-1 mb-4 text-sm">
                  User profile and account status
                </p>

                <div class="space-y-3">
                  <div class="flex items-center justify-between">
                    <span class="text-sm font-medium">User ID:</span>
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
                    <span class="text-sm font-medium">Role:</span>
                    <Badge class={getRoleColor(data.targetUser?.role || '')}>
                      {data.targetUser?.role || 'Not set'}
                    </Badge>
                  </div>

                  <div class="flex items-center justify-between">
                    <span class="text-sm font-medium">Member Since:</span>
                    <span class="text-muted-foreground text-sm">
                      {data.targetUser?.created_at ? formatDate(data.targetUser.created_at) : 'N/A'}
                    </span>
                  </div>

                  <div class="flex items-center justify-between">
                    <span class="text-sm font-medium">Last Updated:</span>
                    <span class="text-muted-foreground text-sm">
                      {data.targetUser?.updated_at ? formatDate(data.targetUser.updated_at) : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>

              <hr class="my-4" />
              <!-- Danger Zone -->
              <div>
                <h3 class="text-lg font-semibold text-red-900">Danger Zone</h3>
                <p class="text-muted-foreground mt-1 mb-3 text-sm">Irreversible actions</p>
                <Button
                  variant="destructive"
                  onclick={() => (deleteDialogOpen = true)}
                  size="sm"
                  class="w-full"
                >
                  <Trash2 class="mr-2 h-4 w-4" />
                  Delete User
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
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title class="flex items-center gap-2 text-red-600">
        <Trash2 class="h-5 w-5" />
        Delete User
      </Dialog.Title>
      <Dialog.Description>
        You are about to delete <strong>{data.targetUser?.name || 'this user'}</strong>. This action
        cannot be undone.
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
            toast.success('User deleted successfully');
            deleteDialogOpen = false;
            goto('/sailor/users');
          } else if (result.type === 'failure') {
            toast.error((result.data?.error as string) || 'Failed to delete user');
          }
        };
      }}
    >
      <div class="py-4">
        {#if data.availableUsers && data.availableUsers.length > 0}
          <div class="space-y-3">
            <Label>Transfer content to:</Label>
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
                  Select user (or delete all content)
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
                Content will be transferred to {data.availableUsers.find(
                  (user: AvailableUser) => user.id === adoptingUserId
                )?.name ||
                  data.availableUsers.find((user: AvailableUser) => user.id === adoptingUserId)
                    ?.email}.
              {:else}
                All content created by this user will be permanently deleted.
              {/if}
            </p>
          </div>
        {:else}
          <p class="text-sm">All content will be permanently deleted.</p>
        {/if}
      </div>

      <Dialog.Footer class="flex justify-end gap-3">
        <Dialog.Close>
          <Button type="button" variant="outline" disabled={deleteLoading}>Cancel</Button>
        </Dialog.Close>
        <Button type="submit" variant="destructive" disabled={deleteLoading}>
          {#if deleteLoading}
            Deleting...
          {:else}
            Delete User
          {/if}
        </Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>

<!-- Role Change Warning Dialog -->
<Dialog.Root bind:open={roleChangeWarningOpen}>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title class="flex items-center gap-2 text-amber-600">
        <AlertTriangle class="h-5 w-5" />
        Admin Privilege Warning
      </Dialog.Title>
      <Dialog.Description>
        You are about to remove your own admin privileges. This action will:
      </Dialog.Description>
    </Dialog.Header>
    <div class="py-4">
      <ul class="text-muted-foreground space-y-2 text-sm">
        <li>• Remove access to user management</li>
        <li>• Remove access to system settings</li>
        <li>• Remove access to admin-only features</li>
        <li>• Require another admin to restore your privileges</li>
      </ul>
      <div class="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3">
        <p class="text-sm font-medium text-amber-800">Are you sure you want to continue?</p>
      </div>
    </div>
    <Dialog.Footer class="flex justify-end gap-3">
      <Dialog.Close>
        <Button variant="outline">Cancel</Button>
      </Dialog.Close>
      <Button variant="destructive" onclick={confirmRoleChange}>Yes, Remove Admin Role</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
