<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { authClient } from 'sailorcms/core/auth';
  import { Button } from 'sailorcms/components/ui/button/index.js';
  import { Input } from 'sailorcms/components/ui/input/index.js';
  import { Label } from 'sailorcms/components/ui/label/index.js';
  import { Card, CardContent } from 'sailorcms/components/ui/card/index.js';
  import { Alert, AlertDescription } from 'sailorcms/components/ui/alert/index.js';
  import { AlertCircle } from '@lucide/svelte';
  import emblemSvg from 'sailorcms/assets/emblem.svg?raw';
  import PasswordStrength from 'sailorcms/components/sailor/PasswordStrength.svelte';
  import { m } from '$sailor/i18n';

  let password = $state('');
  let confirmPassword = $state('');
  let error = $state('');
  let loading = $state(false);

  const token = $derived(page.url.searchParams.get('token'));
  const linkError = $derived(page.url.searchParams.get('error'));

  async function handleSubmit(event: Event) {
    event.preventDefault();
    error = '';
    loading = true;

    if (!token) {
      error = m.auth_reset_no_token();
      loading = false;
      return;
    }
    if (!password || !confirmPassword) {
      error = m.auth_error_fill_all_fields();
      loading = false;
      return;
    }
    if (password !== confirmPassword) {
      error = m.toast_passwords_no_match();
      loading = false;
      return;
    }
    if (password.length < 8) {
      error = m.auth_signup_password_too_short();
      loading = false;
      return;
    }

    try {
      const result = await authClient.resetPassword({ newPassword: password, token });
      if (result?.error) {
        error = result.error.message || m.auth_reset_error_generic();
      } else {
        goto(`/sailor/auth/login?message=${encodeURIComponent(m.auth_reset_success_message())}`);
      }
    } catch (e) {
      console.error('Reset password error:', e);
      error = m.auth_reset_error_generic();
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>{m.auth_reset_page_title()} - Sailor CMS</title>
</svelte:head>

<div class="container flex h-screen w-screen flex-col items-center justify-center">
  {#if error}
    <Alert variant="destructive" class="mb-4 max-w-[400px]">
      <AlertCircle class="h-4 w-4" />
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  {/if}

  <Card class="w-[400px]">
    <div class="flex flex-col items-center px-6 pt-6 pb-4">
      <div class="mb-4 flex justify-center">
        <div
          class="bg-primary text-primary-foreground inline-flex h-14 w-14 items-center justify-center rounded-full shadow-lg"
        >
          <div class="h-8 w-8">{@html emblemSvg}</div>
        </div>
      </div>
      <h1 class="text-2xl font-bold tracking-tight">{m.auth_reset_welcome()}</h1>
      <p class="text-muted-foreground mt-1 text-center text-sm">
        {m.auth_reset_subtitle()}
      </p>
    </div>

    <CardContent class="pt-0">
      {#if linkError || !token}
        <Alert variant="destructive" class="mb-4">
          <AlertCircle class="h-4 w-4" />
          <AlertDescription>
            {linkError ? m.auth_reset_invalid_token() : m.auth_reset_no_token()}
          </AlertDescription>
        </Alert>
        <a
          href="/sailor/auth/forgot-password"
          class="text-primary text-sm font-medium hover:underline"
        >
          {m.auth_reset_request_new()}
        </a>
      {:else}
        <form onsubmit={handleSubmit}>
          <div class="grid w-full items-center gap-4">
            <div class="flex flex-col space-y-1.5">
              <Label for="password">{m.auth_field_password()}</Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder={m.auth_field_password_placeholder()}
                autocomplete="new-password"
                required
                bind:value={password}
              />
              <PasswordStrength {password} />
            </div>
            <div class="flex flex-col space-y-1.5">
              <Label for="confirmPassword">{m.auth_field_confirm_password()}</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                placeholder={m.auth_field_confirm_password_placeholder()}
                autocomplete="new-password"
                required
                bind:value={confirmPassword}
                aria-invalid={!!confirmPassword && password !== confirmPassword}
              />
            </div>
            <div class="flex justify-between pt-4">
              <Button type="submit" class="w-full" disabled={loading}>
                {loading ? m.auth_reset_resetting() : m.auth_reset_button()}
              </Button>
            </div>
          </div>
        </form>
      {/if}
    </CardContent>
  </Card>

  <div class="mt-6 text-center">
    <a href="/sailor/auth/login" class="text-muted-foreground text-sm hover:underline">
      {m.auth_forgot_back_to_login()}
    </a>
  </div>
</div>
