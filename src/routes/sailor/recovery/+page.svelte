<script lang="ts">
  import Header from 'sailorcms/components/sailor/Header.svelte';
  import { Badge } from '$lib/components/ui/badge';
  import Inbox from '@lucide/svelte/icons/inbox';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import { m } from '$sailor/i18n';
  import type { PageData } from './$types';

  const { data }: { data: PageData } = $props();

  type ListEntry = {
    href: string;
    label: string;
    count: number;
  };

  const filesEntry = $derived<ListEntry[]>(
    data.filesCount > 0
      ? [
          {
            href: '/sailor/recovery/files',
            label: m.recovery_section_files(),
            count: data.filesCount
          }
        ]
      : []
  );

  const collectionEntries = $derived<ListEntry[]>(
    data.collections.map((c) => ({
      href: `/sailor/recovery/collections/${c.slug}`,
      label: c.label,
      count: c.count
    }))
  );

  const globalEntries = $derived<ListEntry[]>(
    data.globals.map((g) => ({
      href: `/sailor/recovery/globals/${g.slug}`,
      label: g.label,
      count: g.count
    }))
  );
</script>

<svelte:head>
  <title>{m.recovery_page_title()} - Sailor CMS</title>
</svelte:head>

<div class="container mx-auto px-6">
  <Header
    title={m.recovery_page_title()}
    description={m.recovery_page_description()}
    itemCount={data.totalItems}
    showCountBadge={true}
  />

  {#if data.totalItems === 0}
    <div class="rounded-lg border p-12 text-center">
      <Inbox class="text-muted-foreground mx-auto my-2 size-8" />
      <h3 class="text-lg font-medium">{m.recovery_empty_title()}</h3>
      <p class="text-muted-foreground mt-1">
        {m.recovery_empty_text()}
      </p>
    </div>
  {:else}
    <div class="space-y-8">
      {#if filesEntry.length > 0}
        <section>
          <h2 class="mb-3 text-lg font-semibold">{m.recovery_section_files()}</h2>
          <div class="divide-border/40 divide-y rounded-lg border">
            {#each filesEntry as entry}
              <a
                href={entry.href}
                class="hover:bg-muted/40 flex items-center justify-between px-4 py-3 transition-colors"
              >
                <span class="font-medium">{entry.label}</span>
                <div class="flex items-center gap-3">
                  <Badge variant="secondary">{entry.count}</Badge>
                  <ChevronRight class="text-muted-foreground size-4" />
                </div>
              </a>
            {/each}
          </div>
        </section>
      {/if}

      {#if collectionEntries.length > 0}
        <section>
          <h2 class="mb-3 text-lg font-semibold">{m.recovery_section_collections()}</h2>
          <div class="divide-border/40 divide-y rounded-lg border">
            {#each collectionEntries as entry}
              <a
                href={entry.href}
                class="hover:bg-muted/40 flex items-center justify-between px-4 py-3 transition-colors"
              >
                <span class="font-medium">{entry.label}</span>
                <div class="flex items-center gap-3">
                  <Badge variant="secondary">{entry.count}</Badge>
                  <ChevronRight class="text-muted-foreground size-4" />
                </div>
              </a>
            {/each}
          </div>
        </section>
      {/if}

      {#if globalEntries.length > 0}
        <section>
          <h2 class="mb-3 text-lg font-semibold">{m.recovery_section_globals()}</h2>
          <div class="divide-border/40 divide-y rounded-lg border">
            {#each globalEntries as entry}
              <a
                href={entry.href}
                class="hover:bg-muted/40 flex items-center justify-between px-4 py-3 transition-colors"
              >
                <span class="font-medium">{entry.label}</span>
                <div class="flex items-center gap-3">
                  <Badge variant="secondary">{entry.count}</Badge>
                  <ChevronRight class="text-muted-foreground size-4" />
                </div>
              </a>
            {/each}
          </div>
        </section>
      {/if}
    </div>
  {/if}
</div>
