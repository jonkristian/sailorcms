<script lang="ts">
  import { ChevronDown, Trash2, GripVertical, Edit, Group } from '@lucide/svelte';
  import { Checkbox } from 'sailorcms/components/ui/checkbox/index.js';
  import { Button } from 'sailorcms/components/ui/button/index.js';
  import { slide } from 'svelte/transition';
  import { quintIn, quintOut } from 'svelte/easing';
  import { m } from '$sailor/i18n';
  import { getStatusBadge } from 'sailorcms/core/ui/status-badge';
  import { stripHtml } from 'sailorcms/core/content/display';

  let {
    title,
    subtitle,
    open = $bindable(true),
    onToggle,
    onEdit,
    onGroup,
    onRemove,
    showRemove = true,
    dragAttributes = {},
    isDragging = false,
    children,
    tags = [],
    badges = [],
    featured = false,
    showSelection = false,
    isSelected = false,
    onSelectNode,
    status,
    statusOptions,
    onStatusToggle
  }: {
    title: string;
    subtitle?: string;
    /** Small neutral counters, e.g. how many items a relation field holds. */
    badges?: Array<{ label: string; count: number }>;
    open?: boolean;
    onToggle?: () => void;
    onEdit?: () => void;
    onGroup?: () => void;
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
    status?: string | null;
    statusOptions?: Array<{ label: string; value: string }>;
    onStatusToggle?: (next: string) => void;
  } = $props();

  // Callers pass a description straight through, and a description can be a
  // rich text field. Both the preview and its tooltip render as text, so any
  // markup would show up literally.
  const subtitleText = $derived(subtitle ? stripHtml(subtitle) : '');

  // Row click expands/collapses only when there is something to expand AND
  // when the card isn't using a modal-edit pattern (onEdit takes over from
  // the chevron and inline expansion in that mode).
  let rowToggleEnabled = $derived(!!children && !onEdit);
  // Translated label + base classes for known statuses (published / draft /
  // archived / private / active). Unknown values fall back to the raw string
  // with muted styling — covers consumer-custom select values.
  let statusBadge = $derived(status ? getStatusBadge(status) : null);

  function handleToggle() {
    open = !open;
    onToggle?.();
  }

  function handleHeaderClick() {
    if (!rowToggleEnabled) return;
    handleToggle();
  }

  function handleHeaderKey(e: KeyboardEvent) {
    if (!rowToggleEnabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleToggle();
    }
  }

  function handleStatusClick() {
    if (!onStatusToggle || !statusOptions || statusOptions.length < 2 || !status) return;
    const idx = statusOptions.findIndex((o) => o.value === status);
    const next = statusOptions[(idx + 1) % statusOptions.length].value;
    onStatusToggle(next);
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
    class="bg-muted/30 hover:bg-muted/50 flex items-center justify-between px-4 py-1 transition-colors {rowToggleEnabled
      ? 'cursor-pointer'
      : ''}"
    role="button"
    tabindex="0"
    onclick={handleHeaderClick}
    onkeydown={handleHeaderKey}
  >
    <div class="flex items-center gap-3">
      <button
        class="text-muted-foreground hover:bg-muted/50 cursor-grab rounded p-1 transition-colors hover:cursor-grabbing"
        data-drag-handle
        tabindex="-1"
        onclick={(e) => e.stopPropagation()}
        {...dragAttributes}
      >
        <GripVertical class="h-4 w-4" />
      </button>
      <div class="flex items-center gap-2">
        <div class="flex items-center gap-2">
          <h4 class="text-sm leading-tight font-medium">{title}</h4>
          {#if subtitleText}
            <span class="text-muted-foreground max-w-[200px] truncate text-xs" title={subtitleText}>
              • {subtitleText}
            </span>
          {/if}
        </div>
        {#if badges && badges.length > 0}
          <div class="flex gap-1">
            {#each badges as badge (badge.label)}
              <span
                class="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs tabular-nums"
                title="{badge.label}: {badge.count}"
              >
                {badge.count}
              </span>
            {/each}
          </div>
        {/if}
        {#if tags && tags.length > 0}
          <div class="flex gap-1">
            {#each tags.slice(0, 3) as tag (typeof tag === 'string' ? tag : tag.name)}
              <span class="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs">
                {typeof tag === 'string' ? tag : tag.name}
              </span>
            {/each}
            {#if tags.length > 3}
              <span class="text-muted-foreground text-xs">
                {m.draggable_more_count({ count: tags.length - 3 })}
              </span>
            {/if}
          </div>
        {/if}
      </div>
      {#if featured}
        <span
          class="bg-primary/10 text-primary border-primary/20 rounded-full border px-2 py-0.5 text-xs font-medium"
        >
          {m.draggable_featured()}
        </span>
      {/if}
    </div>
    <div class="flex items-center gap-2">
      {#if status && statusBadge && onStatusToggle}
        <button
          type="button"
          onclick={(e) => {
            e.stopPropagation();
            handleStatusClick();
          }}
          class="cursor-pointer rounded-full px-2 py-0.5 text-xs font-medium transition-opacity hover:opacity-80 {statusBadge.classes}"
        >
          {statusBadge.label}
        </button>
      {/if}
      {#if onEdit}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onclick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          class="text-muted-foreground hover:text-foreground size-8 cursor-pointer"
        >
          <Edit class="h-4 w-4" />
        </Button>
      {/if}
      {#if onGroup}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onclick={(e) => {
            e.stopPropagation();
            onGroup();
          }}
          class="text-muted-foreground hover:text-foreground size-8 cursor-pointer"
          aria-label={m.block_group_wrap_block()}
        >
          <Group class="h-4 w-4" />
        </Button>
      {/if}
      {#if showRemove}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onclick={(e) => {
            e.stopPropagation();
            onRemove?.();
          }}
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
            aria-label={m.draggable_select_row()}
            onclick={(e) => e.stopPropagation()}
          />
        </div>
      {/if}
      {#if children && !onEdit}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          class="h-8 w-8"
          onclick={(e) => {
            e.stopPropagation();
            handleToggle();
          }}
        >
          <ChevronDown class="h-4 w-4 transition-transform {open ? '' : 'rotate-180'}" />
        </Button>
      {/if}
    </div>
  </div>

  <!-- Content -->
  {#if children && open}
    <div
      class="space-y-4 px-6 pt-4 pb-6"
      in:slide={{ duration: 300, easing: quintOut }}
      out:slide={{ duration: 200, easing: quintIn }}
    >
      {@render children()}
    </div>
  {/if}
</div>
