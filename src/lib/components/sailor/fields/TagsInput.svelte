<script lang="ts">
  import { debounce } from '$sailor/core/utils/debounce';
  import { Badge } from '$lib/components/ui/badge';
  import { X } from '@lucide/svelte';
  import { searchTags } from '$sailor/remote/tags.remote.js';

  interface Tag {
    id: string;
    name: string;
  }

  const {
    value = [],
    placeholder = 'Type tag name and press Enter',
    onChange,
    disabled = false,
    scope
  } = $props<{
    value?: Tag[] | string[];
    placeholder?: string;
    onChange: (tags: Tag[]) => void;
    disabled?: boolean;
    scope?: string; // Optional scope for context-aware search
  }>();

  let tagsInput = $state('');
  let inputElement: HTMLInputElement;
  let showSuggestions = $state(false);
  let suggestions = $state<Tag[]>([]);
  let selectedSuggestionIndex = $state(-1);

  // Simplified state management - always use the value prop as source of truth
  let displayTags = $state<Tag[]>([]);

  function areTagsEqual(a: Tag[], b: Tag[]) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i].id !== b[i].id || a[i].name !== b[i].name) return false;
    }
    return true;
  }

  // Update displayTags when value prop changes (guarded)
  $effect(() => {
    const currentValue = Array.isArray(value) ? value : [];
    const next = currentValue.map((tag: any) =>
      typeof tag === 'object'
        ? ({ id: tag.id, name: tag.name } as Tag)
        : { id: `tag-${tag}`, name: tag }
    );
    if (!areTagsEqual(displayTags, next)) displayTags = next;
  });

  // Debounced search function
  const debouncedSearch = debounce(async (query: string) => {
    if (query.length < 1) {
      suggestions = [];
      showSuggestions = false;
      return;
    }

    try {
      const result = await searchTags({
        query,
        limit: 10,
        scope
      });

      if (result.success) {
        suggestions = result.tags || [];
        showSuggestions = suggestions.length > 0;
      } else {
        suggestions = [];
        showSuggestions = false;
      }
    } catch (error) {
      console.error('Error searching tags:', error);
      suggestions = [];
      showSuggestions = false;
    }
  }, 200);

  function handleTagsInput(event: Event) {
    const target = event.target as HTMLInputElement;
    tagsInput = target.value;

    // Reset selection when input changes
    selectedSuggestionIndex = -1;

    // Search based on current input value
    if (tagsInput.trim().length > 0) {
      debouncedSearch(tagsInput.trim());
    } else {
      showSuggestions = false;
    }
  }

  function selectSuggestion(tag: Tag) {
    // Add the selected tag to existing tags
    const currentTags = [...displayTags];

    // Check if tag already exists
    const existingTag = currentTags.find((t) => t.name.toLowerCase() === tag.name.toLowerCase());
    if (existingTag) {
      return; // Don't add duplicate tags
    }

    // Ensure the tag has the expected format
    const cleanTag = {
      id: tag.id,
      name: tag.name
    };

    currentTags.push(cleanTag);

    // Clear the input and hide suggestions
    tagsInput = '';
    showSuggestions = false;

    // Trigger onChange with updated tags (guard)
    if (!areTagsEqual(displayTags, currentTags)) onChange(currentTags);

    if (inputElement) {
      inputElement.focus();
    }
  }

  function parseTagsFromInput(input: string): Tag[] {
    return input
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0)
      .map((name) => ({
        id: `tag-${name.toLowerCase().replace(/\s+/g, '-')}`,
        name
      }));
  }

  function handleInputBlur() {
    // Small delay to allow suggestion click to work
    setTimeout(() => {
      showSuggestions = false;
      // Update tags when user finishes editing
      const tags = parseTagsFromInput(tagsInput);
      if (tags.length > 0) {
        const currentTags = [...displayTags];
        const newTags = tags.filter(
          (tag) =>
            !currentTags.some((existing) => existing.name.toLowerCase() === tag.name.toLowerCase())
        );
        const merged = [...currentTags, ...newTags];
        if (!areTagsEqual(displayTags, merged)) onChange(merged);
      }
    }, 150);
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (showSuggestions && suggestions.length > 0) {
        selectedSuggestionIndex =
          selectedSuggestionIndex < suggestions.length - 1 ? selectedSuggestionIndex + 1 : 0;
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (showSuggestions && suggestions.length > 0) {
        selectedSuggestionIndex =
          selectedSuggestionIndex > 0 ? selectedSuggestionIndex - 1 : suggestions.length - 1;
      }
    } else if (event.key === 'Enter') {
      event.preventDefault();

      // If a suggestion is selected, use it
      if (showSuggestions && selectedSuggestionIndex >= 0 && suggestions[selectedSuggestionIndex]) {
        selectSuggestion(suggestions[selectedSuggestionIndex]);
        return;
      }

      showSuggestions = false;

      // Add the current input as a new tag if it's not empty
      if (tagsInput.trim()) {
        const currentTags = [...displayTags];
        const newTag = {
          id: `tag-${tagsInput.toLowerCase().replace(/\s+/g, '-')}`,
          name: tagsInput.trim()
        };

        // Check if tag already exists
        const existingTag = currentTags.find(
          (t) => t.name.toLowerCase() === newTag.name.toLowerCase()
        );
        if (!existingTag) {
          currentTags.push(newTag);
          if (!areTagsEqual(displayTags, currentTags)) onChange(currentTags);
        }

        tagsInput = '';
      }

      showSuggestions = false;
      selectedSuggestionIndex = -1;
    } else if (event.key === 'Escape') {
      showSuggestions = false;
      selectedSuggestionIndex = -1;
    } else if (event.key === 'Backspace' && tagsInput === '' && displayTags.length > 0) {
      // Remove last tag when backspacing on empty input
      event.preventDefault();

      const currentTags = [...displayTags];
      currentTags.pop();
      if (!areTagsEqual(displayTags, currentTags)) onChange(currentTags);
    }
  }

  function removeTag(index: number) {
    const updatedTags = [...displayTags];
    updatedTags.splice(index, 1);
    if (!areTagsEqual(displayTags, updatedTags)) onChange(updatedTags);
  }
