<script lang="ts">
  import * as Popover from 'sailorcms/components/ui/popover/index.js';
  import * as Command from 'sailorcms/components/ui/command/index.js';
  import { X, ChevronsUpDown, Check } from '@lucide/svelte';
  import { cn } from 'sailorcms/utils/shadcn.js';
  import {
    searchRelationOptions,
    resolveRelationTitles
  } from 'sailorcms/remote/relations.remote.js';
  import { m } from '$sailor/i18n';
  import { onMount } from 'svelte';

  interface Props {
    value: string | string[];
    field: {
      title?: string;
      label?: string;
      relation?: {
        type: string;
        targetGlobal?: string;
        targetCollection?: string;
        through?: string;
      };
    };
    onChange: (value: string | string[]) => void;
    currentItemId?: string | null; // Add current item ID to prevent self-selection
    readonly?: boolean;
  }

  let { value, field, onChange, currentItemId, readonly = false }: Props = $props();

  // Single-value relations only. Many-to-many is handled by
  // `RelationBrowserField`, which owns ordering, paging and the attached list —
  // this component would otherwise be a second, weaker way to edit the same
  // thing.
  // Labels learned from the candidate fetch, applied over the parsed value —
  // the bound value is a bare id, so it carries no title of its own.
  let resolvedTitles = $state<Record<string, string>>({});
  let selectedItems = $derived(
    parseValue(value).map((item) => ({ ...item, title: resolvedTitles[item.id] ?? item.title }))
  );
  let availableItems: Array<{ id: string; title: string }> = $state([]);
  let open = $state(false);
  let searchTerm = $state('');
  let triggerRef: HTMLButtonElement = $state(null!);
  let loading = $state(false);
  let contentWidth: number = $state(0);

  /** How many candidates the popover fetches per search. */
  const OPTION_LIMIT = 50;
  let searchTimer: ReturnType<typeof setTimeout> | undefined;

  // One-shot, on mount — a single-select value arrives as a bare id, so its
  // label has to be fetched. Not an $effect: nothing here is a subscription.
  onMount(() => {
    if (value) void resolveTitles();
  });

  /** A single-FK value is a bare id, or an object once its label is known. */
  function parseValue(val: string | string[]): Array<{ id: string; title: string }> {
    if (!val) return [];
    try {
      const entry = Array.isArray(val) ? val[0] : val;
      if (!entry) return [];
      if (typeof entry === 'object') return [entry as { id: string; title: string }];
      if (!entry.startsWith('[') && !entry.startsWith('{')) {
        // Bare id — `resolveTitles` fills the label in on mount.
        return [{ id: entry, title: entry }];
      }
      const parsed = JSON.parse(entry);
      const first = Array.isArray(parsed) ? parsed[0] : parsed;
      return first?.id ? [first as { id: string; title: string }] : [];
    } catch {
      return [];
    }
  }

  function toggleItem(item: { id: string; title: string }) {
    if (value !== item.id) {
      resolvedTitles = { ...resolvedTitles, [item.id]: item.title };
      onChange(item.id);
    }
    open = false;
  }

  function isSelected(itemId: string) {
    return selectedItems.some((item) => item.id === itemId);
  }

  // Resolve labels for a saved value, which carries bare ids. Asks for exactly
  // those rather than paging the target table to find them.
  async function resolveTitles() {
    if (!field.relation || selectedItems.length === 0) return;
    const ids = selectedItems.filter((item) => item.title === item.id).map((item) => item.id);
    if (ids.length === 0) return;
    try {
      const result = await resolveRelationTitles({ target: field.relation, ids });
      if (result.success) {
        resolvedTitles = {
          ...resolvedTitles,
          ...Object.fromEntries(
            result.items.map((i: { id: string; title: string }) => [i.id, i.title])
          )
        };
      }
    } catch (error) {
      console.error('Failed to resolve titles:', error);
    }
  }

  // Candidates for the picker. Search and the row cap are applied in SQL — this
  // used to pull whole tables and filter in the browser.
  async function loadAvailableItems(term: string = searchTerm) {
    if (!field.relation) return;
    loading = true;
    try {
      const result = await searchRelationOptions({
        target: field.relation,
        search: term,
        limit: OPTION_LIMIT,
        excludeId: currentItemId ?? undefined
      });
      if (result.success) {
        availableItems = result.items ?? [];
        resolvedTitles = {
          ...resolvedTitles,
          ...Object.fromEntries(
            availableItems.map((i: { id: string; title: string }) => [i.id, i.title])
          )
        };
      }
    } catch (error) {
      console.error('Failed to load available items:', error);
      availableItems = [];
    } finally {
      loading = false;
    }
  }

  function onSearchInput(term: string) {
    searchTerm = term;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => void loadAvailableItems(term), 200);
  }

  // Filtering happens in SQL; re-filtering here would hide rows the server
  // deliberately returned.
  function getFilteredItems() {
    return availableItems;
  }

  // Handle popover open change
  function handleOpenChange(newOpen: boolean) {
    open = newOpen;
    if (newOpen) {
      // Match popover width to trigger width
      queueMicrotask(() => {
        try {
          contentWidth = triggerRef ? (triggerRef as HTMLButtonElement).offsetWidth : 0;
        } catch {
          contentWidth = 0;
        }
      });
      // Titles hydrate through `learnTitles` inside the load, so there is
      // nothing to reconcile afterwards.
      void loadAvailableItems();
    } else {
      searchTerm = '';
    }
  }
