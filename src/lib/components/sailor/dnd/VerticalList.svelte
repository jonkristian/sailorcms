<script lang="ts">
  import { flip } from 'svelte/animate';

  let { items, onItemsChange, children } = $props<{
    items: Array<{ id: string; [key: string]: any }>;
    onItemsChange?: (items: Array<{ id: string; [key: string]: any }>) => void;
    children: any;
  }>();

  // Drag state
  let draggedIndex = $state<number>(-1);
  let dragOverIndex = $state<number>(-1);

  // Drag handlers
  function handleDragStart(event: DragEvent, index: number) {
    if (!event.dataTransfer) return;

    draggedIndex = index;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', index.toString());
  }

  function handleDragEnd() {
    draggedIndex = -1;
    dragOverIndex = -1;
  }

  function handleDragOver(event: DragEvent, index: number) {
    event.preventDefault();
    event.stopPropagation(); // Prevent event bubbling
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
    // When dragging downwards (draggedIndex < dropIndex), we want to insert AFTER the target
    // After removing the dragged item, the target position shifts back by 1
    if (draggedIndex < dropIndex) {
      insertIndex = dropIndex; // Insert after the target position (which is now at dropIndex-1 after removal)
    }
    // When dragging upwards (draggedIndex > dropIndex), insert at the target position

    // Ensure valid bounds
    insertIndex = Math.max(0, Math.min(insertIndex, newItems.length));

    // Insert at new position
    newItems.splice(insertIndex, 0, draggedItem);

    // Reset drag state
    dragOverIndex = -1;

    // Call callback immediately like Grid does
    onItemsChange?.(newItems);
  }
</script>

<div class="space-y-2">
  {#each items as item, index (item.id)}
    <div
      class="relative transition-all duration-200"
      class:opacity-50={draggedIndex === index}
      class:scale-95={draggedIndex !== -1 && index !== draggedIndex}
      animate:flip={{ duration: 300 }}
      ondragover={(e) => handleDragOver(e, index)}
      ondragleave={handleDragLeave}
      ondrop={(e) => handleDrop(e, index)}
      role="button"
      tabindex="0"
    >
      <!-- Drop indicator - full overlay like Grid component -->
      {#if dragOverIndex === index && draggedIndex !== -1 && draggedIndex !== index}
        <div
          class="absolute inset-0 z-20 rounded border-2 border-blue-500 bg-blue-500/10 transition-all duration-200"
        ></div>
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
