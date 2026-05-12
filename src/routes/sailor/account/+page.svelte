<script lang="ts">
  import { Button } from 'sailorcms/components/ui/button/index.js';
  import { Input } from 'sailorcms/components/ui/input/index.js';
  import { Label } from 'sailorcms/components/ui/label/index.js';
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
  } from 'sailorcms/components/ui/card/index.js';
  import { Badge } from 'sailorcms/components/ui/badge/index.js';
  import { toast } from 'sailorcms/core/ui/toast';
  import {
    User,
    Key,
    Shield,
    Globe,
    CheckCircle,
    XCircle,
    Copy,
    Plus,
    ChevronDown,
    ChevronRight
  } from '@lucide/svelte';
  import * as Dialog from 'sailorcms/components/ui/dialog/index.js';
  import * as DropdownMenu from 'sailorcms/components/ui/dropdown-menu/index.js';
  import * as Select from 'sailorcms/components/ui/select/index.js';
  import { Alert, AlertDescription } from 'sailorcms/components/ui/alert/index.js';
  import GithubIcon from 'sailorcms/components/sailor/icons/GithubIcon.svelte';
  import { authClient } from 'sailorcms/core/auth';
  import { formatDate } from 'sailorcms/core/utils/date';
  import { getUserLocale } from 'sailorcms/core/ui/user-locale';
  import { invalidateAll } from '$app/navigation';
  import { getRoleColor, copyUserId, shortenUserId } from 'sailorcms/core/utils/user';
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
      case 'google':
        return 'Google';
      default:
        return provider.charAt(0).toUpperCase() + provider.slice(1);
    }
  };

  let connecting = $state(false);
  let selectedAccount = $state<any>(null);
  let pendingConnect = $state<(typeof data.connectableProviders)[number] | null>(null);
  let unlinkConfirming = $state(false);
  let unlinking = $state(false);

  async function handleConnect(providerId: string, scope: string) {
    connecting = true;
    try {
      await authClient.linkSocial({
        provider: providerId,
        // Empty scope = sign-in only (no extra grants). Passing `['']` would
        // send Better Auth a literal empty scope and break the OAuth URL.
        scopes: scope ? [scope] : undefined,
        callbackURL: '/sailor/account'
      });
    } catch (e) {
      console.error('OAuth connect error:', e);
      toast.error(m.account_mail_connect_error());
      connecting = false;
    }
  }

  async function handleUnlink(providerId: string, accountId: string) {
    unlinking = true;
    try {
      const res = await authClient.unlinkAccount({ providerId, accountId });
      // Better Auth's unlink-account endpoint refuses to remove the user's
      // last remaining account (FAILED_TO_UNLINK_LAST_ACCOUNT). Surface that
      // server-side message rather than a generic error so the admin knows
      // they need another auth method first.
      if ((res as any)?.error) {
        toast.error((res as any).error.message ?? m.account_oauth_unlink_error());
      } else {
        toast.success(m.account_oauth_unlink_success({ provider: getProviderName(providerId) }));
        selectedAccount = null;
        unlinkConfirming = false;
        await invalidateAll();
      }
    } catch (e) {
      console.error('OAuth unlink error:', e);
      toast.error(m.account_oauth_unlink_error());
    } finally {
      unlinking = false;
    }
  }
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
              <!--
                Hidden input mirrors the Select value into the FormData built by
                `new FormData(form)` in handleSubmit — bits-ui's Select doesn't
                emit a native form control on its own.
              -->
              <input type="hidden" name="language" value={formData.language} />
              <Select.Root
                type="single"
                value={formData.language}
                onValueChange={(v) => (formData.language = v ?? formData.language)}
              >
                <Select.Trigger id="language" class="w-full">
                  {LANGUAGE_OPTIONS.find((o) => o.value === formData.language)?.label ??
                    formData.language}
                </Select.Trigger>
                <Select.Content>
                  {#each LANGUAGE_OPTIONS as opt (opt.value)}
                    <Select.Item value={opt.value}>{opt.label}</Select.Item>
                  {/each}
                </Select.Content>
              </Select.Root>
              <p class="text-muted-foreground text-xs">
                {m.account_field_language_help()}
              </p>
            </div>

            <div class="space-y-3">
              <Label for="date_format">{m.account_field_date_format()}</Label>
              <input type="hidden" name="date_format" value={formData.date_format} />
              <Select.Root
                type="single"
                value={formData.date_format}
                onValueChange={(v) => (formData.date_format = v ?? formData.date_format)}
              >
                <Select.Trigger id="date_format" class="w-full">
                  {DATE_FORMAT_OPTIONS.find((o) => o.value === formData.date_format)?.label ??
                    formData.date_format}
                </Select.Trigger>
                <Select.Content>
                  {#each DATE_FORMAT_OPTIONS as opt (opt.value)}
                    <Select.Item value={opt.value}>{opt.label}</Select.Item>
                  {/each}
                </Select.Content>
              </Select.Root>
              <p class="text-muted-foreground text-xs">
                {m.account_field_date_format_help()}
              </p>
            </div>

            <!-- Password Change Section -->
            {#if data.hasCredentialAccount}
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

          <!-- Connected accounts (OAuth) -->
          {#if data.oauthAccounts.length > 0 || data.connectableProviders.length > 0 || data.unconfiguredProviders.length > 0}
            <div>
              <h3 class="flex items-center gap-2 text-lg font-semibold">
                <Globe class="h-5 w-5" />
                {m.account_connected_accounts_title()}
              </h3>
              <p class="text-muted-foreground mt-1 mb-4 text-sm">
                {m.account_connected_accounts_description()}
              </p>

              <div class="space-y-2">
                {#each data.oauthAccounts as account (account.id)}
                  {@const ProviderIcon = getProviderIcon(account.provider_id)}
                  <button
                    type="button"
                    onclick={() => (selectedAccount = account)}
                    class="hover:bg-muted/50 flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors"
                  >
                    <div
                      class="bg-muted flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                    >
                      <ProviderIcon class="h-4 w-4" />
                    </div>
                    <div class="min-w-0 flex-1">
                      <p class="text-sm font-medium">
                        {getProviderName(account.provider_id)}
                      </p>
                      <p class="text-muted-foreground truncate text-xs">
                        {account.providerEmail ??
                          (account.created_at
                            ? m.account_oauth_connected({
                                date: formatDate(account.created_at, getUserLocale())
                              })
                            : m.account_oauth_connected_recently())}
                      </p>
                    </div>
                    <ChevronRight class="text-muted-foreground h-4 w-4 shrink-0" />
                  </button>
                {/each}

                {#if data.connectableProviders.length > 0}
                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger>
                      {#snippet child({ props })}
                        <Button {...props} variant="outline" class="w-full justify-start">
                          <Plus class="mr-2 h-4 w-4" />
                          <span class="flex-1 text-left">
                            {m.account_connect_dropdown_trigger()}
                          </span>
                          <ChevronDown class="ml-2 h-4 w-4 opacity-60" />
                        </Button>
                      {/snippet}
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Content class="w-(--bits-dropdown-menu-anchor-width)">
                      {#each data.connectableProviders as cp (cp.providerId)}
                        {@const ProviderIcon = getProviderIcon(cp.providerId)}
                        <DropdownMenu.Item onSelect={() => (pendingConnect = cp)}>
                          <ProviderIcon class="mr-2 h-4 w-4" />
                          {m.account_mail_connect_cta({
                            provider: getProviderName(cp.providerId)
                          })}
                        </DropdownMenu.Item>
                      {/each}
                    </DropdownMenu.Content>
                  </DropdownMenu.Root>
                {/if}

                {#if data.connectableProviders.length === 0 && data.unconfiguredProviders.length > 0}
                  <Alert>
                    <Globe class="h-4 w-4" />
                    <AlertDescription>
                      {m.account_connect_unconfigured_hint({
                        providers: data.unconfiguredProviders.map(getProviderName).join(', ')
                      })}
                    </AlertDescription>
                  </Alert>
                {/if}
              </div>
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
</div>

<Dialog.Root
  open={selectedAccount !== null}
  onOpenChange={(o) => {
    if (!o) {
      selectedAccount = null;
      unlinkConfirming = false;
    }
  }}
>
  <Dialog.Content>
    {#if selectedAccount}
      {@const acc = selectedAccount}
      {@const AccIcon = getProviderIcon(acc.provider_id)}
      <Dialog.Header>
        <Dialog.Title class="flex items-center gap-2">
          <AccIcon class="h-5 w-5" />
          {acc.providerEmail ?? getProviderName(acc.provider_id)}
        </Dialog.Title>
        <Dialog.Description>
          {acc.providerEmail ? `${getProviderName(acc.provider_id)} · ` : ''}{acc.created_at
            ? m.account_oauth_connected({
                date: formatDate(acc.created_at, getUserLocale())
              })
            : m.account_oauth_connected_recently()}
        </Dialog.Description>
      </Dialog.Header>

      <div class="space-y-4 py-2">
        <div class="space-y-2">
          <p class="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {m.account_oauth_purposes_label()}
          </p>
          <div class="flex flex-wrap gap-1">
            {#if acc.purposes.signIn}
              <Badge variant="secondary">{m.account_oauth_purpose_signin()}</Badge>
            {/if}
            {#if acc.purposes.mail}
              <Badge variant="secondary">{m.account_oauth_purpose_mail()}</Badge>
            {/if}
          </div>
        </div>

        {#if acc.purposes.mail && acc.purposes.mailScope}
          <div class="space-y-2">
            <p class="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              {m.account_oauth_purpose_mail()}
            </p>
            <Button
              variant="outline"
              size="sm"
              onclick={() => handleConnect(acc.provider_id, acc.purposes.mailScope)}
              disabled={connecting}
            >
              {m.account_mail_reconnect()}
            </Button>
          </div>
        {/if}
      </div>

      <Dialog.Footer class="gap-2 sm:gap-2">
        {#if unlinkConfirming}
          <Button variant="outline" disabled={unlinking} onclick={() => (unlinkConfirming = false)}>
            {m.common_cancel()}
          </Button>
          <Button
            variant="destructive"
            disabled={unlinking}
            onclick={() => handleUnlink(acc.provider_id, acc.account_id)}
          >
            {unlinking ? m.account_oauth_unlinking() : m.account_oauth_unlink_confirm()}
          </Button>
        {:else}
          <Button variant="outline" onclick={() => (selectedAccount = null)}>
            {m.common_close()}
          </Button>
          <Button variant="destructive" onclick={() => (unlinkConfirming = true)}>
            {m.account_oauth_unlink()}
          </Button>
        {/if}
      </Dialog.Footer>
    {/if}
  </Dialog.Content>
</Dialog.Root>

<!--
  Confirmation step before redirecting to the OAuth consent screen. Tells the
  admin in product terms (sign-in / mail) what this link will grant, rather
  than leaving Google's scope-language consent screen as the first signal.
-->
<Dialog.Root
  open={pendingConnect !== null}
  onOpenChange={(o) => {
    if (!o) pendingConnect = null;
  }}
>
  <Dialog.Content>
    {#if pendingConnect}
      {@const cp = pendingConnect}
      {@const CpIcon = getProviderIcon(cp.providerId)}
      <Dialog.Header>
        <Dialog.Title class="flex items-center gap-2">
          <CpIcon class="h-5 w-5" />
          {m.account_mail_connect_cta({ provider: getProviderName(cp.providerId) })}
        </Dialog.Title>
        <Dialog.Description>
          {m.account_connect_dialog_description({ provider: getProviderName(cp.providerId) })}
        </Dialog.Description>
      </Dialog.Header>

      <div class="space-y-4 py-2">
        <div class="space-y-2">
          <p class="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {m.account_oauth_purposes_label()}
          </p>
          <div class="flex flex-wrap gap-1">
            {#if cp.purposes.signIn}
              <Badge variant="secondary">{m.account_oauth_purpose_signin()}</Badge>
            {/if}
            {#if cp.purposes.mail}
              <Badge variant="secondary">{m.account_oauth_purpose_mail()}</Badge>
            {/if}
          </div>
        </div>
      </div>

      <Dialog.Footer>
        <Button variant="outline" onclick={() => (pendingConnect = null)}>
          {m.common_cancel()}
        </Button>
        <Button onclick={() => handleConnect(cp.providerId, cp.scope)} disabled={connecting}>
          {connecting ? m.common_saving() : m.account_connect_dialog_continue()}
        </Button>
      </Dialog.Footer>
    {/if}
  </Dialog.Content>
</Dialog.Root>