</script>

<!-- Combobox for selecting items -->
<Popover.Root bind:open onOpenChange={handleOpenChange}>
  <div class="flex w-full items-center gap-2">
    <Popover.Trigger
      bind:ref={triggerRef}
      class="border-input bg-input-bg ring-offset-background placeholder:text-muted-foreground focus:ring-ring flex h-9 w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      role="combobox"
      aria-expanded={open}
      aria-controls="relation-field-content"
    >
      <span class="text-muted-foreground flex min-w-0 flex-1 items-center gap-2">
        {#if selectedItems.length > 0}
          <span class="truncate">{selectedItems[0].title}</span>
        {:else}
          <span class="truncate"
            >{m.relation_select_placeholder({ label: field.label || field.title || '' })}</span
          >
        {/if}
      </span>
      <div class="ml-2 flex shrink-0 items-center gap-2">
        {#if selectedItems.length > 0 && !readonly}
          <button
            type="button"
            onclick={(e) => {
              e.stopPropagation();
              onChange('');
            }}
            class="rounded transition-colors hover:text-red-500 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:outline-none"
            title={m.relation_clear_selection()}
            aria-label={m.relation_clear_selection()}
          >
            <X class="h-3 w-3" />
          </button>
        {/if}
        <ChevronsUpDown class="h-4 w-4 opacity-50" />
      </div>
    </Popover.Trigger>
  </div>
  <Popover.Content
    id="relation-field-content"
    class="p-0"
    style={`width:${contentWidth > 0 ? contentWidth + 'px' : 'auto'}`}
    align="start"
  >
    <Command.Root shouldFilter={false}>
      <Command.Input
        placeholder={m.relation_search_placeholder()}
        value={searchTerm}
        oninput={(e) => onSearchInput((e.currentTarget as HTMLInputElement).value)}
        class="h-9"
      />
      <Command.List class="max-h-60">
        {#if loading}
          <Command.Loading>{m.relation_loading_items()}</Command.Loading>
        {:else if getFilteredItems().length === 0}
          <Command.Empty>
            {searchTerm ? m.relation_no_items_found() : m.relation_no_items_available()}
          </Command.Empty>
        {:else}
          <Command.Group>
            {#each getFilteredItems() as item (item.id)}
              <Command.Item
                value={item.title}
                onSelect={() => {
                  toggleItem(item);
                  // Close popover for single-select, keep open for multi-select
                }}
                class="cursor-pointer"
              >
                <Check
                  class={cn('mr-2 h-4 w-4', isSelected(item.id) ? 'opacity-100' : 'opacity-0')}
                />
                <span class="truncate">{item.title}</span>
              </Command.Item>
            {/each}
          </Command.Group>
        {/if}
      </Command.List>
    </Command.Root>
  </Popover.Content>
</Popover.Root>
