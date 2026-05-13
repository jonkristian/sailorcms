<script lang="ts">
  import * as Command from 'sailorcms/components/ui/command/index.js';
  import { adminSearch } from 'sailorcms/remote/admin-search.remote.js';
  import type { AdminSearchResult } from 'sailorcms/remote/admin-search.remote.js';
  import { m } from '$sailor/i18n';
  import Search from '@lucide/svelte/icons/search';

  const EMPTY: AdminSearchResult = {
    content: [],
    files: [],
    users: [],
    destinations: [],
    total: 0
  };

  let open = $state(false);
  let value = $state('');
  let results = $state<AdminSearchResult>(EMPTY);
  let loading = $state(false);

  let pendingTimer: ReturnType<typeof setTimeout> | null = null;
  let inflightToken = 0;

  function scheduleSearch() {
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
    const q = value.trim();
    if (!q) {
      results = EMPTY;
      loading = false;
      return;
    }
    loading = true;
    pendingTimer = setTimeout(() => {
      void runSearch(q);
    }, 600);
  }

  async function runSearch(q: string) {
    const token = ++inflightToken;
    try {
      const next = await adminSearch({ q }).run();
      // Drop stale responses — only keep the most recent token's result.
      if (token !== inflightToken) return;
      results = next;
    } catch (err) {
      if (token !== inflightToken) return;
      console.error('admin search failed', err);
      results = EMPTY;
    } finally {
      if (token === inflightToken) loading = false;
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      value = '';
      results = EMPTY;
      loading = false;
      inflightToken++; // invalidate any inflight response
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        pendingTimer = null;
      }
    }
  }

  function onWindowKey(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      open = !open;
    }
  }

  // After clicking a result, the LinkItem navigates; close the dialog so
  // the next open starts fresh.
  function closeDialog() {
    open = false;
  }
</script>

<svelte:window onkeydown={onWindowKey} />

<button
  type="button"
  onclick={() => (open = true)}
  class="text-muted-foreground bg-input/30 border-input/30 hover:bg-input/50 inline-flex h-8 items-center gap-2 rounded-md border px-2 text-sm transition-colors"
  aria-label={m.omnibar_placeholder()}
>
  <Search class="size-4" />
  <span class="hidden md:inline">{m.omnibar_placeholder()}</span>
  <kbd
    class="bg-muted text-muted-foreground ml-2 hidden h-5 items-center gap-1 rounded border px-1.5 font-mono text-[10px] font-medium select-none md:inline-flex"
  >
    <span class="text-xs">⌘</span>K
  </kbd>
</button>

<Command.Dialog
  bind:open
  onOpenChange={handleOpenChange}
  shouldFilter={false}
  title={m.omnibar_placeholder()}
  description={m.omnibar_placeholder()}
>
  <Command.Input bind:value oninput={scheduleSearch} placeholder={m.omnibar_placeholder()} />
  <Command.List>
    {#if loading}
      <Command.Loading class="text-muted-foreground py-6 text-center text-sm">
        {m.common_searching()}
      </Command.Loading>
    {/if}

    {#if !loading && value.trim() && results.total === 0}
      <Command.Empty>{m.omnibar_no_results()}</Command.Empty>
    {/if}

    {#if results.content.length}
      <Command.Group heading={m.omnibar_group_content()}>
        {#each results.content as hit (hit.id)}
          <Command.LinkItem value={hit.id} href={hit.href} onclick={closeDialog}>
            <span class="truncate">{hit.title}</span>
            {#if hit.subtitle}
              <span class="text-muted-foreground ml-auto truncate text-xs">{hit.subtitle}</span>
            {/if}
          </Command.LinkItem>
        {/each}
      </Command.Group>
    {/if}

    {#if results.files.length}
      <Command.Group heading={m.omnibar_group_files()}>
        {#each results.files as hit (hit.id)}
          <Command.LinkItem value={hit.id} href={hit.href} onclick={closeDialog}>
            <span class="truncate">{hit.title}</span>
            {#if hit.subtitle}
              <span class="text-muted-foreground ml-auto truncate text-xs">{hit.subtitle}</span>
            {/if}
          </Command.LinkItem>
        {/each}
      </Command.Group>
    {/if}

    {#if results.users.length}
      <Command.Group heading={m.omnibar_group_users()}>
        {#each results.users as hit (hit.id)}
          <Command.LinkItem value={hit.id} href={hit.href} onclick={closeDialog}>
            <span class="truncate">{hit.title}</span>
            {#if hit.subtitle}
              <span class="text-muted-foreground ml-auto truncate text-xs">{hit.subtitle}</span>
            {/if}
          </Command.LinkItem>
        {/each}
      </Command.Group>
    {/if}

    {#if results.destinations.length}
      <Command.Group heading={m.omnibar_group_destinations()}>
        {#each results.destinations as hit (hit.id)}
          <Command.LinkItem value={hit.id} href={hit.href} onclick={closeDialog}>
            {#if hit.subtitle}
              <span class="text-muted-foreground truncate">{hit.subtitle}</span>
              <span class="text-muted-foreground/60" aria-hidden="true">›</span>
            {/if}
            <span class="truncate">{hit.title}</span>
          </Command.LinkItem>
        {/each}
      </Command.Group>
    {/if}
  </Command.List>
</Command.Dialog>
