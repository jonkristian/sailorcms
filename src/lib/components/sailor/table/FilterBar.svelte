<script lang="ts">
  import { Search, X } from '@lucide/svelte';
  import { Input } from '$lib/components/ui/input';
  import { Button } from '$lib/components/ui/button';
  import * as Select from '$lib/components/ui/select/index.js';
  import * as Popover from '$lib/components/ui/popover';
  import * as Command from '$lib/components/ui/command';
  import { Badge } from '$lib/components/ui/badge';
  import { Check, ChevronDown } from '@lucide/svelte';

  interface FilterConfig {
    search?: boolean;
    select?: Array<{
      key: string;
      label: string;
      options: Array<{ label: string; value: string }>;
      default: string;
    }>;
    multiSelect?: Array<{
      key: string;
      label: string;
      options: Array<{ label: string; value: string }>;
    }>;
  }

  interface FilterState {
    searchQuery: string;
    selectFilters: Record<string, string>;
    multiSelectFilters: Record<string, string[]>;
    handleSearchInput: () => void;
    clearSearch: () => void;
    handleSelectFilter: (key: string, value: string) => void;
    handleMultiSelectFilter: (key: string, values: string[]) => void;
    clearAllFilters: () => void;
    hasActiveFilters: boolean;
  }

  const { config, tableFilters } = $props<{
    config: FilterConfig;
    tableFilters?: FilterState;
  }>();

  // Multi-select state for comboboxes
  let openComboboxes = $state<Record<string, boolean>>({});

  // Ensure combobox open state is initialized to a boolean for all multiSelect keys
  $effect(() => {
    if (config?.multiSelect) {
      for (const ms of config.multiSelect) {
        if (openComboboxes[ms.key] === undefined) {
          openComboboxes[ms.key] = false;
        }
      }
    }
  });

  // Local state for single-select values to work seamlessly with Select's bind:value
  let selectValues = $state<Record<string, string>>({});

  // Initialize local select values from filters on mount/changes
  $effect(() => {
    if (config?.select) {
      for (const s of config.select) {
        const current = tableFilters?.selectFilters?.[s.key] ?? s.default;
        if (selectValues[s.key] !== current) {
          selectValues[s.key] = current;
        }
      }
    }
  });

  // Watch for changes in selectValues and sync with filters
  $effect(() => {
    if (config?.select && tableFilters) {
      for (const s of config.select) {
        const currentValue = selectValues[s.key];
        if (currentValue && currentValue !== (tableFilters?.selectFilters?.[s.key] ?? s.default)) {
          tableFilters.handleSelectFilter(s.key, currentValue);
        }
      }
    }
  });

  function toggleCombobox(key: string) {
    openComboboxes[key] = !openComboboxes[key];
  }

  function isSelected(key: string, value: string): boolean {
    return tableFilters?.multiSelectFilters?.[key]?.includes(value) || false;
  }

  function toggleSelection(key: string, value: string) {
    if (!tableFilters) return;
    const current = tableFilters.multiSelectFilters[key] || [];
    const newValues = isSelected(key, value)
      ? current.filter((v: string) => v !== value)
      : [...current, value];
    tableFilters.handleMultiSelectFilter(key, newValues);
  }

  function removeTag(key: string, value: string) {
    if (!tableFilters) return;
    const current = tableFilters.multiSelectFilters[key] || [];
    const newValues = current.filter((v: string) => v !== value);
    tableFilters.handleMultiSelectFilter(key, newValues);
  }
</script>

