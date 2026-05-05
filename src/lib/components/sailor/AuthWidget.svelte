<script lang="ts">
  import './AuthWidget.css';
  import { page } from '$app/state';
  import { invalidateAll } from '$app/navigation';
  import emblemSvg from 'sailorcms/assets/emblem.svg?raw';
  import * as Avatar from 'sailorcms/components/ui/avatar/index.js';
  import { authClient } from 'sailorcms/core/auth';
  import { m } from '$sailor/i18n';

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
      aria-label={m.auth_widget_aria()}
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
            <h3 class="sailor-widget-title">{m.auth_widget_hello({ name: user.name })}</h3>
            <p class="sailor-widget-subtitle">{m.auth_widget_welcome_back()}</p>
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
              {m.auth_widget_admin_dashboard()}
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
              {m.auth_widget_edit_profile()}
            </a>
            <button class="sailor-widget-button secondary" onclick={handleSignOut}>
              <svg class="sailor-widget-icon" viewBox="0 0 24 24">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16,17 21,12 16,7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              {m.auth_widget_signout()}
            </button>
          </div>
        {:else}
          <!-- Guest user content -->
          <div class="sailor-widget-header">
            <div class="sailor-widget-avatar">
              <div style="width: 1.5rem; height: 1.5rem;">{@html emblemSvg}</div>
            </div>
            <h3 class="sailor-widget-title">{m.auth_widget_welcome()}</h3>
            <p class="sailor-widget-subtitle">{m.auth_widget_signin_subtitle()}</p>
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
              {m.auth_widget_signin()}
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
                {m.auth_widget_create_account()}
              </a>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
