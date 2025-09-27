<script lang="ts">
  import { ChevronRight, ChevronDown } from '@lucide/svelte';
  import { formatJson } from '$lib/sailor/core/ui/syntax-highlighting';

  let { data, expandedCategory } = $props<{
    data: Record<string, any>;
    expandedCategory?: string;
  }>();

  // Simple state management - no effects, no async complexity
  const categories = Object.keys(data || {});
  const expandedCategories = categories.reduce(
    (acc, cat, index) => {
      if (expandedCategory && data[expandedCategory]) {
        acc[cat] = cat === expandedCategory;
      } else {
        acc[cat] = index === 0;
      }
      return acc;
    },
    {} as Record<string, boolean>
  );

  let expandedState = $state(expandedCategories);
  let highlightedSections = $state<Record<string, string>>({});

  function toggleCategory(category: string) {
    expandedState[category] = !expandedState[category];
    // Highlight when expanding
    if (expandedState[category] && !highlightedSections[category]) {
      highlightSection(category);
    }
  }

  async function highlightSection(category: string) {
    if (highlightedSections[category] || !data[category]) return;

    try {
      const jsonString = JSON.stringify(data[category], null, 2);
      highlightedSections[category] = await formatJson(jsonString, '0.875rem');
    } catch (error) {
      console.warn(`Failed to highlight section ${category}:`, error);
      highlightedSections[category] = '';
    }
  }

  // Highlight initially expanded categories
  for (const [category, isExpanded] of Object.entries(expandedCategories)) {
    if (isExpanded) {
      highlightSection(category);
    }
  }
</script>

<div class="font-mono text-sm" style="line-height: 1.5;">
  {#each Object.entries(data || {}) as [category, categoryData]}
    <div class="mb-2">
      <!-- Category header -->
      <button
        type="button"
        onclick={() => toggleCategory(category)}
        class="hover:bg-muted/50 flex w-full items-center gap-2 rounded py-1 text-left text-sm"
      >
        {#if expandedState[category]}
          <ChevronDown class="text-muted-foreground h-3 w-3" />
        {:else}
          <ChevronRight class="text-muted-foreground h-3 w-3" />
        {/if}
        <span class="font-medium text-blue-400 dark:text-blue-300">"{category}"</span>
        <span class="text-muted-foreground text-xs"
          >({Object.keys((categoryData as Record<string, any>) || {}).length})</span
        >
      </button>

      <!-- Category content -->
      {#if expandedState[category]}
        <div class="border-muted/50 ml-5 border-l">
          <div class="pl-2">
            {#if highlightedSections[category]}
              <div class="hljs-wrapper">
                {@html highlightedSections[category]}
              </div>
            {:else}
              <pre class="overflow-x-auto text-sm" style="line-height: 1.5;"><code
                  >{JSON.stringify(categoryData, null, 2)}</code
                ></pre>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  {/each}
</div>