<div class="flex flex-wrap items-center gap-2">
  <!-- Search Input -->
  {#if config.search}
    <div class="relative">
      <Search class="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
      <Input
        type="text"
        placeholder="Search..."
        value={tableFilters?.searchQuery ?? ''}
        class="h-9 w-64 pr-9 pl-9"
        oninput={(e) => {
          if (tableFilters) {
            tableFilters.searchQuery = e.currentTarget.value;
            tableFilters.handleSearchInput();
          }
        }}
      />
      {#if tableFilters?.searchQuery}
        <button
          onclick={tableFilters?.clearSearch}
          class="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2 transition-colors"
          type="button"
        >
          <X class="h-4 w-4" />
        </button>
      {/if}
    </div>
  {/if}

  <!-- Select Filters -->
  {#if config.select}
    {#each config.select as selectConfig}
      <Select.Root
        type="single"
        value={selectValues[selectConfig.key] ?? selectConfig.default}
        onValueChange={(value) => {
          selectValues[selectConfig.key] = value || selectConfig.default;
          if (tableFilters)
            tableFilters.handleSelectFilter(selectConfig.key, selectValues[selectConfig.key]);
        }}
      >
        <Select.Trigger class="h-9 w-32">
          {selectConfig.options.find(
            (o: { label: string; value: string }) =>
              o.value === (selectValues[selectConfig.key] ?? selectConfig.default)
          )?.label || selectConfig.label}
        </Select.Trigger>
        <Select.Content>
          {#each selectConfig.options as option}
            <Select.Item value={option.value}>{option.label}</Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    {/each}
  {/if}

  <!-- Multi-Select Filters -->
  {#if config.multiSelect}
    {#each config.multiSelect as multiConfig}
      <div class="flex items-center gap-2">
        <Popover.Root
          open={openComboboxes[multiConfig.key] ?? false}
          onOpenChange={(open: boolean) => (openComboboxes[multiConfig.key] = open)}
        >
          <Popover.Trigger>
            <div
              class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus:ring-ring flex h-9 w-48 items-center justify-between rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1"
              role="combobox"
              aria-controls={`${multiConfig.key}-content`}
              aria-expanded={openComboboxes[multiConfig.key]}
            >
              <span class="text-muted-foreground">
                {(tableFilters?.multiSelectFilters?.[multiConfig.key]?.length ?? 0) > 0
                  ? `${tableFilters?.multiSelectFilters?.[multiConfig.key]?.length ?? 0} selected`
                  : `Select ${multiConfig.label.toLowerCase()}...`}
              </span>
              <ChevronDown class="h-4 w-4 opacity-50" />
            </div>
          </Popover.Trigger>
          <Popover.Content id={`${multiConfig.key}-content`} class="w-48 p-0">
            <Command.Root>
              <Command.Input placeholder={`Search ${multiConfig.label.toLowerCase()}...`} />
              <Command.Empty>No {multiConfig.label.toLowerCase()} found.</Command.Empty>
              <Command.Group class="max-h-64 overflow-auto">
                {#each multiConfig.options as option}
                  <Command.Item
                    onSelect={() => toggleSelection(multiConfig.key, option.value)}
                    class="flex items-center gap-2"
                  >
                    <div class="flex h-4 w-4 items-center justify-center">
                      {#if isSelected(multiConfig.key, option.value)}
                        <Check class="h-4 w-4" />
                      {/if}
                    </div>
                    {option.label}
                  </Command.Item>
                {/each}
              </Command.Group>
            </Command.Root>
          </Popover.Content>
        </Popover.Root>

        <!-- Selected tags display -->
        {#if (tableFilters?.multiSelectFilters?.[multiConfig.key]?.length ?? 0) > 0}
          <div class="flex flex-wrap gap-1">
            {#each tableFilters?.multiSelectFilters?.[multiConfig.key] ?? [] as value}
              {@const option = multiConfig.options.find(
                (o: { label: string; value: string }) => o.value === value
              )}
              {#if option}
                <Badge variant="secondary" class="text-xs">
                  {option.label}
                  <button
                    onclick={() => removeTag(multiConfig.key, value)}
                    class="ml-1 hover:text-red-500"
                    type="button"
                  >
                    <X class="h-3 w-3" />
                  </button>
                </Badge>
              {/if}
            {/each}
          </div>
        {/if}
      </div>
    {/each}
  {/if}

  <!-- Clear Filters Button -->
  {#if tableFilters?.hasActiveFilters}
    <Button variant="ghost" class="h-9" onclick={tableFilters.clearAllFilters}>Clear Filters</Button
    >
  {/if}
</div>
