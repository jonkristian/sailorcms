<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import DeleteDialog from '$lib/components/sailor/dialogs/DeleteDialog.svelte';

  // Custom vertical-only animation
  function verticalFlip(node: Element, { from, to }: { from: DOMRect; to: DOMRect }, params = {}) {
    const dy = from.top - to.top;
    const duration = (params as { duration: number }).duration || 300;

    if (dy === 0) return {};

    return {
      duration,
      css: (t: number) => {
        const y = dy * (1 - t);
        return `transform: translateY(${y}px)`;
      }
    };
  }
  import type { TreeNode, FlatItem } from './types.js';

  let {
    data,
    onDataChange,
    onRemove,
    onBulkDelete,
    children,
    nestable = false,
    showSelection = false,
    extraControls
  } = $props<{
    data: FlatItem[];
    onDataChange?: (updatedData: FlatItem[]) => void;
    onRemove?: (nodeId: string) => void;
    onBulkDelete?: (nodeIds: string[]) => void;
    children: any;
    nestable?: boolean;
    showSelection?: boolean;
    extraControls?: any;
  }>();

  // Drag state
  let draggedIndex = $state<number>(-1);
  let dragOverIndex = $state<number>(-1);
  let dropPosition = $state<'before' | 'after' | 'inside'>('after');
  let isDragging = $state(false);

  // Selection state
  let selectedNodes = $state<Set<string>>(new Set());

  // Delete confirmation dialog state
  let deleteDialogOpen = $state(false);
  let deleteDialogLoading = $state(false);
  let pendingDeleteItems = $state<{ ids: string[]; count: number; itemName?: string }>({
    ids: [],
    count: 0
  });

  // Internal state for flat data mode
  let internalData = $state<FlatItem[]>([]);
  let treeNodes = $state<{ node: TreeNode; depth: number }[]>([]);

  // Initialize internal data when data prop changes
  $effect(() => {
    if (data) {
      internalData = [...data];
    }
  });

  // Update tree nodes when data changes
  $effect(() => {
    if (data || internalData.length > 0) {
      const itemsToUse = data || internalData;
      treeNodes = getTreeNodes(buildTree(itemsToUse));
    } else {
      treeNodes = [];
    }
  });

  // Build tree from flat data
  function buildTree(items: FlatItem[]): TreeNode[] {
    const itemMap = new Map();
    const roots: TreeNode[] = [];

    items.forEach((item) => {
      itemMap.set(item.id, {
        ...item, // Preserve all original data
        name: item.name || item.title || 'Untitled',
        children: []
      });
    });

    items.forEach((item) => {
      const node = itemMap.get(item.id);
      if (item.parent_id && itemMap.has(item.parent_id)) {
        const parent = itemMap.get(item.parent_id);
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    });

    return roots;
  }

  // Get flattened tree nodes for display
  function getTreeNodes(nodes: TreeNode[], depth: number = 0): { node: TreeNode; depth: number }[] {
    const result: { node: TreeNode; depth: number }[] = [];
    for (const node of nodes) {
      result.push({ node, depth });
      if (nestable && node.children.length > 0) {
        result.push(...getTreeNodes(node.children, depth + 1));
      }
    }
    return result;
  }

  // Simple drag handlers
  function handleDragStart(event: DragEvent, index: number) {
    if (!event.dataTransfer) return;

    draggedIndex = index;
    isDragging = true;

    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', index.toString());

    // Add some visual feedback
    const target = event.target as HTMLElement;
    target.style.opacity = '0.5';
  }

  function handleDragEnd(event: DragEvent) {
    draggedIndex = -1;
    dragOverIndex = -1;
    isDragging = false;

    // Reset visual feedback
    const target = event.target as HTMLElement;
    target.style.opacity = '';
  }

  function handleDragOver(event: DragEvent, index: number) {
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'move';

    if (draggedIndex !== -1 && draggedIndex !== index) {
      dragOverIndex = index;

      if (nestable) {
        // Calculate drop position based on mouse position
        const target = event.currentTarget as HTMLElement;
        const rect = target.getBoundingClientRect();
        const mouseY = event.clientY - rect.top;
        const height = rect.height;

        if (mouseY < height * 0.25) {
          dropPosition = 'before';
        } else if (mouseY > height * 0.75) {
          dropPosition = 'after';
        } else {
          dropPosition = 'inside';
        }
      } else {
        // For flat lists, determine before/after based on mouse position
        const target = event.currentTarget as HTMLElement;
        const rect = target.getBoundingClientRect();
        const mouseY = event.clientY - rect.top;
        const height = rect.height;

        if (mouseY < height * 0.5) {
          dropPosition = 'before';
        } else {
          dropPosition = 'after';
        }
      }
    }
  }

  function handleDragLeave(event: DragEvent) {
    // Only clear if we're actually leaving the drop zone
    const relatedTarget = event.relatedTarget as HTMLElement;
    const currentTarget = event.currentTarget as HTMLElement;

    if (!currentTarget.contains(relatedTarget)) {
      dragOverIndex = -1;
    }
  }

  function handleDrop(event: DragEvent, dropIndex: number) {
    event.preventDefault();

    if (draggedIndex === -1) {
      return;
    }

    // Get the actual items from internalData (not treeNodes)
    const items = internalData;
    const newItems = [...items];

    // Convert treeNode indices to internalData indices
    const draggedTreeNode = treeNodes[draggedIndex];
    const targetTreeNode = treeNodes[dropIndex];

    // Find the actual indices in internalData
    const draggedDataIndex = items.findIndex((item) => item.id === draggedTreeNode.node.id);
    const targetDataIndex = items.findIndex((item) => item.id === targetTreeNode.node.id);

    if (draggedDataIndex === -1 || targetDataIndex === -1) {
      dragOverIndex = -1;
      return;
    }

    const draggedItem = newItems[draggedDataIndex];
    const targetItem = newItems[targetDataIndex];

    // Prevent dropping a parent onto its child (circular reference) - only if nestable
    if (nestable && isDescendant(draggedItem, targetItem, newItems)) {
      dragOverIndex = -1;
      return;
    }

    // Remove the dragged item
    const [removedItem] = newItems.splice(draggedDataIndex, 1);

    // Handle different drop positions
    if (nestable && dropPosition === 'inside') {
      // Set as child of target item
      removedItem.parent_id = targetItem.id;

      // Find where to insert - insert after existing children of target
      let insertIndex = -1;
      const targetChildren = newItems.filter((item) => item.parent_id === targetItem.id);

      if (targetChildren.length > 0) {
        // Find the last child of the target and insert after it
        const lastChildIndex = newItems.findIndex((item) => {
          return item.id === targetChildren[targetChildren.length - 1].id;
        });
        insertIndex = lastChildIndex + 1;
      } else {
        // No existing children, insert right after the target item
        const targetIndex = newItems.findIndex((item) => item.id === targetItem.id);
        insertIndex = targetIndex + 1;
      }

      if (insertIndex !== -1) {
        newItems.splice(insertIndex, 0, removedItem);
      } else {
        // Fallback: add at the end
        newItems.push(removedItem);
      }
    } else {
      // Handle before/after positioning
      removedItem.parent_id = targetItem.parent_id;

      // Calculate insertion index correctly
      let insertIndex = newItems.findIndex((item) => item.id === targetItem.id);

      if (insertIndex === -1) {
        // Target not found, fallback to end
        newItems.push(removedItem);
        return;
      }

      if (dropPosition === 'before') {
        // Insert before target
        newItems.splice(insertIndex, 0, removedItem);
      } else {
        // Insert after target
        newItems.splice(insertIndex + 1, 0, removedItem);
      }
    }

    // Update the data with a small delay to ensure animation triggers
    requestAnimationFrame(() => {
      internalData = newItems;
      if (onDataChange) {
        onDataChange(newItems);
      }
    });

    // Reset drag state
    dragOverIndex = -1;
  }

  // Helper function to check if item1 is a descendant of item2
  function isDescendant(item1: FlatItem, item2: FlatItem, items: FlatItem[]): boolean {
    if (!nestable) return false;

    let currentParentId = item2.parent_id;
    while (currentParentId) {
      if (currentParentId === item1.id) {
        return true;
      }
      const parent = items.find((item) => item.id === currentParentId);
      currentParentId = parent?.parent_id;
    }
    return false;
  }

  // Action handlers
  function handleDelete(nodeId: string) {
    // Find the node to get its name
    const node = treeNodes.find(({ node }) => node.id === nodeId)?.node;
    const itemName = node?.name || 'Untitled';

    pendingDeleteItems = { ids: [nodeId], count: 1, itemName };
    deleteDialogOpen = true;
  }

  // Selection handlers
  function handleSelectAll(checked: boolean) {
    if (checked) {
      selectedNodes = new Set(treeNodes.map(({ node }) => node.id));
    } else {
      selectedNodes = new Set();
    }
  }

  function handleSelectNode(nodeId: string, checked: boolean) {
    const newSelectedNodes = new Set(selectedNodes);
    if (checked) {
      newSelectedNodes.add(nodeId);
    } else {
      newSelectedNodes.delete(nodeId);
    }
    selectedNodes = newSelectedNodes;
  }

  function handleBulkDelete() {
    if (selectedNodes.size === 0 || !onBulkDelete) return;

    const selectedNodeIds = Array.from(selectedNodes);

    pendingDeleteItems = { ids: selectedNodeIds, count: selectedNodes.size };
    deleteDialogOpen = true;
  }

  async function confirmBulkDelete() {
    deleteDialogLoading = true;
    try {
      if (pendingDeleteItems.count === 1) {
        // Single item deletion
        if (onRemove) {
          await onRemove(pendingDeleteItems.ids[0]);
        }
      } else {
        // Bulk deletion
        if (onBulkDelete) {
          await onBulkDelete(pendingDeleteItems.ids);
        }
        selectedNodes = new Set(); // Clear selection after bulk delete
      }
      deleteDialogOpen = false;
    } finally {
      deleteDialogLoading = false;
      pendingDeleteItems = { ids: [], count: 0 };
    }
  }

  function cancelBulkDelete() {
    deleteDialogOpen = false;
    pendingDeleteItems = { ids: [], count: 0 };
  }

  // Check if all nodes are selected
  let allSelected = $derived(treeNodes.length > 0 && selectedNodes.size === treeNodes.length);
  let someSelected = $derived(selectedNodes.size > 0 && selectedNodes.size < treeNodes.length);
</script>

<div class="space-y-4">
  <!-- Selection Controls and Bulk Actions -->
  {#if showSelection && treeNodes.length > 0}
    <div class="flex items-center justify-between">
      <!-- Left side: Selection info -->
      {#if selectedNodes.size > 0}
        <div class="text-muted-foreground text-sm">
          {selectedNodes.size} of {treeNodes.length} item(s) selected
        </div>
      {:else}
        <div></div>
      {/if}

      <!-- Right side: Extra Controls, Select All and Delete Selected -->
      <div class="flex items-center gap-2">
        {#if extraControls}
          {@render extraControls()}
        {/if}
        {#if selectedNodes.size > 0}
          <Button variant="destructive" size="sm" onclick={handleBulkDelete}>
            Delete Selected ({selectedNodes.size})
          </Button>
        {/if}
        <Button
          variant="ghost"
          size="sm"
          class="flex items-center gap-2"
          onclick={() => handleSelectAll(!allSelected)}
        >
          <div class="flex items-center justify-center">
            <Checkbox
              checked={allSelected}
              indeterminate={someSelected}
              onCheckedChange={handleSelectAll}
              aria-label="Select all"
              onclick={(e) => e.stopPropagation()}
            />
          </div>
          <span class="text-sm font-medium">Select All</span>
        </Button>
      </div>
    </div>
  {/if}

  <div class="relative space-y-4">
    <!-- Drop zone at the very top (overlay, no layout impact) -->
    {#if isDragging}
      <div
        class="pointer-events-auto absolute -top-2.5 right-0 left-0 z-10 h-4"
        style="pointer-events: auto;"
        role="button"
        tabindex="0"
        aria-label="Drop zone for first position"
        ondragover={(e) => handleDragOver(e, 0)}
        ondrop={(e) => handleDrop(e, 0)}
      >
        {#if dragOverIndex === 0 && draggedIndex !== -1 && draggedIndex !== 0 && dropPosition === 'before'}
          <div
            class="absolute top-0 right-0 left-0 z-10 mx-4 rounded bg-blue-500 transition-all duration-200"
            style="height: 4px;"
          ></div>
        {/if}
      </div>
    {/if}

    {#each treeNodes as { node, depth }, index (node.id)}
      <div
        class="relative transition-all duration-200"
        class:opacity-60={draggedIndex === index}
        data-drag-item
        data-item-id={node.id}
        animate:verticalFlip={{ duration: 300 }}
        role="button"
        tabindex="0"
        aria-label="Drop zone for item {index + 1}"
        ondragover={(e) => handleDragOver(e, index)}
        ondragleave={handleDragLeave}
        ondrop={(e) => handleDrop(e, index)}
        style={nestable ? `margin-left: ${depth * 16}px;` : ''}
      >
        <!-- Drop zone indicators -->
        {#if dragOverIndex === index && draggedIndex !== -1 && draggedIndex !== index}
          {#if dropPosition === 'before' && index > 0}
            <div
              class="absolute -top-2.5 right-0 left-0 z-10 mx-4 rounded bg-blue-500 transition-all duration-200"
              style="height: 4px;"
            ></div>
          {:else if dropPosition === 'after'}
            <div
              class="absolute right-0 -bottom-2.5 left-0 z-10 mx-4 rounded bg-blue-500 transition-all duration-200"
              style="height: 4px;"
            ></div>
          {:else if nestable && dropPosition === 'inside'}
            <div
              class="absolute inset-0 z-10 rounded-lg border-2 border-blue-500 bg-blue-500/20 transition-all duration-200"
            ></div>
          {/if}
        {/if}

        {@render children({
          node,
          handleDelete,
          dragHandleAttributes: {
            draggable: 'true',
            ondragstart: (e: DragEvent) => handleDragStart(e, index),
            ondragend: handleDragEnd,
            style: 'cursor: grab;'
          },
          isDragging: draggedIndex === index,
          showSelection,
          isSelected: selectedNodes.has(node.id),
          onSelectNode: (checked: boolean) => handleSelectNode(node.id, checked)
        })}
      </div>
    {/each}

    <!-- Final drop zone -->
    {#if isDragging}
      <div
        class="h-12 transition-all duration-200"
        role="button"
        tabindex="0"
        aria-label="Drop zone for last position"
        ondragover={(e) => handleDragOver(e, treeNodes.length)}
        ondrop={(e) => handleDrop(e, treeNodes.length)}
      ></div>
    {/if}
  </div>
</div>

<!-- Delete Confirmation Dialog -->
<DeleteDialog
  bind:open={deleteDialogOpen}
  itemCount={pendingDeleteItems.count}
  itemType="item"
  itemName={pendingDeleteItems.itemName || ''}
  onConfirm={confirmBulkDelete}
  onCancel={cancelBulkDelete}
  isLoading={deleteDialogLoading}
/>
