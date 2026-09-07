<script lang="ts">
  let {
    items,
    onItemsChange,
    onItemRemove,
    showSelection = false,
    gridCols = 4,
    children
  }: {
    items: Array<{ id: string; [key: string]: any }>;
    onItemsChange?: (items: Array<{ id: string; [key: string]: any }>) => void;
    onItemRemove?: (itemId: string) => void;
    showSelection?: boolean;
    gridCols?: number;
    children: any;
  } = $props();

  // Drag state
  let draggedIndex: number = $state(-1);
  let dragOverIndex: number = $state(-1);
  /**
   * Which side of the hovered item the drop lands on. A grid flows left to
   * right, so the pointer's horizontal position picks the side — the same
   * question a vertical list answers with mouseY.
   */
  let dropPosition: 'before' | 'after' = $state('after');
  let isDragging = $state(false);

  // Selection state
  let selectedItems: Set<string> = $state(new Set());

  // Calculate grid position helpers
  function getRowCol(index: number, cols: number) {
    return {
      row: Math.floor(index / cols),
      col: index % cols
    };
  }

  function getIndexFromRowCol(row: number, col: number, cols: number) {
    return row * cols + col;
  }

  // Drag handlers
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

    const target = event.target as HTMLElement;
    target.style.opacity = '0.5';
  }

  function handleDragEnd(event: DragEvent) {
    draggedIndex = -1;
    dragOverIndex = -1;
    isDragging = false;

    const target = event.target as HTMLElement;
    target.style.opacity = '';
  }

  function handleDragOver(event: DragEvent, index: number) {
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'move';

    if (draggedIndex !== -1 && draggedIndex !== index) {
      dragOverIndex = index;

      // The side used to be inferred from drag *direction* — forward landed
      // after the target, backward landed before it. Two opposite outcomes
      // behind one identical highlight, with nothing on screen to tell them
      // apart. Read it from the pointer instead, and show it.
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      dropPosition = event.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
    }
  }

  function handleDragLeave(event: DragEvent) {
    const relatedTarget = event.relatedTarget as HTMLElement;
    const currentTarget = event.currentTarget as HTMLElement;

    if (!currentTarget.contains(relatedTarget)) {
      dragOverIndex = -1;
    }
  }

  function handleDrop(event: DragEvent, dropIndex: number) {
    event.preventDefault();

    if (draggedIndex === -1 || draggedIndex === dropIndex) {
      dragOverIndex = -1;
      return;
    }

    const newItems = [...items];
    const [draggedItem] = newItems.splice(draggedIndex, 1);

    // Position is now stated outright rather than derived from direction.
    let insertIndex = dropPosition === 'after' ? dropIndex + 1 : dropIndex;
    // The target shifted back by one if the dragged item sat before it.
    if (draggedIndex < insertIndex) insertIndex--;
    insertIndex = Math.max(0, Math.min(insertIndex, newItems.length));

    newItems.splice(insertIndex, 0, draggedItem);

    // Update items
    if (onItemsChange) {
      onItemsChange(newItems);
    }

    // Reset drag state
    dragOverIndex = -1;
  }

  // Selection handlers
  function handleSelectItem(itemId: string, checked: boolean) {
    const newSelectedItems = new Set(selectedItems);
    if (checked) {
      newSelectedItems.add(itemId);
    } else {
      newSelectedItems.delete(itemId);
    }
    selectedItems = newSelectedItems;
  }

  function handleRemoveItem(itemId: string) {
    if (onItemRemove) {
      onItemRemove(itemId);
    }
  }

  // Custom animation for grid items
  function gridFlip(node: Element, { from, to }: { from: DOMRect; to: DOMRect }, params = {}) {
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    const duration = (params as { duration: number }).duration || 300;

    if (dx === 0 && dy === 0) return {};

    return {
      duration,
      css: (t: number) => {
        const x = dx * (1 - t);
        const y = dy * (1 - t);
        return `transform: translate(${x}px, ${y}px)`;
      }
    };
  }
</script>

<div class="space-y-4">
  <!-- Grid container -->
  <div class="grid gap-4" style="grid-template-columns: repeat({gridCols}, minmax(0, 1fr));">
    {#each items as item, index (item.id)}
      <div
        class="relative transition-all duration-200"
        class:opacity-50={draggedIndex === index}
        class:scale-95={draggedIndex !== -1 && index !== draggedIndex}
        animate:gridFlip={{ duration: 300 }}
      >
        <!-- The `gap-4` lanes between cards belong to no card, so a drag over
             one fires no `dragover` and a drop there is discarded. Claimed by
             an overlay that exists only mid-drag, rather than by resizing the
             card, which would collapse the grid gap instead of covering it.
             `-inset-3` overshoots the 8px half-gap on purpose: the cards are
             `scale-95` while a drag is in progress, and the overlay scales with
             them. Neighbours overlapping is harmless — the later one wins. -->
        {#if isDragging}
          <div
            class="absolute -inset-3 z-30"
            role="button"
            tabindex="-1"
            aria-label={`Drop position ${index + 1}`}
            ondragover={(e) => handleDragOver(e, index)}
            ondragleave={handleDragLeave}
            ondrop={(e) => handleDrop(e, index)}
          ></div>
        {/if}

        <!-- Drop indicator between items -->
        {#if dragOverIndex === index && draggedIndex !== -1 && draggedIndex !== index}
          <!-- An insertion bar on the edge the item will land against, matching
               the vertical list's horizontal mode. Filling the whole tile said
               only "this one", which is the one thing that was never in
               question. -->
          <div
            class="bg-primary absolute top-0 bottom-0 z-30 w-1 rounded-full transition-all duration-150"
            class:-left-2={dropPosition === 'before'}
            class:-right-2={dropPosition === 'after'}
          ></div>
        {/if}

        {@render children({
          item,
          index,
          handleRemoveItem,
          dragHandleAttributes: {
            draggable: 'true',
            ondragstart: (e: DragEvent) => handleDragStart(e, index),
            ondragend: handleDragEnd,
            style: 'cursor: grab;'
          },
          isDragging: draggedIndex === index,
          showSelection,
          isSelected: selectedItems.has(item.id),
          onSelectItem: (checked: boolean) => handleSelectItem(item.id, checked)
        })}
      </div>
    {/each}
  </div>
</div>
