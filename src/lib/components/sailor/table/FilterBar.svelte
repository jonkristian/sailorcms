<script lang="ts">
  import { Search, X } from '@lucide/svelte';
  import { Input } from '$lib/components/ui/input';
  import { Button } from '$lib/components/ui/button';
  import * as Select from '$lib/components/ui/select/index.js';
  import * as Popover from '$lib/components/ui/popover';
  import * as Command from '$lib/components/ui/command';
  import { Badge } from '$lib/components/ui/badge';
  import { Check, ChevronDown } from '@lucide/svelte';
  import { m } from '$sailor/i18n';

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

  const {
    config,
    tableFilters
  }: {
    config: FilterConfig;
    tableFilters?: FilterState;
  } = $props();

  let openComboboxes: Record<string, boolean> = $state({});

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
        placeholder={m.filter_search_placeholder()}
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
      {@const currentValue =
        tableFilters?.selectFilters?.[selectConfig.key] ?? selectConfig.default}
      <Select.Root
        type="single"
        value={currentValue}
        onValueChange={(value) => {
          if (tableFilters)
            tableFilters.handleSelectFilter(selectConfig.key, value || selectConfig.default);
        }}
      >
        <Select.Trigger class="h-9 w-32">
          {selectConfig.options.find(
            (o: { label: string; value: string }) => o.value === currentValue
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
                  ? m.filter_select_count_selected({
                      count: tableFilters?.multiSelectFilters?.[multiConfig.key]?.length ?? 0
                    })
                  : m.filter_select_placeholder({ label: multiConfig.label.toLowerCase() })}
              </span>
              <ChevronDown class="h-4 w-4 opacity-50" />
            </div>
          </Popover.Trigger>
          <Popover.Content id={`${multiConfig.key}-content`} class="w-48 p-0">
            <Command.Root>
              <Command.Input
                placeholder={m.filter_search_label({ label: multiConfig.label.toLowerCase() })}
              />
              <Command.Empty>
                {m.filter_no_results({ label: multiConfig.label.toLowerCase() })}
              </Command.Empty>
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
    <Button variant="ghost" class="h-9" onclick={tableFilters.clearAllFilters}
      >{m.filter_clear_filters()}</Button
    >
  {/if}
</div>
