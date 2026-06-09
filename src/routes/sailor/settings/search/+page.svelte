<script lang="ts">
  import type { PageData } from './$types';
  import { invalidateAll } from '$app/navigation';
  import { Search, Database, Loader2, RefreshCw } from '@lucide/svelte';
  import { toast } from 'svelte-sonner';
  import * as Card from 'sailorcms/components/ui/card/index.js';
  import { Button } from 'sailorcms/components/ui/button/index.js';
  import { Badge } from 'sailorcms/components/ui/badge/index.js';
  import * as Table from 'sailorcms/components/ui/table/index.js';
  import Header from 'sailorcms/components/sailor/Header.svelte';
  import { reindexSearchIndex } from 'sailorcms/remote/search-index.remote.js';
  import { m } from '$sailor/i18n';

  const { data }: { data: PageData } = $props();

  let isReindexing = $state(false);

  function fmtDate(d: Date | string | null): string {
    if (!d) return '—';
    const date = typeof d === 'string' ? new Date(d) : d;
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleString();
  }

  async function reindex() {
    if (!confirm(m.settings_search_reindex_confirm())) return;
    isReindexing = true;
    const result = await reindexSearchIndex({});
    isReindexing = false;
    if (result.success) {
      toast.success(
        m.settings_search_reindex_complete({
          indexed: result.indexed,
          skipped: result.skipped
        })
      );
      await invalidateAll();
    } else {
      toast.error(result.error || m.settings_search_reindex_failed());
    }
  }
</script>

<svelte:head>
  <title>{m.settings_search_page_title()} - Sailor CMS</title>
</svelte:head>

<div class="container mx-auto px-6">
  <Header title={m.settings_search_page_title()} description={m.settings_search_description()} />

  {#if !data.health}
    <Card.Root>
      <Card.Content class="text-muted-foreground py-6">
        {data.error || m.settings_search_unavailable()}
      </Card.Content>
    </Card.Root>
  {:else}
    {@const health = data.health}
    <div class="flex flex-col gap-6">
      <!-- Summary -->
      <Card.Root>
        <Card.Header>
          <Card.Title class="flex items-center gap-2">
            <Search class="h-5 w-5" />
            {m.settings_search_summary_title()}
          </Card.Title>
          <Card.Description>{m.settings_search_summary_description()}</Card.Description>
        </Card.Header>
        <Card.Content>
          <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <div class="text-muted-foreground text-xs uppercase">
                {m.settings_search_summary_total()}
              </div>
              <div class="text-2xl font-semibold">{health.totalRows.toLocaleString()}</div>
            </div>
            <div>
              <div class="text-muted-foreground text-xs uppercase">
                {m.settings_search_summary_last_updated()}
              </div>
              <div class="text-sm">{fmtDate(health.lastUpdatedAt)}</div>
            </div>
            <div>
              <div class="text-muted-foreground text-xs uppercase">
                {m.settings_search_summary_fts()}
              </div>
              <div class="text-sm">
                {#if health.ftsAvailable}
                  <Badge variant="default">{m.settings_search_summary_fts_on()}</Badge>
                {:else}
                  <Badge variant="secondary">{m.settings_search_summary_fts_off()}</Badge>
                {/if}
              </div>
            </div>
          </div>
        </Card.Content>
      </Card.Root>

      <!-- Per-entity breakdown -->
      <Card.Root>
        <Card.Header>
          <Card.Title class="flex items-center gap-2">
            <Database class="h-5 w-5" />
            {m.settings_search_per_entity_title()}
          </Card.Title>
          <Card.Description>{m.settings_search_per_entity_description()}</Card.Description>
        </Card.Header>
        <Card.Content>
          {#if health.perEntity.length === 0}
            <div class="text-muted-foreground text-sm">
              {m.settings_search_per_entity_empty()}
            </div>
          {:else}
            <Table.Root>
              <Table.Header>
                <Table.Row>
                  <Table.Head>{m.settings_search_col_type()}</Table.Head>
                  <Table.Head>{m.settings_search_col_name()}</Table.Head>
                  <Table.Head class="text-right">{m.settings_search_col_rows()}</Table.Head>
                  <Table.Head>{m.settings_search_col_last_updated()}</Table.Head>
                  <Table.Head>{m.settings_search_col_public()}</Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {#each health.perEntity as row (`${row.entityType}:${row.entityName}`)}
                  <Table.Row>
                    <Table.Cell class="text-muted-foreground text-xs uppercase">
                      {row.entityType}
                    </Table.Cell>
                    <Table.Cell class="font-medium">{row.entityName}</Table.Cell>
                    <Table.Cell class="text-right tabular-nums">
                      {row.count.toLocaleString()}
                    </Table.Cell>
                    <Table.Cell class="text-muted-foreground text-sm">
                      {fmtDate(row.lastUpdatedAt)}
                    </Table.Cell>
                    <Table.Cell>
                      {#if row.searchableInTemplate}
                        <Badge variant="default">{m.settings_search_public_yes()}</Badge>
                      {:else}
                        <Badge variant="secondary">{m.settings_search_public_no()}</Badge>
                      {/if}
                    </Table.Cell>
                  </Table.Row>
                {/each}
              </Table.Body>
            </Table.Root>
          {/if}
        </Card.Content>
      </Card.Root>

      <!-- Per-locale breakdown (only when at least one localized row exists) -->
      {#if health.perLocale.some((r) => r.locale !== null)}
        <Card.Root>
          <Card.Header>
            <Card.Title>{m.settings_search_per_locale_title()}</Card.Title>
            <Card.Description>{m.settings_search_per_locale_description()}</Card.Description>
          </Card.Header>
          <Card.Content>
            <Table.Root>
              <Table.Header>
                <Table.Row>
                  <Table.Head>{m.settings_search_col_locale()}</Table.Head>
                  <Table.Head class="text-right">{m.settings_search_col_rows()}</Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {#each health.perLocale as row (row.locale ?? '__null__')}
                  <Table.Row>
                    <Table.Cell class="font-mono text-sm">
                      {row.locale ?? m.settings_search_locale_none()}
                    </Table.Cell>
                    <Table.Cell class="text-right tabular-nums">
                      {row.count.toLocaleString()}
                    </Table.Cell>
                  </Table.Row>
                {/each}
              </Table.Body>
            </Table.Root>
          </Card.Content>
        </Card.Root>
      {/if}

      <!-- Reindex action -->
      <Card.Root>
        <Card.Header>
          <Card.Title class="flex items-center gap-2">
            <RefreshCw class="h-5 w-5" />
            {m.settings_search_reindex_title()}
          </Card.Title>
          <Card.Description>{m.settings_search_reindex_description()}</Card.Description>
        </Card.Header>
        <Card.Footer>
          <Button variant="outline" onclick={reindex} disabled={isReindexing}>
            {#if isReindexing}
              <Loader2 class="mr-2 h-4 w-4 animate-spin" />
              {m.settings_search_reindex_running()}
            {:else}
              {m.settings_search_reindex_button()}
            {/if}
          </Button>
        </Card.Footer>
      </Card.Root>
    </div>
  {/if}
</div>
