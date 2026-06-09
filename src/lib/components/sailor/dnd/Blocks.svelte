<script lang="ts">
  import { Button } from 'sailorcms/components/ui/button/index.js';
  import { Checkbox } from 'sailorcms/components/ui/checkbox/index.js';
  import DeleteDialog from 'sailorcms/components/sailor/dialogs/DeleteDialog.svelte';
  import { m } from '$sailor/i18n';
  import { Check, Minus } from '@lucide/svelte';

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
    showSelectionControls = true,
    extraControls,
    canAcceptChild,
    indentNested = true,
    listClass = 'relative space-y-4',
    nestedGroups = false,
    isGroupNode,
    groupOuterClass,
    groupInnerClass
  }: {
    data: FlatItem[];
    onDataChange?: (updatedData: FlatItem[]) => void;
    onRemove?: (nodeId: string) => void;
    onBulkDelete?: (nodeIds: string[]) => void;
    children: any;
    nestable?: boolean;
    showSelection?: boolean;
    // Render the built-in select-all / bulk-delete bar. Disable when the host
    // provides its own selection toolbar (the collection editor does) while
    // still wanting per-item checkboxes via showSelection.
    showSelectionControls?: boolean;
    extraControls?: any;
    // Optional gate for 'inside' (nesting) drops. When provided, a middle-zone
    // hover only resolves to 'inside' if it returns true; otherwise the drop
    // falls back to before/after. Used by block grouping to allow only
    // blocks-into-groups (no group-in-group, no block-accepts-child).
    canAcceptChild?: (draggedItem: FlatItem, targetItem: FlatItem) => boolean;
    // When false, nested rows aren't given the depth-based left margin (the
    // consumer handles containment visually instead, e.g. via itemClass).
    indentNested?: boolean;
    // Class for the rows container. Defaults to `space-y-4` (even spacing
    // between every row). A consumer drawing multi-row containers can drop the
    // spacing (`'relative'`) and own per-row margins via itemClass — no margin
    // overrides needed.
    listClass?: string;
    // Nested rendering: when true, a root node that is a group (isGroupNode) or
    // has children is rendered as an outer wrapper (groupOuterClass) holding its
    // header row plus an inner wrapper (groupInnerClass, e.g. `grid gap-3`)
    // around its child rows — a real DOM container, so the dashed box + gap live
    // on actual elements instead of being faked per-row.
    nestedGroups?: boolean;
    isGroupNode?: (node: FlatItem) => boolean;
    groupOuterClass?: (node: FlatItem) => string;
    groupInnerClass?: string;
  } = $props();

  // Drag state
  let draggedIndex: number = $state(-1);
  let dragOverIndex: number = $state(-1);
  let dropPosition: 'before' | 'after' | 'inside' = $state('after');
  let isDragging = $state(false);

  // Selection state
  let selectedNodes: Set<string> = $state(new Set());

  // Delete confirmation dialog state
  let deleteDialogOpen = $state(false);
  let deleteDialogLoading = $state(false);
  let pendingDeleteItems: { ids: string[]; count: number; itemName?: string } = $state({
    ids: [],
    count: 0
  });

  // Tree nodes derived directly from data — no internal duplicate state
  const tree: TreeNode[] = $derived(buildTree(data || []));
  const treeNodes: { node: TreeNode; depth: number }[] = $derived(getTreeNodes(tree));
  // Flat index per node id (DFS order = treeNodes order) so nested rendering can
  // still drive the index-based drag handlers.
  const flatIndexById: Map<string, number> = $derived(
    new Map(treeNodes.map((t, i) => [t.node.id, i]))
  );

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
      // Treat self-cycles and dangling parent_ids as roots so corrupted rows
      // remain visible (otherwise they'd vanish from the tree entirely).
      const hasValidParent =
        item.parent_id && item.parent_id !== item.id && itemMap.has(item.parent_id);
      if (hasValidParent) {
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

        // Gate the middle 'inside' zone through canAcceptChild (if supplied);
        // when nesting isn't allowed for this pair the row behaves as a flat
        // before/after target instead.
        const draggedNode = treeNodes[draggedIndex]?.node as FlatItem | undefined;
        const targetNode = treeNodes[index]?.node as FlatItem | undefined;
        const insideAllowed =
          !canAcceptChild ||
          (!!draggedNode && !!targetNode && canAcceptChild(draggedNode, targetNode));

        if (mouseY < height * 0.25) {
          dropPosition = 'before';
        } else if (mouseY > height * 0.75) {
          dropPosition = 'after';
        } else if (insideAllowed) {
          dropPosition = 'inside';
        } else {
          dropPosition = mouseY < height * 0.5 ? 'before' : 'after';
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

    // Bail when dropping on self, or when the drop fires without a visible
    // indicator (stale dropPosition from a prior hover). Without this, an
    // 'inside' drop on the dragged row sets parent_id = id, orphaning it.
    // Also bail on out-of-range dropIndex (the bottom drop zone passes
    // treeNodes.length, which has no corresponding tree node).
    if (
      draggedIndex === dropIndex ||
      dragOverIndex !== dropIndex ||
      dropIndex < 0 ||
      dropIndex >= treeNodes.length
    ) {
      dragOverIndex = -1;
      return;
    }

    const items = data || [];
    const newItems = [...items];

    // Convert treeNode indices to data indices
    const draggedTreeNode = treeNodes[draggedIndex];
    const targetTreeNode = treeNodes[dropIndex];

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

    // Safety net: never nest a pair canAcceptChild rejects (handleDragOver
    // already steers away from 'inside', but a stale dropPosition could slip).
    if (
      nestable &&
      dropPosition === 'inside' &&
      canAcceptChild &&
      !canAcceptChild(draggedItem, targetItem)
    ) {
      dragOverIndex = -1;
      return;
    }

    // Remove the dragged item
    const [removedItem] = newItems.splice(draggedDataIndex, 1);

    // Handle different drop positions
    if (nestable && dropPosition === 'inside') {
      removedItem.parent_id = targetItem.id;

      let insertIndex = -1;
      const targetChildren = newItems.filter((item) => item.parent_id === targetItem.id);

      if (targetChildren.length > 0) {
        const lastChildIndex = newItems.findIndex((item) => {
          return item.id === targetChildren[targetChildren.length - 1].id;
        });
        insertIndex = lastChildIndex + 1;
      } else {
        const targetIndex = newItems.findIndex((item) => item.id === targetItem.id);
        insertIndex = targetIndex + 1;
      }

      if (insertIndex !== -1) {
        newItems.splice(insertIndex, 0, removedItem);
      } else {
        newItems.push(removedItem);
      }
    } else {
      removedItem.parent_id = targetItem.parent_id;

      const insertIndex = newItems.findIndex((item) => item.id === targetItem.id);

      if (insertIndex === -1) {
        newItems.push(removedItem);
        dragOverIndex = -1;
        return;
      }

      if (dropPosition === 'before') {
        newItems.splice(insertIndex, 0, removedItem);
      } else {
        newItems.splice(insertIndex + 1, 0, removedItem);
      }
    }

    dragOverIndex = -1;
    onDataChange?.(newItems);
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
  {#if showSelectionControls && showSelection && treeNodes.length > 0}
    <div class="flex items-center justify-between">
      <!-- Left side: Selection info -->
      {#if selectedNodes.size > 0}
        <div class="text-muted-foreground text-sm">
          {m.blocks_items_selected({ selected: selectedNodes.size, total: treeNodes.length })}
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
            {m.blocks_delete_selected({ count: selectedNodes.size })}
          </Button>
        {/if}
        <Button
          variant="ghost"
          size="sm"
          class="flex items-center gap-2"
          onclick={() => handleSelectAll(!allSelected)}
          aria-label={m.blocks_select_all_aria()}
          aria-pressed={allSelected}
        >
          <span
            class="border-input bg-background flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border"
            class:bg-primary={allSelected || someSelected}
            class:border-primary={allSelected || someSelected}
            aria-hidden="true"
          >
            {#if someSelected && !allSelected}
              <Minus class="text-primary-foreground h-3 w-3" />
            {:else if allSelected}
              <Check class="text-primary-foreground h-3 w-3" />
            {/if}
          </span>
          <span class="text-sm font-medium">{m.blocks_select_all()}</span>
        </Button>
      </div>
    </div>
  {/if}

  <div class={listClass}>
    <!-- Drop zone at the very top (overlay, no layout impact) -->
    {#if isDragging}
      <div
        class="pointer-events-auto absolute -top-2.5 right-0 left-0 z-10 h-4"
        style="pointer-events: auto;"
        role="button"
        tabindex="0"
        aria-label={m.blocks_drop_zone_first()}
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

    {#snippet row(node: any, index: number, depth: number)}
      <div
        class="relative transition-all duration-200"
        class:opacity-60={draggedIndex === index}
        data-drag-item
        data-item-id={node.id}
        role="button"
        tabindex="0"
        aria-label={m.blocks_drop_zone_item({ index: index + 1 })}
        ondragover={(e) => handleDragOver(e, index)}
        ondragleave={handleDragLeave}
        ondrop={(e) => handleDrop(e, index)}
        style={nestable && indentNested ? `margin-left: ${depth * 16}px;` : ''}
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
    {/snippet}

    {#if nestedGroups}
      <!-- Nested: a group root becomes an outer wrapper (header + inner grid
           wrapper around its child rows). Drag still runs on the flat indices.
           animate: lives on each keyed-each direct child (wrapper / row holder),
           never inside the row snippet. -->
      {#each tree as node (node.id)}
        <div animate:verticalFlip={{ duration: 300 }}>
          {#if isGroupNode ? isGroupNode(node) : node.children.length > 0}
            <div class={groupOuterClass ? groupOuterClass(node) : ''}>
              {@render row(node, flatIndexById.get(node.id) ?? -1, 0)}
              <div class={groupInnerClass ?? ''}>
                {#each node.children as child (child.id)}
                  <div animate:verticalFlip={{ duration: 300 }}>
                    {@render row(child, flatIndexById.get(child.id) ?? -1, 0)}
                  </div>
                {/each}
              </div>
            </div>
          {:else}
            {@render row(node, flatIndexById.get(node.id) ?? -1, 0)}
          {/if}
        </div>
      {/each}
    {:else}
      {#each treeNodes as { node, depth }, index (node.id)}
        <div animate:verticalFlip={{ duration: 300 }}>
          {@render row(node, index, depth)}
        </div>
      {/each}
    {/if}

    <!-- Final drop zone -->
    {#if isDragging}
      <div
        class="h-12 transition-all duration-200"
        role="button"
        tabindex="0"
        aria-label={m.blocks_drop_zone_last()}
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
  labels={{ singular: m.common_item_singular(), plural: m.common_item_plural() }}
  itemName={pendingDeleteItems.itemName || ''}
  onConfirm={confirmBulkDelete}
  onCancel={cancelBulkDelete}
  isLoading={deleteDialogLoading}
/>
