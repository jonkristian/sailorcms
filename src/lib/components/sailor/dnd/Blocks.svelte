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
  /**
   * Depth an 'after' drop should land at, when the boundary allows more than
   * one. Null everywhere else, where the hovered row's own depth is the only
   * legal answer.
   */
  let dropDepth: number | null = $state(null);
  /**
   * The dragged row's id. Indices shift the moment the list reorders, so the
   * faded state has to hang off identity — keyed by index it jumped to whichever
   * row inherited the old position mid-animation.
   */
  let draggedId: string | null = $state(null);
  /** The handle carrying the inline fade, so the drop can clear it directly. */
  let dragSourceEl: HTMLElement | null = null;
  /**
   * Offsets that lift the drop line out of the group box it is drawn inside.
   *
   * Depth is shown by containment here, not indentation, so a line drawn inside
   * a group's box says "into this group" no matter what it means. When the drop
   * actually lands *outside* that group — after the last child of a group, which
   * resolves to root — the line has to sit in the gap between the boxes or it
   * offers something the drop will not do, and that nothing allows anyway.
   */
  let outdentBar: { bottom: number; left: number } | null = $state(null);

  const INDENT_PX = 16;
  /** Reach to use when a row has no measured neighbour (first, last, alone). */
  const DEFAULT_REACH_PX = 8;

  let listEl: HTMLElement | null = $state(null);
  /**
   * How far each row's drop catcher may extend past its own box, keyed by item
   * id. Half the distance to the neighbour on that side, so consecutive rows
   * meet exactly in the middle of the gap and neither reaches into the other.
   *
   * Measured rather than fixed because the gap is not one number: rows sit
   * 12–16px apart, but a group boundary in the blocks editor is 44px, and a
   * constant big enough for the latter would have a row's catcher covering part
   * of its neighbour, stealing drops meant for it.
   */
  let rowReach: Record<string, { top: number; bottom: number }> = $state({});

  /** Rows do not move during a drag, so once at the start is enough. */
  function measureRowReach() {
    if (!listEl) return;
    const els = [...listEl.querySelectorAll('[data-drag-item]')] as HTMLElement[];
    const rects = els.map((el) => el.getBoundingClientRect());
    const next: Record<string, { top: number; bottom: number }> = {};
    els.forEach((el, i) => {
      const id = el.dataset.itemId;
      if (!id) return;
      const gapAbove = i > 0 ? rects[i].top - rects[i - 1].bottom : NaN;
      const gapBelow = i < rects.length - 1 ? rects[i + 1].top - rects[i].bottom : NaN;
      next[id] = {
        top: Number.isFinite(gapAbove) ? Math.max(0, Math.round(gapAbove / 2)) : DEFAULT_REACH_PX,
        bottom: Number.isFinite(gapBelow) ? Math.max(0, Math.round(gapBelow / 2)) : DEFAULT_REACH_PX
      };
    });
    rowReach = next;
  }

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
    draggedId = treeNodes[index]?.node?.id ?? null;

    // Mounting the gap catchers here kills the drag outright in Chrome: the
    // browser abandons it when this much of the source's subtree appears
    // underneath it mid-`dragstart` — `dragend` fires immediately and no
    // `dragover` ever arrives. A frame later the drag has committed and the
    // same mutation is harmless. The rows are drop targets on their own until
    // then, so nothing is missed in the meantime.
    requestAnimationFrame(() => {
      if (draggedIndex === -1) return;
      measureRowReach();
      isDragging = true;
    });

    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', index.toString());

    // Add some visual feedback
    dragSourceEl = event.target as HTMLElement;
    dragSourceEl.style.opacity = '0.5';
  }

  /**
   * Clears every trace of a drag. Called on drop as well as on dragend, because
   * `dragend` only fires after the list has already re-rendered and started its
   * animation — leaving the moved row translucent while it slid into place.
   */
  function resetDragState() {
    if (dragSourceEl) {
      dragSourceEl.style.opacity = '';
      dragSourceEl = null;
    }
    draggedIndex = -1;
    draggedId = null;
    dragOverIndex = -1;
    dropDepth = null;
    outdentBar = null;
    isDragging = false;
  }

  function handleDragEnd() {
    resetDragState();
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

        // Thirds, not quarters: an 'inside' band covering half of every row
        // means a drag travelling down a list is over a nest target most of
        // the time, and reordering at the current level becomes the hard case.
        // A group's header row is not the group's bottom edge — its children are
        // rendered below it inside the same wrapper. So 'after the header' draws
        // a line *between the header and the first child*, which reads as "into
        // this group" while meaning "after the whole group". The whole header
        // therefore means "before this group"; the group's real trailing edge is
        // the 'after' zone of its last child, which is already reachable.
        const targetNode2 = treeNodes[index]?.node;
        const headerOfOpenGroup =
          nestedGroups && !!targetNode2?.children?.length && (isGroupNode?.(targetNode2) ?? false);

        if (mouseY < height / 3) {
          dropPosition = 'before';
        } else if (mouseY > (height * 2) / 3) {
          dropPosition = 'after';
        } else if (insideAllowed) {
          dropPosition = 'inside';
        } else {
          dropPosition = mouseY < height * 0.5 ? 'before' : 'after';
        }

        // Applied after the chain, not inside it: when nesting is disallowed the
        // fallback re-derives 'after' on its own, so gating only the branch
        // above left the misleading line in place.
        if (headerOfOpenGroup && dropPosition === 'after') dropPosition = 'before';

        if (dropPosition === 'inside') {
          dropDepth = null;
        } else {
          const legal = legalDropDepth(index, dropPosition);
          // No depth here will take the dragged row, so this row is not a drop
          // target at all — better to show nothing than a line that lies.
          if (legal === null) {
            dragOverIndex = -1;
            return;
          }
          dropDepth = legal;
        }

        outdentBar = null;
        const rowDepth = treeNodes[index]?.depth ?? 0;
        if (nestedGroups && dropDepth !== null && dropDepth < rowDepth) {
          const rowEl = (event.currentTarget as HTMLElement).closest('[data-drag-item]');
          const box = rowEl?.closest('[data-drag-group]');
          if (rowEl && box) {
            const rowRect = rowEl.getBoundingClientRect();
            const boxRect = box.getBoundingClientRect();
            outdentBar = {
              // Clear of the box, into the gap that separates it from the next.
              bottom: Math.round(boxRect.bottom - rowRect.bottom) + 6,
              left: Math.round(rowRect.left - boxRect.left)
            };
          }
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

  /**
   * The depths a before/after drop beside row `index` could legally express.
   *
   * Dropping below the last row of a subtree is the one genuinely ambiguous
   * position in the tree: the row underneath sits at a shallower depth, so
   * every level between the two is a possible home and vertical position alone
   * cannot say which. Everywhere else the row below is at the same depth or
   * deeper, and the hovered row's depth is the only answer.
   *
   * `preferred` is the dragged row's own depth, because a move is far more
   * often a reorder than a change of level: dragging a root row to such a
   * boundary means putting it between two roots, not adopting it into the
   * subtree above.
   *
   * Depth deliberately does not track horizontal pointer movement. An earlier
   * version read it as an indent gesture at one step per 16px, which turned the
   * slight rightward drift of an ordinary downward drag into a silent
   * reparenting.
   */
  function dropDepthRange(index: number, position: 'before' | 'after') {
    const hoveredDepth = treeNodes[index]?.depth ?? 0;
    const draggedDepth = treeNodes[draggedIndex]?.depth ?? 0;
    if (position === 'before')
      return { min: hoveredDepth, max: hoveredDepth, preferred: hoveredDepth };

    // What follows the boundary decides how shallow a drop here may go — but
    // the dragged row is still in the list and about to leave it, taking its
    // descendants with it. Skipping only the row itself would read its own
    // children as "what follows" and wrongly rule the outdent out.
    let nextIndex = index + 1;
    if (nextIndex === draggedIndex) {
      nextIndex++;
      while ((treeNodes[nextIndex]?.depth ?? -1) > draggedDepth) nextIndex++;
    }
    // No next row means the end of the list, where every level is available.
    const nextDepth = treeNodes[nextIndex]?.depth ?? 0;
    if (nextDepth >= hoveredDepth) {
      return { min: hoveredDepth, max: hoveredDepth, preferred: hoveredDepth };
    }
    return {
      min: nextDepth,
      max: hoveredDepth,
      preferred: Math.min(hoveredDepth, Math.max(nextDepth, draggedDepth))
    };
  }

  /**
   * The shallowest depth at this position whose resulting parent will have the
   * dragged row, or null when none will.
   *
   * `canAcceptChild` used to gate only the `inside` zone, so a pair it rejected
   * could still be nested by dropping *beside* one of that parent's children —
   * before/after simply inherited the target's `parent_id` unchecked. That let
   * a block group be dropped into another block group, which nothing supports.
   */
  function legalDropDepth(index: number, position: 'before' | 'after'): number | null {
    const draggedNode = treeNodes[draggedIndex]?.node as FlatItem | undefined;
    const targetNode = treeNodes[index]?.node as FlatItem | undefined;
    if (!draggedNode || !targetNode) return null;

    const targetDepth = treeNodes[index]?.depth ?? 0;
    const { min, preferred } = dropDepthRange(index, position);
    const items = data || [];

    for (let depth = preferred; depth >= min; depth--) {
      const parentId = ancestorParentId(targetNode, targetDepth, depth, items);
      if (parentAccepts(draggedNode, parentId, items)) return depth;
    }
    return null;
  }

  /** Root always accepts; anything else has to pass `canAcceptChild`. */
  function parentAccepts(dragged: FlatItem, parentId: string | null, items: FlatItem[]): boolean {
    if (!canAcceptChild || parentId === null) return true;
    const parent = items.find((item) => item.id === parentId);
    return !!parent && canAcceptChild(dragged, parent);
  }

  /** The `parent_id` that puts a row at `wantedDepth`, given a sibling of `from`. */
  function ancestorParentId(
    from: FlatItem,
    fromDepth: number,
    wantedDepth: number,
    items: FlatItem[]
  ): string | null {
    let parentId = from.parent_id ?? null;
    for (let depth = fromDepth; depth > wantedDepth; depth--) {
      parentId = items.find((item) => item.id === parentId)?.parent_id ?? null;
    }
    return parentId;
  }

  function handleDragLeave(event: DragEvent) {
    // Only clear if we're actually leaving the drop zone
    const relatedTarget = event.relatedTarget as HTMLElement;
    const currentTarget = event.currentTarget as HTMLElement;

    // Moving from one row straight onto the next is not leaving the list, and
    // clearing here made the indicator blink out at every boundary crossing.
    if (!currentTarget.contains(relatedTarget) && !relatedTarget?.closest?.('[data-drag-item]')) {
      dragOverIndex = -1;
      dropDepth = null;
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
      removedItem.parent_id =
        dropDepth !== null
          ? ancestorParentId(targetItem, targetTreeNode.depth, dropDepth, newItems)
          : (targetItem.parent_id ?? null);

      // Safety net, mirroring the one guarding 'inside': never land somewhere
      // `canAcceptChild` rejects, however stale the hover state.
      if (!parentAccepts(removedItem, removedItem.parent_id ?? null, newItems)) {
        dragOverIndex = -1;
        return;
      }

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

    // Before the re-render, not after: `onDataChange` triggers the reorder and
    // its flip animation, and any drag styling still set at that moment rides
    // along with it.
    resetDragState();
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

  <div class={listClass} bind:this={listEl}>
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
      {@const reach = rowReach[node.id]}
      {@const reachTop = reach?.top ?? DEFAULT_REACH_PX}
      {@const reachBottom = reach?.bottom ?? DEFAULT_REACH_PX}
      <div
        class="relative transition-all duration-200"
        class:opacity-60={draggedId === node.id}
        data-drag-item
        data-item-id={node.id}
        role="button"
        tabindex="0"
        aria-label={m.blocks_drop_zone_item({ index: index + 1 })}
        ondragover={(e) => handleDragOver(e, index)}
        ondragleave={handleDragLeave}
        ondrop={(e) => handleDrop(e, index)}
        style={nestable && indentNested ? `margin-left: ${depth * INDENT_PX}px;` : ''}
      >
        <!-- Rows are laid out with a gap between them, and that gap belonged to
             nothing: no `dragover` fired over it, so the indicator froze at a
             stale position, and a drop there hit no target and was silently
             discarded. It is also exactly where the indicator is drawn, which
             made it the natural place to aim.

             The gap is claimed by an overlay rather than by padding the row,
             because the row's layout box has to stay exactly as it is —
             `space-y-4` here, but `grid gap-4` in the blocks editor, where
             stretching the box would eat the gap instead of covering it. It
             exists only mid-drag, so it never intercepts an ordinary click. -->
        {#if isDragging}
          <div
            class="absolute inset-x-0 z-20"
            style="top: -{reachTop}px; bottom: -{reachBottom}px;"
            role="button"
            tabindex="-1"
            aria-label={m.blocks_drop_zone_item({ index: index + 1 })}
            ondragover={(e) => handleDragOver(e, index)}
            ondragleave={handleDragLeave}
            ondrop={(e) => handleDrop(e, index)}
          ></div>
        {/if}

        <!-- Drop zone indicators -->
        {#if dragOverIndex === index && draggedIndex !== -1 && draggedIndex !== index}
          {#if dropPosition === 'before' && index > 0}
            <!-- Centred in the gap above: this and the previous row's trailing
                 line describe the same insertion point, so they have to land on
                 the same pixel. Fixed offsets put them ~5px apart, and a 1px
                 pointer move flipped between them — one line that looked like
                 two. -->
            <div
              class="absolute right-0 left-0 z-10 mx-4 rounded bg-blue-500 transition-all duration-200"
              style="height: 4px; top: -{reachTop + 2}px;"
            ></div>
          {:else if dropPosition === 'after'}
            <!-- Where rows are indented, the line outdents by whole indent steps
                 so its left edge reads as the level it will land at. Where depth
                 is containment instead, it steps outside the box entirely. `mx-4`
                 is 16px, added back because an inline margin replaces it. -->
            <div
              class="absolute right-0 left-0 z-10 mx-4 rounded bg-blue-500 transition-all duration-200"
              style={outdentBar
                ? `height: 4px; bottom: -${outdentBar.bottom}px; margin-left: -${outdentBar.left}px; margin-right: -${outdentBar.left}px;`
                : `height: 4px; bottom: -${reachBottom + 2}px;${
                    dropDepth === null || !indentNested
                      ? ''
                      : ` margin-left: ${INDENT_PX + (dropDepth - depth) * INDENT_PX}px;`
                  }`}
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
            <div class={groupOuterClass ? groupOuterClass(node) : ''} data-drag-group={node.id}>
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
