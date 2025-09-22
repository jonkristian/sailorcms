<script lang="ts">
  import { Checkbox } from '$lib/components/ui/checkbox';
  import { GripVertical, ChevronUp, ChevronDown, ChevronRight } from '@lucide/svelte';
  import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
  } from '$lib/components/ui/table';
  import type { Snippet } from 'svelte';

  interface Column {
    key: string;
    label: string;
    sortable?: boolean;
    hidden?: boolean;
    width?: number | string;
  }

  export interface Props {
    items: any[];
    columns: Column[];
    sortable?: boolean;
    selectable?: boolean;
    selectedItems?: string[];
    onSelect?: (id: string, selected: boolean) => void;
    onSelectAll?: (selected: boolean) => void;
    onReorder?: (newItems: any[]) => void;
    isDeleteDisabled?: (item: any) => boolean; // Function to check if delete should be disabled for this item
    empty?: Snippet; // Snippet for empty state
    // Column sorting props
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    onColumnSort?: (columnKey: string) => void;
    // Custom cell rendering
    cellRenderer?: Snippet<[any, Column]>; // Snippet for custom cell rendering: (item: any, column: Column) => any
    // Hierarchical props
    nestable?: boolean; // Enable hierarchical display
    onNestChange?: (draggedId: string, newParentId: string | null, newIndex: number) => void;
  }

  let {
    items,
    columns,
    sortable = false,
    selectable = false,
    selectedItems = [],
    onSelect,
    onSelectAll,
    onReorder,
    isDeleteDisabled,
    empty,
    sortBy,
    sortOrder,
    onColumnSort,
    cellRenderer,
    nestable = false,
    onNestChange
  }: Props = $props();

  // Drag and drop state
  let draggedIndex = $state<number>(-1);
  let dragOverIndex = $state<number>(-1);
  let isDragging = $state(false);
  let dropPosition = $state<'before' | 'after' | 'inside'>('after');

  // Hierarchical state
  let expandedItems = $state<Set<string>>(new Set());

  // Interface for hierarchical items
  interface HierarchicalItem {
    item: any;
    level: number;
    hasChildren: boolean;
    isExpanded: boolean;
    parentId: string | null;
    originalIndex?: number;
  }

  // Build hierarchical structure when nestable is enabled
  const hierarchicalItems = $derived((): HierarchicalItem[] => {
    if (!items || !Array.isArray(items)) {
      return [];
    }

    if (!nestable) {
      return items.map((item, index) => ({
        item,
        level: 0,
        hasChildren: false,
        isExpanded: false,
        parentId: null,
        originalIndex: index
      }));
    }

    // Build parent-child map
    const childrenMap = new Map<string, any[]>();
    const rootItems: any[] = [];

    items.forEach((item) => {
      const parentId = item.parent_id;
      if (parentId) {
        if (!childrenMap.has(parentId)) {
          childrenMap.set(parentId, []);
        }
        childrenMap.get(parentId)!.push(item);
      } else {
        rootItems.push(item);
      }
    });

    // Recursively build flat hierarchical structure
    const result: HierarchicalItem[] = [];

    function addItemsToResult(itemsToAdd: any[], level: number = 0) {
      // Sort items by their sort order before processing
      const sortedItems = [...itemsToAdd].sort((a, b) => (a.sort || 0) - (b.sort || 0));

      sortedItems.forEach((item) => {
        const children = childrenMap.get(item.id) || [];
        const hasChildren = children.length > 0;
        const isExpanded = expandedItems.has(item.id);

        result.push({
          item,
          level,
          hasChildren,
          isExpanded,
          parentId: item.parent_id || null,
          originalIndex: items.indexOf(item)
        });

        // Add children if expanded (children will be sorted recursively)
        if (hasChildren && isExpanded) {
          addItemsToResult(children, level + 1);
        }
      });
    }

    // Sort root items by sort order before processing
    const sortedRootItems = [...rootItems].sort((a, b) => (a.sort || 0) - (b.sort || 0));
    addItemsToResult(sortedRootItems);
    return result;
  });

  // Selection helpers
  const visibleItems = $derived(() => {
    const hierarchical = hierarchicalItems();
    return Array.isArray(hierarchical) ? hierarchical.map((h) => h.item) : [];
  });
  const isAllSelected = $derived(() => {
    const visible = visibleItems();
    return selectedItems.length === visible.length && visible.length > 0;
  });
  const isSomeSelected = $derived(() => {
    const visible = visibleItems();
    return selectedItems.length > 0 && selectedItems.length < visible.length;
  });

  // Toggle expand/collapse for an item
  function toggleExpanded(itemId: string) {
    if (expandedItems.has(itemId)) {
      expandedItems.delete(itemId);
    } else {
      expandedItems.add(itemId);
    }
    expandedItems = new Set(expandedItems);
  }

  // Drag handlers
  function handleDragStart(event: DragEvent, index: number) {
    if (!event.dataTransfer || !sortable) return;

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
    if (!sortable) return;

    event.preventDefault();
    event.dataTransfer!.dropEffect = 'move';

    if (draggedIndex !== -1 && draggedIndex !== index) {
      dragOverIndex = index;

      const target = event.currentTarget as HTMLElement;
      const rect = target.getBoundingClientRect();
      const mouseY = event.clientY - rect.top;
      const height = rect.height;

      if (nestable) {
        const hierarchicalArray = hierarchicalItems();
        const targetHierarchicalItem = hierarchicalArray[index];
        const draggedHierarchicalItem = hierarchicalArray[draggedIndex];

        // Prevent dropping an item into itself (but allow dropping into other items)
        const wouldCreateCycle =
          draggedHierarchicalItem &&
          targetHierarchicalItem.item.id === draggedHierarchicalItem.item.id;

        // Determine drop position based on mouse position and nesting capability
        if (mouseY < height * 0.3) {
          dropPosition = 'before';
        } else if (mouseY > height * 0.4 && mouseY < height * 0.9 && !wouldCreateCycle) {
          dropPosition = 'inside';
        } else {
          dropPosition = 'after';
        }
      } else {
        dropPosition = mouseY < height * 0.5 ? 'before' : 'after';
      }
    }
  }

  function handleDragLeave(event: DragEvent) {
    if (!sortable) return;

    const relatedTarget = event.relatedTarget as HTMLElement;
    const currentTarget = event.currentTarget as HTMLElement;

    if (!currentTarget.contains(relatedTarget)) {
      dragOverIndex = -1;
    }
  }

  function handleDrop(event: DragEvent, dropIndex: number) {
    if (!sortable) return;

    event.preventDefault();

    if (draggedIndex === -1) return;

    const hierarchicalArray = hierarchicalItems();

    if (nestable && onNestChange) {
      let newParentId: string | null = null;
      let newIndex = dropIndex;

      const draggedHierarchicalItem = hierarchicalArray[draggedIndex];
      const targetHierarchicalItem = hierarchicalArray[dropIndex];

      // Check if both items are top-level (simple reorder case)
      const draggedIsTopLevel = !draggedHierarchicalItem.item.parent_id;
      const targetIsTopLevel = !targetHierarchicalItem.item.parent_id;
      const isSimpleTopLevelReorder =
        draggedIsTopLevel && targetIsTopLevel && dropPosition !== 'inside';

      // Handle simple top-level reordering with onReorder instead of onNestChange
      if (isSimpleTopLevelReorder && onReorder) {
        const newItems = [...items];
        const [draggedItem] = newItems.splice(draggedIndex, 1);

        let insertIndex = dropIndex;
        if (dropPosition === 'after') {
          insertIndex = dropIndex + 1;
        }
        // Adjust for removal if dragged index was before insert position
        if (draggedIndex < insertIndex) {
          insertIndex--;
        }

        newItems.splice(insertIndex, 0, draggedItem);
        onReorder(newItems);
        return;
      }

      // Calculate new parent and sibling index using a more robust approach
      if (dropPosition === 'inside') {
        newParentId = targetHierarchicalItem.item.id;
        newIndex = 0; // First child
      } else {
        // For 'before' and 'after', use target's parent
        newParentId = targetHierarchicalItem.item.parent_id;

        // Get all actual siblings with the same parent_id from original items
        const siblings = items
          .filter(
            (item) => item.parent_id === newParentId && item.id !== draggedHierarchicalItem.item.id // Exclude dragged item
          )
          .sort((a, b) => (a.sort || 0) - (b.sort || 0));

        // Find target item's position among siblings
        const targetPosition = siblings.findIndex((s) => s.id === targetHierarchicalItem.item.id);

        if (dropPosition === 'before') {
          newIndex = Math.max(0, targetPosition);
        } else {
          // 'after'
          newIndex = targetPosition + 1;
        }
      }

      onNestChange(draggedHierarchicalItem.item.id, newParentId, newIndex);
    } else {
      // Fallback to simple reordering for non-nestable tables
      const hierarchicalArray = hierarchicalItems();
      if (draggedIndex >= hierarchicalArray.length || dropIndex >= hierarchicalArray.length) {
        return;
      }

      const draggedHierarchicalItem = hierarchicalArray[draggedIndex];
      const targetHierarchicalItem = hierarchicalArray[dropIndex];

      if (!draggedHierarchicalItem || !targetHierarchicalItem) {
        return;
      }

      // Find the actual indices in the original items array
      const draggedItemIndex = items.findIndex(
        (item) => item.id === draggedHierarchicalItem.item.id
      );
      const targetItemIndex = items.findIndex((item) => item.id === targetHierarchicalItem.item.id);

      if (draggedItemIndex === -1 || targetItemIndex === -1) {
        return;
      }

      const newItems = [...items];
      const [draggedItem] = newItems.splice(draggedItemIndex, 1);

      let insertIndex = targetItemIndex;
      if (dropPosition === 'after') {
        // Adjust target index after removal if needed
        insertIndex = draggedItemIndex < targetItemIndex ? targetItemIndex : targetItemIndex + 1;
      } else {
        // 'before'
        insertIndex = draggedItemIndex < targetItemIndex ? targetItemIndex - 1 : targetItemIndex;
      }

      // Ensure valid index bounds
      insertIndex = Math.max(0, Math.min(insertIndex, newItems.length));

      newItems.splice(insertIndex, 0, draggedItem);
      onReorder?.(newItems);
    }

    dragOverIndex = -1;
  }

  // Selection handlers
  function handleSelectAll(checked: boolean) {
    onSelectAll?.(checked);
  }

  function handleSelect(id: string, checked: boolean) {
    onSelect?.(id, checked);
  }

  function getDropIndicatorPosition(targetIndex: number): number {
    if (typeof document === 'undefined') return 0;

    try {
      const tableBody = document.querySelector('tbody');
      if (!tableBody) return 0;

      const rows = tableBody.querySelectorAll('tr');
      if (!rows[targetIndex]) return 0;

      const targetRow = rows[targetIndex];
      const rect = targetRow.getBoundingClientRect();
      const tableContainer = tableBody.closest('.relative');
      const tableRect = tableContainer?.getBoundingClientRect();

      if (!tableRect) return 0;

      const relativeTop = rect.top - tableRect.top;

      if (dropPosition === 'before') {
        return relativeTop - 2;
      } else if (dropPosition === 'inside') {
        return relativeTop; // Position at the start of the row
      } else {
        return relativeTop + rect.height - 2;
      }
    } catch {
      return 0;
    }
  }
