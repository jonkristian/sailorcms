<script lang="ts">
  import { Toaster } from 'svelte-sonner';
  import { ModeWatcher } from 'mode-watcher';
  import * as Sidebar from '$lib/components/ui/sidebar/index.js';
  import { AppSidebar, SiteHeader } from '$lib/components/sailor/dashboard';
  import { Eye, Save } from '@lucide/svelte/icons';
  import PayloadPreview from '$lib/components/sailor/PayloadPreview.svelte';
  import HeaderActionButton from '$lib/components/sailor/HeaderActionButton.svelte';
  import { Button } from '$lib/components/ui/button';
  import ThemeToggle from '$lib/components/sailor/ThemeToggle.svelte';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { getPageTitle } from '$sailor/core/ui/page-title';
  import { toast } from '$sailor/core/ui/toast';
  import { goto } from '$app/navigation';
  import '$sailor/styles/sailor.css';

  let { children } = $props();

  let pageTitle = $derived(getPageTitle(page.url.pathname));

  type UnknownRecord = Record<string, unknown>;
  type HeaderAction =
    | { type: 'payload-preview'; props: Record<string, unknown> }
    | { type: 'preview-link'; props: { title: string; href: string } }
    | {
        type: 'save-button';
        props: { submitting: boolean; submittingText?: string; text: string };
      };

  let navData = $state<{
    collections: UnknownRecord[];
    globals: UnknownRecord[];
    canViewSettings: boolean;
    loading: boolean;
  }>({
    collections: [],
    globals: [],
    canViewSettings: false,
    loading: true
  });
  let headerActionsState = $derived((page.data.headerActions || []) as HeaderAction[]);

  // Handle error messages from redirects (reactive to URL changes)
  $effect(() => {
    const error = page.url.searchParams.get('error');
    if (error) {
      toast.error(error);
      // Clean URL by removing the error parameter
      const url = new URL(page.url);
      url.searchParams.delete('error');
      goto(url.toString(), { replaceState: true });
    }
  });

  onMount(async () => {
    // Load navigation data
    try {
      const response = await fetch('/sailor/api/nav');
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          navData = { ...result.data, loading: false };
        }
      }
    } catch (error) {
      console.error('Failed to load navigation data:', error);
      navData.loading = false;
    }
  });
</script>

<svelte:head>
  <title>{pageTitle}</title>
</svelte:head>

<Sidebar.Provider
  style="--sidebar-width: calc(var(--spacing) * 72); --header-height: calc(var(--spacing) * 12);"
>
  <AppSidebar {navData} user={page.data.user} />
  <Sidebar.Inset>
    <SiteHeader>
      {#if headerActionsState}
        <!-- Left side: Preview actions -->
        <div class="flex items-center gap-2">
          {#each headerActionsState as action, i (action.type + '-' + i)}
            {#if action.type === 'payload-preview'}
              <PayloadPreview {...action.props as any} />
            {:else if action.type === 'preview-link'}
              <HeaderActionButton
                icon={Eye}
                title={(action.props as { title: string }).title}
                href={(action.props as { href: string }).href}
              />
            {/if}
          {/each}
        </div>

        <!-- Right side: Save button -->
        <div class="flex items-center gap-2">
          {#each headerActionsState as action, i (action.type + '-' + i)}
            {#if action.type === 'save-button'}
              <Button
                type="submit"
                form="collection-form"
                size="sm"
                disabled={(action.props as { submitting: boolean }).submitting}
                class="h-8 gap-2"
              >
                <Save class="h-4 w-4" />
                {(action.props as { submitting: boolean; submittingText?: string; text: string })
                  .submitting
                  ? (action.props as { submittingText?: string }).submittingText
                  : (action.props as { text: string }).text}
              </Button>
            {/if}
          {/each}

          <!-- Theme Toggle -->
          <ThemeToggle />
        </div>
      {/if}
    </SiteHeader>
    <div class="flex flex-1 flex-col">
      <div class="@container/main flex flex-1 flex-col gap-2">
        <div class="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
          {@render children()}
        </div>
      </div>
    </div>
  </Sidebar.Inset>
</Sidebar.Provider>

<Toaster duration={3000} />
<ModeWatcher />
