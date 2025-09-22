<script lang="ts">
  import { page } from '$app/state';
  import { invalidateAll } from '$app/navigation';
  import emblemSvg from '$lib/sailor/assets/emblem.svg?raw';
  import * as Avatar from '$lib/components/ui/avatar/index.js';
  import { authClient } from '$sailor/core/auth';

  type Props = {
    loggedInOnly?: boolean;
  };

  let { loggedInOnly = false }: Props = $props();

  const user = $derived(page.data.user);
  const siteSettings = $derived(page.data.siteSettings);
  let open = $state(false);

  function togglePopover() {
    open = !open;
  }

  function closePopover() {
    open = false;
  }

  async function handleSignOut() {
    await authClient.signOut();
    await invalidateAll(); // Refresh page data to update server-side session state
    closePopover();
    // Stay on the current page - the widget will update to show signed-out state
  }

  // Close popover when clicking outside
  function handleOutsideClick(event: MouseEvent) {
    const target = event.target as Element;
    if (!target.closest('.sailor-widget-container')) {
      closePopover();
    }
  }
</script>

<svelte:window on:click={handleOutsideClick} />

<!-- Self-contained floating AuthWidget with dark theme -->
{#if !loggedInOnly || user}
  <div class="sailor-widget-container">
    <button
      class="sailor-widget-trigger"
      onclick={togglePopover}
      type="button"
      aria-label="Sailor CMS Widget"
    >
      <div style="width: 2.25rem; height: 2.25rem;">{@html emblemSvg}</div>
    </button>

    <div class="sailor-widget-popover" class:open>
      <div class="sailor-widget-content">
        {#if user}
          <!-- Logged in user content -->
          <div class="sailor-widget-header">
            <div class="sailor-widget-avatar">
              <Avatar.Root class="h-6 w-6 rounded-full">
                {#if user.image}
                  <Avatar.Image src={user.image} alt={user.name} />
                {/if}
                <Avatar.Fallback class="text-xs font-medium">
                  {user.name
                    .split(' ')
                    .map((n: string) => n[0])
                    .join('')
                    .toUpperCase()}
                </Avatar.Fallback>
              </Avatar.Root>
            </div>
            <h3 class="sailor-widget-title">Hello, {user.name}</h3>
            <p class="sailor-widget-subtitle">Welcome back to your dashboard</p>
          </div>

          <div class="sailor-widget-actions">
            <a
              class="sailor-widget-button primary"
              href="/sailor"
              data-sveltekit-preload-data="off"
              data-sveltekit-preload-code="off"
              data-sveltekit-reload
              onclick={closePopover}
            >
              <svg class="sailor-widget-icon" viewBox="0 0 24 24">
                <path
                  d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
                />
                <circle cx="12" cy="12" r="3" />
              </svg>
              Admin Dashboard
            </a>
            <a
              class="sailor-widget-button secondary"
              href="/sailor/account"
              data-sveltekit-preload-data="off"
              data-sveltekit-preload-code="off"
              data-sveltekit-reload
              onclick={closePopover}
            >
              <svg class="sailor-widget-icon" viewBox="0 0 24 24">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              Edit Profile
            </a>
            <button class="sailor-widget-button secondary" onclick={handleSignOut}>
              <svg class="sailor-widget-icon" viewBox="0 0 24 24">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16,17 21,12 16,7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Sign Out
            </button>
          </div>
        {:else}
          <!-- Guest user content -->
          <div class="sailor-widget-header">
            <div class="sailor-widget-avatar">
              <div style="width: 1.5rem; height: 1.5rem;">{@html emblemSvg}</div>
            </div>
            <h3 class="sailor-widget-title">Welcome to Sailor CMS</h3>
            <p class="sailor-widget-subtitle">
              Sign in to your account or create a new one to get started.
            </p>
          </div>

          <div class="sailor-widget-actions">
            <a
              class="sailor-widget-button primary"
              href="/sailor/auth/login"
              data-sveltekit-preload-data="off"
              data-sveltekit-preload-code="off"
              data-sveltekit-reload
              onclick={closePopover}
            >
              <svg class="sailor-widget-icon" viewBox="0 0 24 24">
                <path d="M15 3h6v18h-6" />
                <polyline points="10,17 15,12 10,7" />
                <line x1="15" y1="12" x2="3" y2="12" />
              </svg>
              Sign In
            </a>
            {#if siteSettings?.registrationEnabled !== false}
              <a
                class="sailor-widget-button secondary"
                href="/sailor/auth/signup"
                data-sveltekit-preload-data="off"
                data-sveltekit-preload-code="off"
                data-sveltekit-reload
                onclick={closePopover}
              >
                <svg class="sailor-widget-icon" viewBox="0 0 24 24">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <line x1="19" y1="8" x2="19" y2="14" />
                  <line x1="22" y1="11" x2="16" y2="11" />
                </svg>
                Create Account
              </a>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  /* Self-contained AuthWidget styles - dark theme by default */
  .sailor-widget-container {
    all: initial;
    font-family:
      system-ui,
      -apple-system,
      BlinkMacSystemFont,
      'Segoe UI',
      Roboto,
      'Helvetica Neue',
      Arial,
      sans-serif;
    position: fixed;
    right: 1.5rem;
    bottom: 1.5rem;
    z-index: 10000;

    /* Dark theme colors */
    --widget-primary: #2f81f7;
    --widget-primary-foreground: #ffffff;
    --widget-background: #161b22;
    --widget-foreground: #f0f6fc;
    --widget-card: #21262d;
    --widget-border: #30363d;
    --widget-muted: #21262d;
    --widget-muted-foreground: #8b949e;
    --widget-accent: #262c36;
    --widget-shadow: rgba(0, 0, 0, 0.4);
    --widget-radius: 0.5rem;
  }

  .sailor-widget-container * {
    box-sizing: border-box;
  }

  .sailor-widget-trigger {
    background: var(--widget-primary);
    color: var(--widget-primary-foreground);
    width: 3.5rem;
    height: 3.5rem;
    border-radius: 50%;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 10px 25px var(--widget-shadow);
    transition: all 0.2s ease;
    position: relative;
  }

  .sailor-widget-trigger:hover {
    transform: scale(1.05);
    box-shadow: 0 15px 35px var(--widget-shadow);
  }

  .sailor-widget-popover {
    position: absolute;
    bottom: 4rem;
    right: 0;
    width: 20rem;
    background: var(--widget-card);
    border: 1px solid var(--widget-border);
    border-radius: var(--widget-radius);
    box-shadow: 0 10px 25px var(--widget-shadow);
    padding: 1rem;
    opacity: 0;
    visibility: hidden;
    transform: translateY(0.5rem);
    transition: all 0.2s ease;
    z-index: 10001;
  }

  .sailor-widget-popover.open {
    opacity: 1;
    visibility: visible;
    transform: translateY(0);
  }

  .sailor-widget-content {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    color: var(--widget-foreground);
  }

  .sailor-widget-header {
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .sailor-widget-avatar {
    background: color-mix(in srgb, var(--widget-primary) 15%, transparent);
    width: 3rem;
    height: 3rem;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto;
    color: var(--widget-primary);
  }

  .sailor-widget-title {
    font-weight: 500;
    font-size: 1rem;
    margin: 0;
    color: var(--widget-foreground);
  }

  .sailor-widget-subtitle {
    font-size: 0.875rem;
    margin: 0;
    color: var(--widget-muted-foreground);
    line-height: 1.4;
  }

  .sailor-widget-actions {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .sailor-widget-button {
    padding: 0.5rem 1rem;
    border-radius: calc(var(--widget-radius) - 2px);
    font-size: 0.875rem;
    font-weight: 500;
    text-decoration: none;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    transition: all 0.2s ease;
    border: 1px solid transparent;
    cursor: pointer;
  }

  .sailor-widget-button.primary {
    background: var(--widget-primary);
    color: var(--widget-primary-foreground);
  }

  .sailor-widget-button.primary:hover {
    background: color-mix(in srgb, var(--widget-primary) 85%, black);
  }

  .sailor-widget-button.secondary {
    background: var(--widget-accent);
    color: var(--widget-foreground);
    border-color: var(--widget-border);
  }

  .sailor-widget-button.secondary:hover {
    background: var(--widget-muted);
  }

  .sailor-widget-icon {
    width: 1rem;
    height: 1rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
    flex-shrink: 0;
  }
</style>
