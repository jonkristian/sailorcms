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
  import { User, Key, Shield, Globe, CheckCircle, XCircle, Copy } from '@lucide/svelte';
  import GithubIcon from 'sailorcms/components/sailor/icons/GithubIcon.svelte';
  import { formatDate } from '$sailor/core/utils/date';
  import { getUserLocale } from '$sailor/core/ui/user-locale';
  import { invalidateAll } from '$app/navigation';
  import { getRoleColor, copyUserId, shortenUserId } from '$lib/sailor/core/utils/user';
  import Header from 'sailorcms/components/sailor/Header.svelte';
  import PasswordStrength from 'sailorcms/components/sailor/PasswordStrength.svelte';
  import { m } from '$sailor/i18n';

  const { data } = $props();

  let submitting = $state(false);
  let formData = $state({
    // svelte-ignore state_referenced_locally
    name: data.user.name || '',
    // svelte-ignore state_referenced_locally
    language: data.user.preferences?.language || 'auto',
    // svelte-ignore state_referenced_locally
    date_format: data.user.preferences?.date_format || 'auto',
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  // UI language options — only those with translations.
  const LANGUAGE_OPTIONS = $derived([
    { value: 'auto', label: m.account_field_language_auto() },
    { value: 'en', label: 'English' },
    { value: 'nb-NO', label: 'Norsk (bokmål)' }
  ]);

  // Date format options — separate from UI language so users can pick a
  // regional format (en-GB, de-DE, etc.) without changing UI strings.
  // Self-identifying labels intentionally — read regardless of active UI locale.
  const DATE_FORMAT_OPTIONS = $derived([
    { value: 'auto', label: m.account_field_date_format_auto() },
    { value: 'en-US', label: 'English (US) — May 1, 2026' },
    { value: 'en-GB', label: 'English (UK) — 1 May 2026' },
    { value: 'nb-NO', label: 'Norsk (bokmål) — 1. mai 2026' },
    { value: 'de-DE', label: 'Deutsch — 1. Mai 2026' },
    { value: 'fr-FR', label: 'Français — 1 mai 2026' },
    { value: 'sv-SE', label: 'Svenska — 1 maj 2026' },
    { value: 'es-ES', label: 'Español — 1 may 2026' }
  ]);

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
        const errorMessage = result.data?.error || m.account_update_failed();
        toast.error(errorMessage);
      } else {
        toast.success(result.message || m.account_update_success());
        // Clear password fields on success
        formData.currentPassword = '';
        formData.newPassword = '';
        formData.confirmPassword = '';
        await invalidateAll();
      }
    } catch (error) {
      toast.error(m.account_update_failed());
    } finally {
      submitting = false;
    }
  }

  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case 'github':
        return GithubIcon;
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
  <title>{m.account_page_title()} - Sailor CMS</title>
</svelte:head>

