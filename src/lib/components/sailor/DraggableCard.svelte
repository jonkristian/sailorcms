<script lang="ts">
  import { ChevronDown, Trash2, GripVertical, Edit } from '@lucide/svelte';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import { Button } from '$lib/components/ui/button';
  import { slide } from 'svelte/transition';
  import { quintIn, quintOut } from 'svelte/easing';

  let {
    title,
    subtitle,
    open = true,
    onToggle,
    onEdit,
    onRemove,
    showRemove = true,
    dragAttributes = {},
    isDragging = false,
    children,
    tags = [],
    featured = false,
    showSelection = false,
    isSelected = false,
    onSelectNode
  } = $props<{
    title: string;
    subtitle?: string;
    open?: boolean;
    onToggle?: () => void;
    onEdit?: () => void;
    onRemove?: () => void;
    showRemove?: boolean;
    dragAttributes?: Record<string, any>;
    isDragging?: boolean;
    children?: any;
    tags?: Array<{ name: string } | string>;
    featured?: boolean;
    showSelection?: boolean;
    isSelected?: boolean;
    onSelectNode?: (checked: boolean) => void;
  }>();

  let isOpen = $state(open);

  // Update internal state when prop changes
  $effect(() => {
    isOpen = open;
  });

  function handleToggle() {
    isOpen = !isOpen;
    onToggle?.();
  }
</script>

<div
  class="border-border bg-muted/20 overflow-hidden rounded-lg border transition-all duration-200 {isDragging
    ? 'shadow-lg'
    : ''}"
  role="listitem"
>
  <!-- Header -->
  <div
    class="bg-muted/30 hover:bg-muted/50 flex items-center justify-between px-4 py-1 transition-colors"
  >
    <div class="flex items-center gap-3">
      <button
        class="text-muted-foreground hover:bg-muted/50 cursor-grab rounded p-1 transition-colors hover:cursor-grabbing"
        data-drag-handle
        tabindex="-1"
        {...dragAttributes}
      >
        <GripVertical class="h-4 w-4" />
      </button>
      <div class="flex items-center gap-2">
        <div class="flex items-center gap-2">
          <h4 class="text-sm leading-tight font-medium">{title}</h4>
          {#if subtitle}
            <span class="text-muted-foreground max-w-[200px] truncate text-xs" title={subtitle}>
              • {subtitle.length > 50 ? subtitle.substring(0, 50) + '...' : subtitle}
            </span>
          {/if}
        </div>
        {#if tags && tags.length > 0}
          <div class="flex gap-1">
            {#each tags.slice(0, 3) as tag (typeof tag === 'string' ? tag : tag.id || tag.name)}
              <span class="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs">
                {typeof tag === 'string' ? tag : tag.name}
              </span>
            {/each}
            {#if tags.length > 3}
              <span class="text-muted-foreground text-xs">
                +{tags.length - 3} more
              </span>
            {/if}
          </div>
        {/if}
      </div>
      {#if featured}
        <span
          class="bg-primary/10 text-primary border-primary/20 rounded-full border px-2 py-0.5 text-xs font-medium"
        >
          Featured
        </span>
      {/if}
    </div>
    <div class="flex items-center gap-2">
      {#if onEdit}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onclick={onEdit}
          class="text-muted-foreground hover:text-foreground size-8 cursor-pointer"
        >
          <Edit class="h-4 w-4" />
        </Button>
      {/if}
      {#if showRemove}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onclick={onRemove}
          class="text-destructive hover:text-destructive/90 size-8 cursor-pointer"
        >
          <Trash2 class="h-4 w-4" />
        </Button>
      {/if}
      {#if showSelection}
        <div class="flex items-center justify-center">
          <Checkbox
            checked={isSelected}
            onCheckedChange={(checked) => onSelectNode?.(!!checked)}
            aria-label="Select row"
            onclick={(e) => e.stopPropagation()}
          />
        </div>
      {/if}
      {#if children && !onEdit}
        <Button type="button" variant="ghost" size="icon" class="h-8 w-8" onclick={handleToggle}>
          <ChevronDown class="h-4 w-4 transition-transform {isOpen ? '' : 'rotate-180'}" />
        </Button>
      {/if}
    </div>
  </div>

  <!-- Content -->
  {#if children && isOpen}
    <div
      class="space-y-4 px-6 pt-4 pb-6"
      in:slide={{ duration: 300, easing: quintOut }}
      out:slide={{ duration: 200, easing: quintIn }}
    >
      {@render children()}
    </div>
  {/if}
</div>
