<script lang="ts">
  import { page } from '$app/state';
  import { authClient } from 'sailorcms/core/auth';
  import { Button } from 'sailorcms/components/ui/button/index.js';
  import { Input } from 'sailorcms/components/ui/input/index.js';
  import { Label } from 'sailorcms/components/ui/label/index.js';
  import { Card, CardContent } from 'sailorcms/components/ui/card/index.js';
  import { Alert, AlertDescription } from 'sailorcms/components/ui/alert/index.js';
  import { AlertCircle } from '@lucide/svelte';
  import emblemSvg from 'sailorcms/assets/emblem.svg?raw';
  import { m } from '$sailor/i18n';

  let { data } = $props();
  let email = $state('');
  let password = $state('');
  let error = $state('');
  let loading = $state(false);

  // Handle OAuth
  async function handleGitHubOAuth() {
    try {
      const result = await authClient.signIn.social({
        provider: 'github',
        callbackURL: '/sailor'
      });

      // If we get a successful result, redirect
      if (result?.data && 'user' in result.data) {
        window.location.href = '/sailor';
      } else if (result && 'user' in result) {
        window.location.href = '/sailor';
      }
    } catch (error) {
      console.error('GitHub OAuth error:', error);
      error = m.auth_login_error_github();
    }
  }

  async function handleSubmit(event: Event) {
    event.preventDefault();
    error = '';
    loading = true;

    // Basic client-side validation
    if (!email || !password) {
      error = m.auth_error_fill_all_fields();
      loading = false;
      return;
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      error = m.auth_error_invalid_email();
      loading = false;
      return;
    }

    try {
      const result = await authClient.signIn.email({
        email,
        password
      });

      if (result && result.data && 'user' in result.data) {
        // Force a page reload to ensure session is established
        window.location.href = '/sailor';
      } else if (result && 'user' in result) {
        // Force a page reload to ensure session is established
        window.location.href = '/sailor';
      } else {
        error = result?.error?.message || m.auth_login_invalid_credentials();
      }
    } catch (e) {
      error = m.auth_login_error_generic();
      console.error('Login error:', e);
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>{m.auth_login_page_title()} - Sailor CMS</title>
</svelte:head>

<div class="container flex h-screen w-screen flex-col items-center justify-center">
  {#if page.url.searchParams.get('message')}
    <Alert class="mb-4 max-w-[400px]">
      <AlertCircle class="h-4 w-4" />
      <AlertDescription>{page.url.searchParams.get('message')}</AlertDescription>
    </Alert>
  {/if}

  {#if error}
    <Alert variant="destructive" class="mb-4 max-w-[400px]">
      <AlertCircle class="h-4 w-4" />
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  {/if}

  <Card class="w-[400px]">
    <!-- Card Header with Branding -->
    <div class="flex flex-col items-center px-6 pt-6 pb-4">
      <div class="mb-4 flex justify-center">
        <div
          class="bg-primary text-primary-foreground inline-flex h-14 w-14 items-center justify-center rounded-full shadow-lg"
        >
          <div class="h-8 w-8">{@html emblemSvg}</div>
        </div>
      </div>
      <h1 class="text-2xl font-bold tracking-tight">{m.auth_login_welcome()}</h1>
      <p class="text-muted-foreground mt-1 text-center text-sm">
        {m.auth_login_subtitle()}
      </p>
    </div>

    <CardContent class="pt-0">
      {#if data?.hasGitHubOAuth}
        <!-- GitHub Login Button -->
        <div class="mb-6">
          <Button type="button" variant="outline" class="mb-4 w-full" onclick={handleGitHubOAuth}>
            <svg class="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"
              />
            </svg>
            {m.auth_oauth_github()}
          </Button>

          <div class="relative">
            <div class="absolute inset-0 flex items-center">
              <hr class="w-full" />
            </div>
            <div class="relative flex justify-center text-xs uppercase">
              <span class="bg-background text-muted-foreground px-2">{m.auth_oauth_divider()}</span>
            </div>
          </div>
        </div>
      {/if}

      <form method="POST" onsubmit={handleSubmit}>
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
          <div class="flex flex-col space-y-1.5">
            <Label for="password">{m.auth_field_password()}</Label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder={m.auth_field_password_placeholder()}
              required
              bind:value={password}
            />
          </div>
          <div class="flex justify-between pt-4">
            <Button type="submit" class="w-full" disabled={loading}>
              {loading ? m.auth_login_signing_in() : m.auth_login_button()}
            </Button>
          </div>
        </div>
      </form>
    </CardContent>
  </Card>

  <!-- Navigation links below the card -->
  {#if data.registrationEnabled}
    <div class="mt-6 text-center">
      <a href="/sailor/auth/signup" class="text-muted-foreground text-sm hover:underline">
        {m.auth_login_no_account()}
      </a>
    </div>
  {/if}
</div>
