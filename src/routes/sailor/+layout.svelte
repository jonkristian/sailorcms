<script lang="ts">
  import { Toaster } from 'svelte-sonner';
  import { ModeWatcher } from 'mode-watcher';
  import * as Sidebar from '$lib/components/ui/sidebar/index.js';
  import AppSidebar from 'sailorcms/components/sailor/dashboard/layout/app-sidebar.svelte';
  import SiteHeader from 'sailorcms/components/sailor/dashboard/layout/site-header.svelte';
  import { Eye, Save } from '@lucide/svelte';
  import PayloadPreview from 'sailorcms/components/sailor/PayloadPreview.svelte';
  import HeaderActionButton from 'sailorcms/components/sailor/HeaderActionButton.svelte';
  import HeaderRevisionsButton from 'sailorcms/components/sailor/HeaderRevisionsButton.svelte';
  import { Button } from '$lib/components/ui/button';
  import ThemeToggle from 'sailorcms/components/sailor/ThemeToggle.svelte';
  import LocaleSwitcher from 'sailorcms/components/sailor/LocaleSwitcher.svelte';
  import { page } from '$app/state';
  import { getPageTitle } from '$sailor/core/ui/page-title';
  import { toast } from '$sailor/core/ui/toast';
  import { afterNavigate, goto } from '$app/navigation';
  import 'sailorcms/styles/sailor.css';

  let { children, data } = $props();

  let pageTitle = $derived(getPageTitle(page.url.pathname));

  type UnknownRecord = Record<string, unknown>;
  type HeaderAction =
    | { type: 'payload-preview'; props: Record<string, unknown> }
    | { type: 'preview-link'; props: { title: string; href: string } }
    | {
        type: 'save-button';
        props: { submitting: boolean; submittingText?: string; text: string };
      };

  const navData = $derived({
    collections: (data.navData?.collections || []) as UnknownRecord[],
    globals: (data.navData?.globals || []) as UnknownRecord[],
    canViewSettings: data.navData?.canViewSettings ?? false,
    canViewUsers: data.navData?.canViewUsers ?? false,
    canViewFiles: data.navData?.canViewFiles ?? false,
    canViewRecovery: data.navData?.canViewRecovery ?? false,
    loading: false
  });
  let headerActionsState = $derived((page.data.headerActions || []) as HeaderAction[]);

  afterNavigate(({ to }) => {
    if (!to) return;
    const error = to.url.searchParams.get('error');
    if (!error) return;
    toast.error(error, { id: `redirect-error:${error}` });
    const url = new URL(to.url);
    url.searchParams.delete('error');
    goto(url.toString(), { replaceState: true });
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
          <HeaderRevisionsButton />
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

          <!-- Locale Switcher + Theme Toggle -->
          <LocaleSwitcher />
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
<ModeWatcher defaultMode="system" track={true} />
