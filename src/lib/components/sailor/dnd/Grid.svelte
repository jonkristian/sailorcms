<script lang="ts">
  let {
    items,
    onItemsChange,
    onItemRemove,
    showSelection = false,
    gridCols = 4,
    children
  } = $props<{
    items: Array<{ id: string; [key: string]: any }>;
    onItemsChange?: (items: Array<{ id: string; [key: string]: any }>) => void;
    onItemRemove?: (itemId: string) => void;
    showSelection?: boolean;
    gridCols?: number;
    children: any;
  }>();

  // Drag state
  let draggedIndex = $state<number>(-1);
  let dragOverIndex = $state<number>(-1);
  let isDragging = $state(false);

  // Selection state
  let selectedItems = $state<Set<string>>(new Set());

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
    isDragging = true;

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
    const draggedItem = newItems[draggedIndex];

    // Remove the dragged item
    newItems.splice(draggedIndex, 1);

    // Calculate correct insertion index after removal
    let insertIndex = dropIndex;
    // When dragging forward in array order (draggedIndex < dropIndex), we want to insert AFTER the target
    // After removing the dragged item, the target position shifts back by 1
    if (draggedIndex < dropIndex) {
      insertIndex = dropIndex; // Insert after the target position (which is now at dropIndex-1 after removal)
    }
    // When dragging backward in array order (draggedIndex > dropIndex), insert at the target position

    // Ensure valid bounds
    insertIndex = Math.max(0, Math.min(insertIndex, newItems.length));

    // Insert at new position
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
        role="button"
        tabindex="0"
        ondragover={(e) => handleDragOver(e, index)}
        ondragleave={handleDragLeave}
        ondrop={(e) => handleDrop(e, index)}
      >
        <!-- Drop indicator between items -->
        {#if dragOverIndex === index && draggedIndex !== -1 && draggedIndex !== index}
          <div
            class="absolute inset-0 z-20 rounded border-2 border-blue-500 bg-blue-500/10 transition-all duration-200"
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