</script>

<div class="space-y-2">
  <!-- Input field -->
  <div class="relative">
    <input
      bind:this={inputElement}
      bind:value={tagsInput}
      {placeholder}
      {disabled}
      oninput={handleTagsInput}
      onkeydown={handleKeydown}
      onblur={handleInputBlur}
      class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus:ring-ring flex h-9 w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
    />

    {#if showSuggestions && suggestions.length > 0}
      <div
        class="border-border bg-popover text-popover-foreground absolute top-full right-0 left-0 z-[100] mt-1 max-h-60 overflow-y-auto rounded-md border shadow-xl"
      >
        {#each suggestions as tag, index (tag.id)}
          <button
            type="button"
            class="text-popover-foreground hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground flex w-full items-center gap-2 px-3 py-2 text-left text-sm focus:outline-none {selectedSuggestionIndex ===
            index
              ? 'bg-accent text-accent-foreground'
              : ''}"
            onclick={() => selectSuggestion(tag)}
            tabindex="-1"
          >
            <span>{tag.name}</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Selected tags displayed below input -->
  {#if displayTags.length > 0}
    <div class="mt-3 space-y-2">
      <div class="flex flex-wrap gap-2">
        {#each displayTags as tag, index (tag.id || `${tag.name}-${index}`)}
          <Badge variant="secondary" class="flex items-center gap-1 px-3 py-1">
            <span class="max-w-[200px] truncate">{typeof tag === 'object' ? tag.name : tag}</span>
            <button
              type="button"
              onclick={() => removeTag(index)}
              class="ml-1 rounded transition-colors hover:text-red-500 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:outline-none"
              title="Remove tag"
            >
              <X class="h-3 w-3" />
            </button>
          </Badge>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  /* Ensure suggestions appear above modal content */
  div[class*='z-[100]'] {
    z-index: 100 !important;
  }
</style>
