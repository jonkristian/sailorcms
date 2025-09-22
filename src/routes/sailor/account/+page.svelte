<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
  } from '$lib/components/ui/card';
  import { Badge } from '$lib/components/ui/badge';
  import { toast } from '$sailor/core/ui/toast';
  import { User, Key, Shield, Github, Globe, CheckCircle, XCircle, Copy } from '@lucide/svelte';
  import { formatDate } from '$sailor/core/utils/date';
  import { invalidateAll } from '$app/navigation';
  import { getRoleColor, copyUserId, shortenUserId } from '$lib/sailor/core/utils/user';
  import Header from '$lib/components/sailor/Header.svelte';
  import PasswordStrength from '$lib/components/sailor/PasswordStrength.svelte';

  const { data } = $props();

  let submitting = $state(false);
  let formData = $state({
    name: data.user.name || '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  async function handleSubmit(event: Event) {
    event.preventDefault();
    submitting = true;

    try {
      const response = await fetch('?/update', {
        method: 'POST',
        body: new FormData(event.target as HTMLFormElement)
      });
      const result = await response.json();

      if (result.type === 'failure') {
        const errorMessage = result.data?.error || 'Failed to update account';
        toast.error(errorMessage);
      } else {
        toast.success(result.message || 'Account updated successfully');
        // Clear password fields on success
        formData.currentPassword = '';
        formData.newPassword = '';
        formData.confirmPassword = '';
        await invalidateAll();
      }
    } catch (error) {
      toast.error('Failed to update account');
    } finally {
      submitting = false;
    }
  }

  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case 'github':
        return Github;
      default:
        return Globe;
    }
  };

  const getProviderName = (provider: string) => {
    switch (provider) {
      case 'github':
        return 'GitHub';
      default:
        return provider.charAt(0).toUpperCase() + provider.slice(1);
    }
  };
</script>

<svelte:head>
  <title>Account Settings - Sailor CMS</title>
</svelte:head>

