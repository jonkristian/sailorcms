<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import * as Popover from 'sailorcms/components/ui/popover/index.js';
  import * as Command from 'sailorcms/components/ui/command/index.js';
  import { Button } from 'sailorcms/components/ui/button/index.js';
  import { ChevronsUpDown, Check, X } from '@lucide/svelte';
  import { searchRelationOptions } from 'sailorcms/remote/relations.remote.js';
  import { m } from '$sailor/i18n';

  interface Props {
    fields: Record<string, any>;
    /** The collection being listed, so self-referential relations can be skipped. */
    slug?: string;
  }

  type Option = { slug: string; title: string };

  let { fields, slug }: Props = $props();

  // Not every many-to-many is a useful filter. A self-referential one is
  // per-item curation ("related products"), not a shared taxonomy — filtering
  // a list by it is meaningless, and the list would be the whole collection.
  // `filterable: false` opts any other relation out.
  const relationFields = $derived(
    Object.entries(fields ?? {})
      .filter(([, def]) => def?.type === 'relation' && def?.relation?.type === 'many-to-many')
      .filter(([, def]) => def?.relation?.filterable !== false)
      .filter(([, def]) => !slug || def?.relation?.targetCollection !== slug)
      .map(([key, def]) => ({
        key,
        label: def?.label || def?.title || key,
        relation: def.relation
      }))
  );

  let open = $state(false);
  let loaded = $state(false);
  let options = $state<Record<string, Option[]>>({});

  const activeField = $derived(page.url.searchParams.get('relation'));
  const activeValue = $derived(page.url.searchParams.get('relationValue'));
  const activeLabel = $derived.by(() => {
    if (!activeField || !activeValue) return null;
    const field = relationFields.find((f) => f.key === activeField);
    const option = (options[activeField] ?? []).find((o) => o.slug === activeValue);
    return field
      ? m.collections_filter_relation_active({
          field: field.label,
          value: option?.title ?? activeValue
        })
      : null;
  });

  // Fetched when the popover first opens rather than on mount — a list page
  // shouldn't pay for a filter nobody opened. Taxonomies are small, so the
  // whole set is loaded once and `Command` searches it client-side.
  async function loadOptions() {
    if (loaded) return;
    loaded = true;
    const results = await Promise.all(
      relationFields.map(async (field) => {
        try {
          const result = await searchRelationOptions({ target: field.relation, limit: 200 });
          if (!result.success) return [field.key, [] as Option[]] as const;
          return [
            field.key,
            (result.items ?? [])
              .filter((item: any) => item.slug)
              .map((item: any) => ({ slug: item.slug, title: item.title }))
          ] as const;
        } catch {
          return [field.key, [] as Option[]] as const;
        }
      })
    );
    options = Object.fromEntries(results);
  }

  function apply(key: string | null, slugValue: string | null) {
    const params = new URLSearchParams(page.url.searchParams);
    if (!key || !slugValue) {
      params.delete('relation');
      params.delete('relationValue');
      params.delete('relationRecursive');
    } else {
      params.set('relation', key);
      params.set('relationValue', slugValue);
      // Filtering by a parent category means "everything under it". Set
      // unconditionally: `parent_id` is a core column on every collection and
      // global, so on a flat taxonomy the descendant walk returns the target
      // itself and the result is unchanged.
      params.set('relationRecursive', '1');
    }
    // A new filter invalidates the current page position.
    params.delete('page');
    open = false;
    goto(`?${params.toString()}`, { keepFocus: true, noScroll: true });
  }
</script>

{#if relationFields.length > 0}
  <!-- One control for every relation, rather than a select per field: the bar
       stays the same size whether a collection has one taxonomy or five, and
       the options are searchable instead of a long scroll. -->
  <div class="flex items-center gap-1">
    <Popover.Root bind:open onOpenChange={(next) => next && loadOptions()}>
      <Popover.Trigger>
        {#snippet child({ props })}
          <Button {...props} variant="outline" class="h-9 justify-between gap-2">
            <span class="truncate">
              {activeLabel ?? m.collections_filter_relation_trigger()}
            </span>
            <ChevronsUpDown class="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        {/snippet}
      </Popover.Trigger>
      <Popover.Content class="w-72 p-0" align="start">
        <Command.Root>
          <Command.Input placeholder={m.relation_search_placeholder()} />
          <Command.List class="max-h-72">
            <Command.Empty>{m.relation_no_items_found()}</Command.Empty>
            {#each relationFields as field (field.key)}
              {#if (options[field.key] ?? []).length > 0}
                <Command.Group heading={field.label}>
                  {#each options[field.key] as option (option.slug)}
                    <Command.Item
                      value={`${field.label} ${option.title}`}
                      onSelect={() => apply(field.key, option.slug)}
                      class="cursor-pointer"
                    >
                      <Check
                        class={activeField === field.key && activeValue === option.slug
                          ? 'mr-2 h-4 w-4'
                          : 'mr-2 h-4 w-4 opacity-0'}
                      />
                      <span class="truncate">{option.title}</span>
                    </Command.Item>
                  {/each}
                </Command.Group>
              {/if}
            {/each}
          </Command.List>
        </Command.Root>
      </Popover.Content>
    </Popover.Root>

    <!-- A sibling, not nested in the trigger: a button inside a button is
         invalid and unreachable by keyboard. -->
    {#if activeLabel}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        class="text-muted-foreground hover:text-destructive h-9 w-9"
        aria-label={m.collections_filter_relation_clear()}
        onclick={() => apply(null, null)}
      >
        <X class="h-3.5 w-3.5" />
      </Button>
    {/if}
  </div>
{/if}
