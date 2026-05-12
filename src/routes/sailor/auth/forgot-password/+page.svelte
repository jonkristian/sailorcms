<script lang="ts">
  import { authClient } from 'sailorcms/core/auth';
  import { page } from '$app/state';
  import { Button } from 'sailorcms/components/ui/button/index.js';
  import { Input } from 'sailorcms/components/ui/input/index.js';
  import { Label } from 'sailorcms/components/ui/label/index.js';
  import { Card, CardContent } from 'sailorcms/components/ui/card/index.js';
  import { Alert, AlertDescription } from 'sailorcms/components/ui/alert/index.js';
  import { AlertCircle, CheckCircle } from '@lucide/svelte';
  import emblemSvg from 'sailorcms/assets/emblem.svg?raw';
  import Turnstile from 'sailorcms/utils/turnstile/Turnstile.svelte';
  import { m } from '$sailor/i18n';

  let email = $state('');
  let turnstileToken = $state('');
  let error = $state('');
  let sent = $state(false);
  let loading = $state(false);

  async function handleSubmit(event: Event) {
    event.preventDefault();
    error = '';
    loading = true;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      error = m.auth_error_invalid_email();
      loading = false;
      return;
    }

    try {
      const result = await authClient.requestPasswordReset(
        {
          email,
          redirectTo: `${page.url.origin}/sailor/auth/reset-password`
        },
        {
          headers: turnstileToken ? { 'x-captcha-response': turnstileToken } : undefined
        }
      );

      if (result?.error) {
        error = result.error.message || m.auth_forgot_error_generic();
      } else {
        sent = true;
      }
    } catch (e) {
      console.error('Forgot password error:', e);
      error = m.auth_forgot_error_generic();
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>{m.auth_forgot_page_title()} - Sailor CMS</title>
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
      <h1 class="text-2xl font-bold tracking-tight">{m.auth_forgot_welcome()}</h1>
      <p class="text-muted-foreground mt-1 text-center text-sm">
        {m.auth_forgot_subtitle()}
      </p>
    </div>

    <CardContent class="pt-0">
      {#if sent}
        <Alert class="mb-4">
          <CheckCircle class="h-4 w-4" />
          <AlertDescription>{m.auth_forgot_success()}</AlertDescription>
        </Alert>
      {:else}
        <form onsubmit={handleSubmit}>
          <div class="grid w-full items-center gap-4">
            <div class="flex flex-col space-y-1.5">
              <Label for="email">{m.auth_field_email()}</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder={m.auth_field_email_placeholder()}
                required
                bind:value={email}
              />
            </div>
            <Turnstile bind:token={turnstileToken} />
            <div class="flex justify-between pt-4">
              <Button type="submit" class="w-full" disabled={loading}>
                {loading ? m.auth_forgot_sending() : m.auth_forgot_button()}
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