<div class="px-6">
  <Header title="Account Settings" description="Manage your account information and preferences." />

  <div class="flex gap-6">
    <!-- Main Form -->
    <div class="flex-1">
      <Card>
        <CardHeader>
          <CardTitle class="flex items-center gap-2">
            <User class="h-5 w-5" />
            Profile Information
          </CardTitle>
          <CardDescription>Update your personal information and contact details.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onsubmit={handleSubmit} class="space-y-6">
            <div class="space-y-3">
              <Label for="name">Name</Label>
              <Input
                id="name"
                name="name"
                bind:value={formData.name}
                placeholder="Enter your full name"
                required
              />
            </div>

            <div class="space-y-3">
              <Label for="email">E-mail</Label>
              <Input
                id="email"
                name="email"
                type="email"
                value={data.user?.email || ''}
                placeholder="your@email.com"
                disabled
                class="bg-muted cursor-not-allowed"
              />
              <p class="text-muted-foreground text-xs">
                Email address cannot be changed. It's used as your account identifier and for OAuth
                authentication.
              </p>
            </div>

            <!-- Password Change Section -->
            {#if !data.oauthAccounts || data.oauthAccounts.length === 0}
              <div class="mt-8 border-t pt-6">
                <h3 class="text-md mb-6 flex items-center gap-2 font-medium">
                  <Key class="h-5 w-5" />
                  Change Password
                </h3>
                <div class="space-y-6">
                  <div class="space-y-3">
                    <Label for="currentPassword">Current Password</Label>
                    <Input
                      id="currentPassword"
                      name="currentPassword"
                      type="password"
                      bind:value={formData.currentPassword}
                      placeholder="Enter current password to change it"
                      autocomplete="current-password"
                    />
                  </div>

                  <div class="space-y-2">
                    <div class="flex items-center justify-between">
                      <Label for="newPassword">New Password</Label>
                      <div class="ml-4 flex h-[20px] max-w-48 flex-1 items-center justify-end">
                        {#if formData.newPassword}
                          <PasswordStrength password={formData.newPassword} />
                        {/if}
                      </div>
                    </div>
                    <Input
                      id="newPassword"
                      name="newPassword"
                      type="password"
                      bind:value={formData.newPassword}
                      placeholder="Enter new password (min 6 characters)"
                      autocomplete="new-password"
                    />
                  </div>

                  <div class="space-y-3">
                    <Label for="confirmPassword">Confirm New Password</Label>
                    <Input
                      id="confirmPassword"
                      name="confirmPassword"
                      type="password"
                      bind:value={formData.confirmPassword}
                      placeholder="Confirm new password"
                      autocomplete="new-password"
                      class={formData.confirmPassword &&
                      formData.newPassword !== formData.confirmPassword
                        ? 'border-red-500'
                        : ''}
                    />
                    {#if formData.confirmPassword && formData.newPassword !== formData.confirmPassword}
                      <p class="text-xs text-red-500">Passwords do not match</p>
                    {/if}
                  </div>
                </div>
              </div>
            {:else}
              <!-- OAuth Only Users -->
              <div class="mt-8 border-t pt-6">
                <div
                  class="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950"
                >
                  <div class="flex items-start gap-3">
                    <Key class="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    <div class="flex-1">
                      <h3 class="text-md font-medium text-blue-900 dark:text-blue-100">
                        OAuth Authentication
                      </h3>
                      <p class="mt-1 text-sm text-blue-700 dark:text-blue-300">
                        Your account is authenticated via {data.oauthAccounts
                          .map((account: { provider_id: string }) =>
                            getProviderName(account.provider_id)
                          )
                          .join(', ')}.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            {/if}

            <Button type="submit" disabled={submitting} class="w-full">
              {#if submitting}
                Saving...
              {:else}
                Save Changes
              {/if}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>

    <!-- Right Sidebar -->
    <div class="bg-background w-70 border-l">
      <div class="h-full overflow-y-auto pt-4 pl-4">
        <div class="space-y-6">
          <!-- Account Profile -->
          <div>
            <h3 class="flex items-center gap-2 text-lg font-semibold">
              <Shield class="h-5 w-5" />
              Account Profile
            </h3>
            <p class="text-muted-foreground mt-1 mb-4 text-sm">Your account overview and status</p>

            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <span class="text-sm font-medium">User ID:</span>
                <div class="flex items-center gap-1">
                  <code class="bg-muted rounded px-2 py-1 text-xs"
                    >{shortenUserId(data.user?.id || '')}</code
                  >
                  <Button
                    variant="ghost"
                    size="icon"
                    onclick={() => copyUserId(data.user?.id || '')}
                    class="h-6 w-6 p-0"
                  >
                    <Copy class="h-3 w-3" />
                  </Button>
                </div>
              </div>

              <div class="flex items-center justify-between">
                <span class="text-sm font-medium">Role:</span>
                <Badge class={getRoleColor(data.user?.role || '')}>
                  {data.user?.role || 'Not set'}
                </Badge>
              </div>

              <div class="flex items-center justify-between">
                <span class="text-sm font-medium">Email Status:</span>
                <div class="flex items-center gap-1">
                  {#if data.user?.email_verified}
                    <CheckCircle class="h-4 w-4 text-green-500" />
                    <span class="text-xs text-green-600">Verified</span>
                  {:else}
                    <XCircle class="h-4 w-4 text-orange-500" />
                    <span class="text-xs text-orange-600">Unverified</span>
                  {/if}
                </div>
              </div>

              <div class="flex items-center justify-between">
                <span class="text-sm font-medium">Member Since:</span>
                <span class="text-muted-foreground text-sm">
                  {data.user?.created_at ? formatDate(data.user.created_at) : 'N/A'}
                </span>
              </div>

              <div class="flex items-center justify-between">
                <span class="text-sm font-medium">Last Updated:</span>
                <span class="text-muted-foreground text-sm">
                  {data.user?.updated_at ? formatDate(data.user.updated_at) : 'N/A'}
                </span>
              </div>
            </div>
          </div>

          <!-- OAuth Connections -->
          {#if data.oauthAccounts && data.oauthAccounts.length > 0}
            <div>
              <h3 class="flex items-center gap-2 text-lg font-semibold">
                <Globe class="h-5 w-5" />
                Authentication Methods
              </h3>
              <p class="text-muted-foreground mt-1 mb-4 text-sm">How you sign in to your account</p>

              <div class="space-y-3">
                {#each data.oauthAccounts as account (account.id)}
                  {@const ProviderIcon = getProviderIcon(account.provider_id)}
                  <div class="flex items-center gap-3 rounded-lg border p-3">
                    <div class="bg-muted flex h-8 w-8 items-center justify-center rounded-full">
                      <ProviderIcon class="h-4 w-4" />
                    </div>
                    <div class="flex-1">
                      <p class="text-sm font-medium">{getProviderName(account.provider_id)}</p>
                      <p class="text-muted-foreground text-xs">
                        Connected {account.created_at ? formatDate(account.created_at) : 'recently'}
                      </p>
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
</div>