<div class="px-6">
  <Header title={m.account_page_title()} description={m.account_page_description()} />

  <div class="flex gap-6">
    <!-- Main Form -->
    <div class="flex-1">
      <Card>
        <CardHeader>
          <CardTitle class="flex items-center gap-2">
            <User class="h-5 w-5" />
            {m.account_profile_card_title()}
          </CardTitle>
          <CardDescription>{m.account_profile_card_description()}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onsubmit={handleSubmit} class="space-y-6">
            <div class="space-y-3">
              <Label for="name">{m.account_field_name()}</Label>
              <Input
                id="name"
                name="name"
                bind:value={formData.name}
                placeholder={m.account_field_name_placeholder()}
                required
              />
            </div>

            <div class="space-y-3">
              <Label for="email">{m.account_field_email()}</Label>
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
                {m.account_field_email_help()}
              </p>
            </div>

            <div class="space-y-3">
              <Label for="language">{m.account_field_language()}</Label>
              <select
                id="language"
                name="language"
                bind:value={formData.language}
                class="border-input bg-background ring-offset-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm focus-visible:ring-1 focus-visible:outline-none"
              >
                {#each LANGUAGE_OPTIONS as opt (opt.value)}
                  <option value={opt.value}>{opt.label}</option>
                {/each}
              </select>
              <p class="text-muted-foreground text-xs">
                {m.account_field_language_help()}
              </p>
            </div>

            <div class="space-y-3">
              <Label for="date_format">{m.account_field_date_format()}</Label>
              <select
                id="date_format"
                name="date_format"
                bind:value={formData.date_format}
                class="border-input bg-background ring-offset-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm focus-visible:ring-1 focus-visible:outline-none"
              >
                {#each DATE_FORMAT_OPTIONS as opt (opt.value)}
                  <option value={opt.value}>{opt.label}</option>
                {/each}
              </select>
              <p class="text-muted-foreground text-xs">
                {m.account_field_date_format_help()}
              </p>
            </div>

            <!-- Password Change Section -->
            {#if !data.oauthAccounts || data.oauthAccounts.length === 0}
              <div class="mt-8 border-t pt-6">
                <h3 class="text-md mb-6 flex items-center gap-2 font-medium">
                  <Key class="h-5 w-5" />
                  {m.account_change_password()}
                </h3>
                <div class="space-y-6">
                  <div class="space-y-3">
                    <Label for="currentPassword">{m.account_field_current_password()}</Label>
                    <Input
                      id="currentPassword"
                      name="currentPassword"
                      type="password"
                      bind:value={formData.currentPassword}
                      placeholder={m.account_field_current_password_placeholder()}
                      autocomplete="current-password"
                    />
                  </div>

                  <div class="space-y-2">
                    <div class="flex items-center justify-between">
                      <Label for="newPassword">{m.account_field_new_password()}</Label>
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
                      placeholder={m.account_field_new_password_placeholder()}
                      autocomplete="new-password"
                    />
                  </div>

                  <div class="space-y-3">
                    <Label for="confirmPassword">{m.account_field_confirm_password()}</Label>
                    <Input
                      id="confirmPassword"
                      name="confirmPassword"
                      type="password"
                      bind:value={formData.confirmPassword}
                      placeholder={m.account_field_confirm_password_placeholder()}
                      autocomplete="new-password"
                      class={formData.confirmPassword &&
                      formData.newPassword !== formData.confirmPassword
                        ? 'border-red-500'
                        : ''}
                    />
                    {#if formData.confirmPassword && formData.newPassword !== formData.confirmPassword}
                      <p class="text-xs text-red-500">{m.account_passwords_no_match()}</p>
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
                        {m.account_oauth_title()}
                      </h3>
                      <p class="mt-1 text-sm text-blue-700 dark:text-blue-300">
                        {m.account_oauth_description({
                          providers: data.oauthAccounts
                            .map((account: { provider_id: string }) =>
                              getProviderName(account.provider_id)
                            )
                            .join(', ')
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            {/if}

            <Button type="submit" disabled={submitting} class="w-full">
              {#if submitting}
                {m.common_saving()}
              {:else}
                {m.account_save_changes()}
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
              {m.account_overview_title()}
            </h3>
            <p class="text-muted-foreground mt-1 mb-4 text-sm">
              {m.account_overview_description()}
            </p>

            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <span class="text-sm font-medium">{m.account_overview_user_id()}</span>
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
                <span class="text-sm font-medium">{m.account_overview_role()}</span>
                <Badge class={getRoleColor(data.user?.role || '')}>
                  {data.user?.role || m.account_role_not_set()}
                </Badge>
              </div>

              <div class="flex items-center justify-between">
                <span class="text-sm font-medium">{m.account_overview_email_status()}</span>
                <div class="flex items-center gap-1">
                  {#if data.user?.email_verified}
                    <CheckCircle class="h-4 w-4 text-green-500" />
                    <span class="text-xs text-green-600">{m.account_overview_email_verified()}</span
                    >
                  {:else}
                    <XCircle class="h-4 w-4 text-orange-500" />
                    <span class="text-xs text-orange-600"
                      >{m.account_overview_email_unverified()}</span
                    >
                  {/if}
                </div>
              </div>

              <div class="flex items-center justify-between">
                <span class="text-sm font-medium">{m.account_overview_member_since()}</span>
                <span class="text-muted-foreground text-sm">
                  {data.user?.created_at
                    ? formatDate(data.user.created_at, getUserLocale())
                    : 'N/A'}
                </span>
              </div>

              <div class="flex items-center justify-between">
                <span class="text-sm font-medium">{m.account_overview_last_updated()}</span>
                <span class="text-muted-foreground text-sm">
                  {data.user?.updated_at
                    ? formatDate(data.user.updated_at, getUserLocale())
                    : 'N/A'}
                </span>
              </div>
            </div>
          </div>

          <!-- OAuth Connections -->
          {#if data.oauthAccounts && data.oauthAccounts.length > 0}
            <div>
              <h3 class="flex items-center gap-2 text-lg font-semibold">
                <Globe class="h-5 w-5" />
                {m.account_auth_methods_title()}
              </h3>
              <p class="text-muted-foreground mt-1 mb-4 text-sm">
                {m.account_auth_methods_description()}
              </p>

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
                        {account.created_at
                          ? m.account_oauth_connected({
                              date: formatDate(account.created_at, getUserLocale())
                            })
                          : m.account_oauth_connected_recently()}
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
