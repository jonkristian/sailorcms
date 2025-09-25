<script lang="ts">
  import { Badge } from '$lib/components/ui/badge';
  import * as Popover from '$lib/components/ui/popover';
  import * as Command from '$lib/components/ui/command';
  import { X, ChevronsUpDown, Check } from '@lucide/svelte';
  import { cn } from '$lib/sailor/utils';
  import { getGlobalItems } from '$sailor/remote/globals.remote.js';
  import { getCollectionItems } from '$sailor/remote/collections.remote.js';

  interface Props {
    value: string | string[];
    field: {
      title: string;
      label?: string;
      description?: string;
      relation?: {
        type: string;
        targetGlobal?: string;
        targetCollection?: string;
        through?: string;
      };
    };
    required?: boolean;
    onChange: (value: string | string[]) => void;
    currentItemId?: string; // Add current item ID to prevent self-selection
    readonly?: boolean;
  }

  let { value, field, required = false, onChange, currentItemId, readonly = false } = $props();

  // Determine if this is a single-select relation
  const isSingleSelect =
    field.relation?.type === 'one-to-one' || field.relation?.type === 'many-to-one';

  let selectedItems = $state<Array<{ id: string; title: string }>>(parseValue(value));
  let availableItems = $state<Array<{ id: string; title: string }>>([]);
  let open = $state(false);
  let searchTerm = $state('');
  let triggerRef = $state<HTMLButtonElement>(null!);
  let loading = $state(false);
  let triedResolve = $state(false);
  let contentWidth = $state<number>(0);

  $effect(() => {
    const next = parseValue(value);
    const prevIds = selectedItems.map((i) => i.id);
    const nextIds = next.map((i) => i.id);
    const changed = prevIds.length !== nextIds.length || prevIds.some((id, i) => id !== nextIds[i]);
    if (changed) {
      selectedItems = next;
      triedResolve = false; // allow one resolve attempt for new value
    }
  });

  // Resolve placeholder titles for single-select when we only have the ID
  $effect(() => {
    if (
      isSingleSelect &&
      !triedResolve &&
      selectedItems.length > 0 &&
      selectedItems.some((i) => i.title === 'Loading...' || i.title === i.id)
    ) {
      triedResolve = true;
      resolveTitles();
    }
  });

  // Parse initial value - handle both single and multi-select formats
  function parseValue(val: string | string[]): Array<{ id: string; title: string }> {
    if (!val) return [];

    try {
      // Handle array input directly
      if (Array.isArray(val)) {
        if (val.length > 0 && typeof val[0] === 'string') {
          // Array of IDs - try to resolve titles from availableItems
          const titleMap = new Map<string, string>(
            availableItems.map(
              (i: { id: string; title: string }) => [i.id, i.title] as [string, string]
            )
          );
          return (val as string[]).map((id: string) => ({ id, title: titleMap.get(id) || id }));
        } else {
          // Array of objects with id and title
          return (val as unknown as Array<{ id: string; title: string }>).filter(
            (item) => item && item.id
          );
        }
      }

      // Handle string input
      if (typeof val === 'string') {
        // For single-select, the value might be a single ID string or a single object
        if (isSingleSelect) {
          if (!val.startsWith('[') && !val.startsWith('{')) {
            // Single ID string - set placeholder title that will be resolved later
            return [{ id: val, title: `Loading...` }];
          } else {
            const parsed = JSON.parse(val);
            if (Array.isArray(parsed)) {
              return parsed.length > 0 ? [parsed[0] as { id: string; title: string }] : [];
            } else if (parsed && typeof parsed === 'object' && (parsed as any).id) {
              // Single object
              return [parsed as { id: string; title: string }];
            }
            return [];
          }
        } else {
          // Multi-select - handle array format
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed)) {
            if (parsed.length > 0 && typeof parsed[0] === 'string') {
              // Array of IDs - try to resolve titles from availableItems or existing selectedItems
              const titleMap = new Map<string, string>(
                availableItems.map(
                  (i: { id: string; title: string }) => [i.id, i.title] as [string, string]
                )
              );
              return (parsed as string[]).map((id: string) => ({
                id,
                title: titleMap.get(id) || id
              }));
            } else {
              // Array of objects with id and title (new format)
              return (parsed as Array<{ id: string; title: string }>).filter(
                (item) => item.id && item.title
              );
            }
          }
          return [];
        }
      }

      return [];
    } catch {
      return [];
    }
  }

  // Resolve titles for selected items
  async function resolveTitles() {
    if (!isSingleSelect) return; // Avoid churn for multi-select; titles load when popover opens
    if (!field.relation?.targetGlobal && !field.relation?.targetCollection) return;
    if (selectedItems.length === 0) return;

    try {
      const target = field.relation.targetGlobal || field.relation.targetCollection;

      let result;
      if (field.relation.targetGlobal) {
        result = await getGlobalItems({ slug: target });
      } else {
        result = await getCollectionItems({ collection: target });
      }

      if (result.success) {
        const items = result.items || [];

        const titleMap = new Map<string, string>(items.map((item: any) => [item.id, item.title]));

        selectedItems = selectedItems.map((item) => {
          const resolvedTitle = titleMap.get(item.id);
          if (resolvedTitle && (item.title === 'Loading...' || item.title === item.id)) {
            return { ...item, title: resolvedTitle };
          }
          return item;
        });
      }
    } catch (error) {
      console.error('Failed to resolve titles:', error);
    }
  }

  // Load available items when popover opens
  async function loadAvailableItems() {
    if (!field.relation?.targetGlobal && !field.relation?.targetCollection) return;

    loading = true;
    try {
      const target = field.relation.targetGlobal || field.relation.targetCollection;

      let result;
      if (field.relation.targetGlobal) {
        result = await getGlobalItems({ slug: target });
      } else {
        result = await getCollectionItems({ collection: target });
      }

      if (result.success) {
        const items = result.items || [];

        // Filter out the current item to prevent self-selection
        availableItems = items.filter((item: any) => item.id !== currentItemId);

        // Update selected items with proper titles if they only have IDs
        if (selectedItems.length > 0) {
          const titleMap = new Map<string, string>(items.map((item: any) => [item.id, item.title]));

          selectedItems = selectedItems.map((item) => {
            const resolvedTitle = titleMap.get(item.id);
            // Only update if we have a resolved title and the current title is a placeholder
            if (resolvedTitle && (item.title === 'Loading...' || item.title === item.id)) {
              return { ...item, title: resolvedTitle };
            }
            return item;
          });
        }
      }
    } catch (error) {
      console.error('Failed to load available items:', error);
      availableItems = [];
    } finally {
      loading = false;
    }
  }

  function toggleItem(item: { id: string; title: string }) {
    if (isSingleSelect) {
      // For single-select, return single item or string ID
      if (value !== item.id) onChange(item.id);
      // Close popover after selection for single-select
      open = false;
    } else {
      // For multi-select, toggle the item
      const currentItems = parseValue(value);
      const index = currentItems.findIndex((selected) => selected.id === item.id);

      let newItems;
      if (index > -1) {
        newItems = currentItems.filter((selected) => selected.id !== item.id);
      } else {
        newItems = [...currentItems, item];
      }

      // For many-to-many relations, return array of IDs
      const nextIds = newItems.map((item) => item.id);
      const prevIds = Array.isArray(value) ? value : [];
      const changed =
        nextIds.length !== prevIds.length || nextIds.some((id, i) => id !== prevIds[i]);
      if (changed) onChange(nextIds);
    }
  }

  function removeItem(itemId: string) {
    const currentItems = parseValue(value);
    const newItems = currentItems.filter((item) => item.id !== itemId);

    // For many-to-many relations, return array of IDs
    const nextIds = newItems.map((item) => item.id);
    const prevIds = Array.isArray(value) ? value : [];
    const changed = nextIds.length !== prevIds.length || nextIds.some((id, i) => id !== prevIds[i]);
    if (changed) onChange(nextIds);
  }

  function isSelected(itemId: string) {
    return selectedItems.some((item) => item.id === itemId);
  }

  function getFilteredItems() {
    if (!searchTerm) return availableItems;
    return availableItems.filter((item) =>
      item.title.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }

  // Handle popover open change
  function handleOpenChange(newOpen: boolean) {
    open = newOpen;
    if (newOpen) {
      // Match popover width to trigger width
      queueMicrotask(() => {
        try {
          contentWidth = triggerRef ? (triggerRef as HTMLButtonElement).offsetWidth : 0;
        } catch {}
      });
      loadAvailableItems();
      // After loading available items, try to hydrate any 'Loading...' titles
      queueMicrotask(() => {
        if (selectedItems.some((i) => i.title === 'Loading...' || i.title === i.id)) {
          const titleMap = new Map<string, string>(availableItems.map((i) => [i.id, i.title]));
          selectedItems = selectedItems.map((i) => ({
            id: i.id,
            title: titleMap.get(i.id) || i.title
          }));
        }
      });
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
      class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus:ring-ring flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      role="combobox"
      aria-expanded={open}
      aria-controls="relation-field-content"
    >
      <span class="text-muted-foreground flex min-w-0 flex-1 items-center gap-2">
        {#if isSingleSelect}
          {#if selectedItems.length > 0}
            <span class="truncate">{selectedItems[0].title}</span>
          {:else}
            <span class="truncate">Select {field.label || field.title}...</span>
          {/if}
        {:else}
          <span class="truncate">
            {selectedItems.length > 0
              ? `${selectedItems.length} item${selectedItems.length === 1 ? '' : 's'} selected`
              : `Select ${field.label || field.title}...`}
          </span>
        {/if}
      </span>
      <div class="ml-2 flex shrink-0 items-center gap-2">
        {#if isSingleSelect && selectedItems.length > 0 && !readonly}
          <button
            type="button"
            onclick={(e) => {
              e.stopPropagation();
              onChange('');
            }}
            class="rounded transition-colors hover:text-red-500 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:outline-none"
            title="Clear selection"
            aria-label="Clear selection"
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
    <Command.Root>
      <Command.Input placeholder="Search items..." bind:value={searchTerm} class="h-9" />
      <Command.List class="max-h-60">
        {#if loading}
          <Command.Loading>Loading items...</Command.Loading>
        {:else if getFilteredItems().length === 0}
          <Command.Empty>
            {searchTerm ? 'No items found.' : 'No items available.'}
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

<!-- Selected items display - only show badges for multi-select -->
{#if selectedItems.length > 0 && !isSingleSelect}
  <div class="mt-2">
    <div class="flex flex-wrap gap-2">
      {#each selectedItems as item}
        <Badge variant="secondary" class="flex items-center gap-1 px-3 py-1">
          <span class="max-w-[200px] truncate">{item.title}</span>
          <button
            type="button"
            onclick={() => removeItem(item.id)}
            class="ml-1 rounded transition-colors hover:text-red-500 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:outline-none"
          >
            <X class="h-3 w-3" />
          </button>
        </Badge>
      {/each}
    </div>
  </div>
{/if}
