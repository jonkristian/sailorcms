<script lang="ts">
  import { Input } from '$lib/components/ui/input';
  import { Badge } from '$lib/components/ui/badge';
  import * as Command from '$lib/components/ui/command';
  import * as Popover from '$lib/components/ui/popover';
  import { Check, ChevronDown, X, Plus } from '@lucide/svelte';
  import { debounce } from '$sailor/core/utils/debounce';

  // Props
  interface Tag {
    id: string;
    name: string;
    color?: string;
  }

  let {
    selectedTags = [],
    placeholder = 'Select tags...',
    searchPlaceholder = 'Search tags...',
    createLabel = 'Create tag',
    onTagsChange = () => {},
    onSearch = async (query: string): Promise<Tag[]> => [],
    allowCreate = true,
    disabled = false,
    class: className = ''
  }: {
    selectedTags?: Tag[];
    placeholder?: string;
    searchPlaceholder?: string;
    createLabel?: string;
    onTagsChange?: (tags: Tag[]) => void;
    onSearch: (query: string) => Promise<Tag[]>;
    allowCreate?: boolean;
    disabled?: boolean;
    class?: string;
  } = $props();

  // State
  let open = $state(false);
  let searchQuery = $state('');
  let searchResults = $state<Tag[]>([]);
  let loading = $state(false);
  let selectedTagsState = $state<Tag[]>([...selectedTags]);

  // Reactive updates
  $effect(() => {
    selectedTagsState = [...selectedTags];
  });

  // Debounced search
  const debouncedSearch = debounce(async (query: string) => {
    if (!query.trim()) {
      searchResults = [];
      loading = false;
      return;
    }

    try {
      loading = true;
      const results = await onSearch(query.trim());
      searchResults = results;
    } catch (error) {
      console.error('Tag search error:', error);
      searchResults = [];
    } finally {
      loading = false;
    }
  }, 300);

  // Handle search input
  function handleSearchInput() {
    debouncedSearch(searchQuery);
  }

  // Toggle tag selection
  function toggleTag(tag: Tag) {
    const isSelected = selectedTagsState.some((t) => t.id === tag.id);

    if (isSelected) {
      selectedTagsState = selectedTagsState.filter((t) => t.id !== tag.id);
    } else {
      selectedTagsState = [...selectedTagsState, tag];
    }

    onTagsChange(selectedTagsState);
  }

  // Remove tag
  function removeTag(tagId: string) {
    selectedTagsState = selectedTagsState.filter((t) => t.id !== tagId);
    onTagsChange(selectedTagsState);
  }

  // Create new tag
  function createNewTag() {
    if (!searchQuery.trim() || !allowCreate) return;

    const newTag: Tag = {
      id: `temp-${Date.now()}`,
      name: searchQuery.trim()
    };

    toggleTag(newTag);
    searchQuery = '';
    searchResults = [];
  }

  // Handle keyboard navigation
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && searchQuery.trim() && allowCreate) {
      event.preventDefault();
      const exactMatch = searchResults.find(
        (tag) => tag.name.toLowerCase() === searchQuery.toLowerCase()
      );

      if (exactMatch) {
        toggleTag(exactMatch);
      } else {
        createNewTag();
      }

      searchQuery = '';
      searchResults = [];
    }
  }

  // Check if tag is selected
  function isTagSelected(tag: Tag) {
    return selectedTagsState.some((t) => t.id === tag.id);
  }

  // Filter out already selected tags from search results
  let filteredResults = $derived(
    searchResults.filter((tag) => !selectedTagsState.some((selected) => selected.id === tag.id))
  );

  // Show create option
  let showCreateOption = $derived(
    allowCreate &&
      searchQuery.trim() &&
      !searchResults.some((tag) => tag.name.toLowerCase() === searchQuery.toLowerCase()) &&
      !selectedTagsState.some((tag) => tag.name.toLowerCase() === searchQuery.toLowerCase())
  );
</script>

<div class="space-y-2 {className}">
  <!-- Selected Tags Display -->
  {#if selectedTagsState.length > 0}
    <div class="flex flex-wrap gap-1">
      {#each selectedTagsState as tag (tag.id)}
        <Badge variant="secondary" class="flex items-center gap-1 pr-1 pl-2">
          <span class="text-xs">{tag.name}</span>
          {#if !disabled}
            <button
              onclick={() => removeTag(tag.id)}
              class="text-muted-foreground hover:text-foreground ml-1 h-3 w-3 transition-colors"
              type="button"
            >
              <X class="h-3 w-3" />
            </button>
          {/if}
        </Badge>
      {/each}
    </div>
  {/if}

  <!-- Tag Selector -->
  <Popover.Root bind:open>
    <Popover.Trigger>
      <div
        class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus:ring-ring flex h-10 w-full items-center justify-between rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1"
        role="combobox"
        aria-expanded={open}
        aria-controls="tag-selector-content"
        class:opacity-50={disabled}
        class:cursor-not-allowed={disabled}
      >
        <span class="text-muted-foreground">
          {placeholder}
        </span>
        <ChevronDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </div>
    </Popover.Trigger>
    <Popover.Content id="tag-selector-content" class="w-[300px] p-0">
      <Command.Root>
        <div class="border-b px-3 py-2">
          <Input
            bind:value={searchQuery}
            placeholder={searchPlaceholder}
            class="h-9 border-0 p-0 shadow-none focus-visible:ring-0"
            oninput={handleSearchInput}
            onkeydown={handleKeydown}
          />
        </div>

        <Command.List class="max-h-[200px]">
          {#if loading}
            <Command.Empty>
              <div class="flex items-center justify-center py-6">
                <div
                  class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                ></div>
                <span class="ml-2 text-sm">Searching...</span>
              </div>
            </Command.Empty>
          {:else if filteredResults.length === 0 && searchQuery && !showCreateOption}
            <Command.Empty>No tags found.</Command.Empty>
          {:else}
            <Command.Group>
              {#each filteredResults as tag (tag.id)}
                <Command.Item
                  value={tag.name}
                  onSelect={() => toggleTag(tag)}
                  class="flex items-center justify-between px-2 py-1.5"
                >
                  <div class="flex items-center gap-2">
                    <span>{tag.name}</span>
                  </div>
                  {#if isTagSelected(tag)}
                    <Check class="h-4 w-4" />
                  {/if}
                </Command.Item>
              {/each}

              {#if showCreateOption}
                <Command.Item
                  value={`create-${searchQuery}`}
                  onSelect={createNewTag}
                  class="text-primary flex items-center gap-2 px-2 py-1.5"
                >
                  <Plus class="h-4 w-4" />
                  <span>{createLabel} "{searchQuery}"</span>
                </Command.Item>
              {/if}
            </Command.Group>
          {/if}
        </Command.List>
      </Command.Root>
    </Popover.Content>
  </Popover.Root>
</div>
