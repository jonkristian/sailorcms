<script lang="ts">
  import { flip } from 'svelte/animate';

  let {
    items,
    onItemsChange,
    // Layout of the item container. Defaults to a vertical stack; pass a
    // wrapping flex row for inline chips. The reorder maths is layout-agnostic,
    // so this stays one component rather than a near-duplicate per layout.
    containerClass = 'space-y-2',
    // Which edge the insertion line sits on, and which axis decides
    // before/after. Set 'horizontal' for a row of chips.
    orientation = 'vertical',
    children
  }: {
    items: Array<{ id: string; [key: string]: any }>;
    onItemsChange?: (items: Array<{ id: string; [key: string]: any }>) => void;
    containerClass?: string;
    orientation?: 'vertical' | 'horizontal';
    children: any;
  } = $props();

  let draggedIndex: number = $state(-1);
  let dragOverIndex: number = $state(-1);
  /**
   * Deliberately separate from `draggedIndex`: the catchers must not mount in
   * the same tick the drag starts, or Chrome abandons it. See `handleDragStart`.
   */
  let isDragging = $state(false);
  // An insertion line has to say which side of the hovered item it means —
  // without this it reads as "drop into that element" rather than "insert here".
  let dropPosition: 'before' | 'after' = $state('before');

  function handleDragStart(event: DragEvent, index: number) {
    if (!event.dataTransfer) return;
    draggedIndex = index;

    // Mounting the gap catchers here kills the drag outright in Chrome: the
    // browser abandons it when this much of the source's subtree appears
    // underneath it mid-`dragstart` — `dragend` fires immediately and no
    // `dragover` ever arrives. A frame later the drag has committed and the
    // same mutation is harmless. Items stay drop targets on their own until
    // then, so nothing is missed in the meantime.
    requestAnimationFrame(() => {
      if (draggedIndex === -1) return;
      isDragging = true;
    });

    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', index.toString());
  }

  function handleDragEnd() {
    draggedIndex = -1;
    dragOverIndex = -1;
    isDragging = false;
  }

  function handleDragOver(event: DragEvent, index: number) {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer!.dropEffect = 'move';
    if (draggedIndex === -1) return;

    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    dropPosition =
      orientation === 'horizontal'
        ? event.clientX < rect.left + rect.width / 2
          ? 'before'
          : 'after'
        : event.clientY < rect.top + rect.height / 2
          ? 'before'
          : 'after';

    dragOverIndex = index;
  }

  function handleDragLeave(event: DragEvent) {
    const relatedTarget = event.relatedTarget as HTMLElement;
    const currentTarget = event.currentTarget as HTMLElement;
    if (!currentTarget.contains(relatedTarget)) {
      dragOverIndex = -1;
    }
  }

  /** Where the dragged item would land, in post-removal coordinates. */
  function targetIndex(dropIndex: number): number {
    let target = dropIndex + (dropPosition === 'after' ? 1 : 0);
    if (draggedIndex < target) target--;
    return target;
  }

  /** True when the drop would leave the order unchanged, so no line is drawn. */
  function isNoop(index: number): boolean {
    return draggedIndex === index || targetIndex(index) === draggedIndex;
  }

  function handleDrop(event: DragEvent, dropIndex: number) {
    event.preventDefault();
    if (draggedIndex === -1 || isNoop(dropIndex)) {
      dragOverIndex = -1;
      return;
    }

    const newItems = [...items];
    const [dragged] = newItems.splice(draggedIndex, 1);
    newItems.splice(Math.max(0, Math.min(targetIndex(dropIndex), newItems.length)), 0, dragged);

    dragOverIndex = -1;
    isDragging = false;
    onItemsChange?.(newItems);
  }
</script>

<div class={containerClass} role="list">
  {#each items as item, index (item.id)}
    <div
      class="relative transition-opacity duration-200"
      class:opacity-40={draggedIndex === index}
      animate:flip={{ duration: 300 }}
      role="listitem"
    >
      <!-- The container's gap (`space-y-2` by default) belongs to no item, so a
           drop aimed at the insertion line below — which is drawn in that gap —
           lands on nothing. Only mounted mid-drag, so it never swallows a click
           on the row's own buttons. `-inset-1` covers half the gap on every
           side, which suits either orientation. -->
      {#if isDragging}
        <div
          class="absolute -inset-1 z-30"
          role="button"
          tabindex="-1"
          aria-label={`Drop position ${index + 1}`}
          ondragover={(e) => handleDragOver(e, index)}
          ondragleave={handleDragLeave}
          ondrop={(e) => handleDrop(e, index)}
        ></div>
      {/if}
      <!-- Insertion line, not an overlay: the item is a neighbour to land beside,
           not a container to drop into. -->
      {#if dragOverIndex === index && draggedIndex !== -1 && !isNoop(index)}
        {#if orientation === 'horizontal'}
          <div
            class="bg-primary absolute top-0 bottom-0 z-20 w-0.5 rounded-full"
            class:-left-1={dropPosition === 'before'}
            class:-right-1={dropPosition === 'after'}
          ></div>
        {:else}
          <div
            class="bg-primary absolute right-0 left-0 z-20 h-0.5 rounded-full"
            class:-top-1={dropPosition === 'before'}
            class:-bottom-1={dropPosition === 'after'}
          ></div>
        {/if}
      {/if}

      {@render children({
        item,
        index,
        dragHandleAttributes: {
          draggable: true,
          ondragstart: (e: DragEvent) => handleDragStart(e, index),
          ondragend: handleDragEnd,
          style: 'cursor: grab;'
        },
        isDragging: draggedIndex === index
      })}
    </div>
  {/each}
</div>
