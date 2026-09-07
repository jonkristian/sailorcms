<script lang="ts">
  import { Inbox } from '@lucide/svelte';
  import { m } from '$sailor/i18n';

  interface Props {
    /**
     * Rows from the other side of the relation, already resolved and ordered by
     * the read path. Read-only: the edge is owned by the entity that declares
     * it, so editing it from here would need its own permission and revision
     * story.
     */
    value: Array<{ id: string; title?: string; slug?: string; status?: string }> | undefined;
    field: {
      relation?: unknown;
      reverse?: { fromCollection?: string; fromGlobal?: string; fromBlock?: string };
    };
  }

  let { value, field }: Props = $props();

  const items = $derived(Array.isArray(value) ? value : []);

  // Where the owning rows live, so each one can link to its own editor.
  const href = $derived.by(() => {
    const spec = field.reverse ?? {};
    if (spec.fromCollection)
      return (id: string) => `/sailor/collections/${spec.fromCollection}/${id}`;
    if (spec.fromGlobal) return (id: string) => `/sailor/globals/${spec.fromGlobal}/${id}`;
    return null;
  });
</script>

<div class="border-input bg-input-bg overflow-hidden rounded-lg border">
  {#if items.length === 0}
    <div class="text-muted-foreground flex flex-col items-center justify-center gap-2 p-6 text-xs">
      <Inbox class="h-5 w-5" aria-hidden="true" />
      <span>{m.relation_browser_empty()}</span>
    </div>
  {:else}
    <div class="divide-border divide-y">
      {#each items as item (item.id)}
        <div class="flex items-center gap-2 px-3 py-2 text-sm">
          {#if href}
            <a
              href={href(item.id)}
              class="min-w-0 flex-1 truncate hover:underline"
              title={item.title}
            >
              {item.title || item.id}
            </a>
          {:else}
            <span class="min-w-0 flex-1 truncate">{item.title || item.id}</span>
          {/if}
          {#if item.status && item.status !== 'published'}
            <span class="text-muted-foreground shrink-0 text-xs capitalize">{item.status}</span>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