</script>

<div class="relative overflow-hidden rounded-lg border">
  <!-- Drop indicator overlay -->
  {#if isDragging && dragOverIndex !== -1 && draggedIndex !== dragOverIndex && sortable}
    {#if dropPosition === 'inside'}
      <!-- Inside drop indicator - overlay on the target row -->
      <div
        class="pointer-events-none absolute inset-0 z-50"
        style="top: {getDropIndicatorPosition(dragOverIndex)}px; height: 48px;"
      >
        <div
          class="absolute inset-0 z-10 m-1 rounded border-2 border-blue-500 bg-blue-500/20 transition-all duration-200"
        ></div>
      </div>
    {:else}
      <!-- Before/After drop indicator - thin line -->
      <div
        class="pointer-events-none absolute right-0 left-0 z-50"
        style="top: {getDropIndicatorPosition(dragOverIndex)}px;"
      >
        <div class="rounded bg-blue-500 transition-all duration-200" style="height: 4px;"></div>
      </div>
    {/if}
  {/if}

  <Table>
    <TableHeader class="bg-muted sticky top-0 z-10">
      <TableRow>
        {#each columns as column, columnIndex}
          {#if !column.hidden}
            <TableHead
              class={columnIndex === 0 ? 'pl-4' : ''}
              style={column.width
                ? `width: ${typeof column.width === 'string' ? column.width : column.width + 'px'}; ${typeof column.width === 'number' ? `min-width: ${column.width}px; max-width: ${column.width}px;` : ''}`
                : ''}
            >
              {#if columnIndex === 0}
                <!-- First column header with controls spacing -->
                <div class="flex items-center gap-2">
                  {#if nestable}
                    <!-- Space for expand/collapse -->
                    <div class="w-4 flex-shrink-0"></div>
                  {/if}

                  {#if sortable}
                    <!-- Space for drag handle -->
                    <div class="w-4 flex-shrink-0"></div>
                  {/if}

                  <!-- Header label -->
                  {#if column.sortable && onColumnSort}
                    <button
                      type="button"
                      class="hover:text-foreground text-muted-foreground flex items-center gap-1 font-medium"
                      onclick={() => onColumnSort?.(column.key)}
                    >
                      {column.label}
                      {#if sortBy === column.key}
                        {#if sortOrder === 'asc'}
                          <ChevronUp class="h-4 w-4" />
                        {:else}
                          <ChevronDown class="h-4 w-4" />
                        {/if}
                      {/if}
                    </button>
                  {:else}
                    {column.label}
                  {/if}
                </div>
              {:else}
                <!-- Regular column header -->
                {#if column.sortable && onColumnSort}
                  <button
                    type="button"
                    class="hover:text-foreground text-muted-foreground flex items-center gap-1 font-medium"
                    onclick={() => onColumnSort?.(column.key)}
                  >
                    {column.label}
                    {#if sortBy === column.key}
                      {#if sortOrder === 'asc'}
                        <ChevronUp class="h-4 w-4" />
                      {:else}
                        <ChevronDown class="h-4 w-4" />
                      {/if}
                    {/if}
                  </button>
                {:else}
                  {column.label}
                {/if}
              {/if}
            </TableHead>
          {/if}
        {/each}
        {#if selectable}
          <TableHead class="w-8">
            <div class="flex w-full items-center justify-center pr-4">
              <Checkbox
                checked={isAllSelected()}
                indeterminate={isSomeSelected()}
                onCheckedChange={handleSelectAll}
                aria-label="Select all"
              />
            </div>
          </TableHead>
        {/if}
      </TableRow>
    </TableHeader>
    <TableBody>
      {#if hierarchicalItems().length > 0}
        {#each hierarchicalItems() as hierarchicalItem, index}
          {@const item = hierarchicalItem.item}
          <TableRow
            data-state={selectedItems.includes(item.id) ? 'selected' : ''}
            class={`${draggedIndex === index ? 'opacity-50' : ''}`}
            ondragover={(e) => sortable && handleDragOver(e, index)}
            ondragleave={(e) => sortable && handleDragLeave(e)}
            ondrop={(e) => sortable && handleDrop(e, index)}
          >
            {#each columns as column, columnIndex}
              {#if !column.hidden}
                <TableCell
                  class={`py-3 ${columnIndex === 0 ? 'pl-4' : ''}`}
                  style={column.width
                    ? `width: ${typeof column.width === 'string' ? column.width : column.width + 'px'}; ${typeof column.width === 'number' ? `min-width: ${column.width}px; max-width: ${column.width}px;` : ''}`
                    : ''}
                >
                  {#if columnIndex === 0}
                    <!-- First column with controls -->
                    <div
                      class="flex items-center gap-2"
                      style="padding-left: {nestable ? hierarchicalItem.level * 20 : 0}px;"
                    >
                      {#if nestable}
                        <!-- Expand/collapse control -->
                        <div class="flex w-4 flex-shrink-0 items-center justify-center">
                          {#if hierarchicalItem.hasChildren}
                            <button
                              type="button"
                              class="hover:bg-muted rounded p-0.5"
                              onclick={() => toggleExpanded(item.id)}
                            >
                              {#if hierarchicalItem.isExpanded}
                                <ChevronDown class="h-4 w-4" />
                              {:else}
                                <ChevronRight class="h-4 w-4" />
                              {/if}
                            </button>
                          {/if}
                        </div>
                      {/if}

                      {#if sortable}
                        <!-- Drag handle -->
                        <div class="flex w-4 flex-shrink-0 items-center justify-center">
                          <button
                            draggable="true"
                            ondragstart={(e) => handleDragStart(e, index)}
                            ondragend={handleDragEnd}
                            class="hover:bg-muted/50 cursor-grab rounded p-0.5 transition-colors hover:cursor-grabbing"
                          >
                            <GripVertical class="text-muted-foreground h-3.5 w-3.5" />
                            <span class="sr-only">Drag to reorder</span>
                          </button>
                        </div>
                      {/if}

                      <!-- Content -->
                      <div class="min-w-0 flex-1">
                        {#if cellRenderer}
                          {@render cellRenderer(item, column)}
                        {:else}
                          {item[column.key] ?? '-'}
                        {/if}
                      </div>
                    </div>
                  {:else}
                    <!-- Regular cell -->
                    {#if cellRenderer}
                      {@render cellRenderer(item, column)}
                    {:else}
                      {item[column.key] ?? '-'}
                    {/if}
                  {/if}
                </TableCell>
              {/if}
            {/each}
            {#if selectable}
              <TableCell class="py-3">
                <div class="flex w-full items-center justify-center pr-4">
                  <Checkbox
                    checked={selectedItems.includes(item.id)}
                    onCheckedChange={(checked) => handleSelect(item.id, checked)}
                    disabled={isDeleteDisabled?.(item)}
                    aria-label="Select row"
                  />
                </div>
              </TableCell>
            {/if}
          </TableRow>
        {/each}
      {:else}
        <TableRow>
          <TableCell colspan={columns.length + (selectable ? 1 : 0)} class="h-24 text-center">
            {#if empty}
              {@render empty()}
            {:else}
              <div class="text-center">
                <h3 class="text-sm font-medium">No results.</h3>
              </div>
            {/if}
          </TableCell>
        </TableRow>
      {/if}
    </TableBody>
  </Table>
</div>
