<script lang="ts">
  import { Button } from 'sailorcms/components/ui/button/index.js';
  import NestedList from 'sailorcms/components/sailor/dnd/NestedList.svelte';
  import type { FlatItem } from 'sailorcms/components/sailor/dnd/types.ts';
  import ArrayFieldModal from './ArrayFieldModal.svelte';
  import DraggableCard from 'sailorcms/components/sailor/DraggableCard.svelte';
  import { Plus } from '@lucide/svelte';
  import { m } from '$sailor/i18n';

  const {
    label,
    items = [],
    itemSchema,
    onChange,
    onReorder,
    globalSlug,
    fieldName,
    required = false,
    nestable = false
  }: {
    label?: string;
    items: any[];
    itemSchema: Record<string, any>;
    onChange: (items: any[]) => void;
    onReorder?: (items: any[]) => Promise<void>;
    globalSlug?: string;
    fieldName?: string;
    required?: boolean;
    nestable?: boolean;
  } = $props();

  let modalOpen = $state(false);
  let editingItem: any = $state(null);
  let editingIndex = $state(-1);

  function generateId(): string {
    // Use browser's crypto API
    return crypto.randomUUID();
  }

  function addItem() {
    // Create a new item with proper ID and default values based on schema
    const newItem: any = {
      id: generateId()
    };

    // Add default values based on schema
    if (itemSchema.properties) {
      Object.entries(itemSchema.properties).forEach(([key, prop]: [string, any]) => {
        if (prop.type === 'string') {
          newItem[key] = '';
        } else if (prop.type === 'number') {
          newItem[key] = 0;
        } else if (prop.type === 'boolean') {
          newItem[key] = false;
        } else if (prop.type === 'array') {
          newItem[key] = [];
        } else if (prop.type === 'object') {
          newItem[key] = {};
        }
      });
    }

    onChange([...(items || []), newItem]);
  }

  // Convert items to flat data format for Blocks
  function getFlatData(): FlatItem[] {
    return (items || []).map((item: any, index: number) => {
      // Try to find a good display name from common fields. The wildcard
      // fallback walks the item's own string values but EXCLUDES `id`,
      // any *_id foreign keys, and well-known system fields — otherwise a
      // brand-new row's id or parent-fk UUID surfaces as the row's display
      // label (e.g. '5a2038f1-...' from `global_id` on a fresh menu item).
      const SKIP_DISPLAY_KEYS = new Set(['id', 'sort', 'created_at', 'updated_at', 'status']);
      const isSystemKey = (k: string) =>
        SKIP_DISPLAY_KEYS.has(k) || k.endsWith('_id') || k === 'locale';
      const displayName =
        item.title ||
        item.name ||
        item.label ||
        item.heading ||
        item.text ||
        item.content ||
        item.description ||
        (item && typeof item === 'object'
          ? Object.entries(item)
              .filter(([k]) => !isSystemKey(k))
              .map(([, v]) => v)
          : []
        ).find((val: any) => typeof val === 'string' && val.length > 0) ||
        `Item ${index + 1}`;

      return {
        id: item.id || `item-${index}`,
        name: displayName,
        description: item.description,
        status: item.status || 'active',
        parent_id: nestable ? item.parent_id || null : null,
        // Include all original item data
        ...item
      };
    });
  }

  // Handle drag and drop data changes
  async function handleDataChange(updatedData: any[]) {
    // If we have reorder function and required props, use immediate reordering
    if (onReorder && globalSlug && fieldName) {
      const reorderData = updatedData.map((item) => ({
        id: item.id,
        parent_id: item.parent_id || null
      }));
      await onReorder(reorderData);
    } else {
      // Fallback to standard onChange
      onChange(updatedData);
    }
  }

  // Handle edit for drag and drop - open modal
  function handleEdit(node: any) {
    const index = items.findIndex(
      (item: any) => (item.id || `item-${items.indexOf(item)}`) === node.id
    );
    if (index !== -1) {
      editingItem = { ...items[index] };
      editingIndex = index;
      modalOpen = true;
    }
  }

  // Handle remove for drag and drop - from Blocks component
  function handleRemove(nodeId: string) {
    handleDelete(nodeId);
  }

  // Handle delete for drag and drop
  function handleDelete(nodeId: string) {
    const index = items.findIndex(
      (item: any) => (item.id || `item-${items.indexOf(item)}`) === nodeId
    );
    if (index !== -1) {
      const newItems = [...items];
      newItems.splice(index, 1);
      onChange(newItems);
    }
  }

  // Handle bulk delete for drag and drop
  function handleBulkDelete(nodeIds: string[]) {
    const newItems = items.filter(
      (item: any) => !nodeIds.includes(item.id || `item-${items.indexOf(item)}`)
    );
    onChange(newItems);
  }

  // Handle modal save
  function handleModalSave(updatedItem: any) {
    const newItems = [...items];
    newItems[editingIndex] = updatedItem;
    onChange(newItems);
  }

  // Handle modal close
  function handleModalClose() {
    modalOpen = false;
    editingItem = null;
    editingIndex = -1;
  }
</script>

<div class="space-y-3">
  {#if items.length > 0}
    <NestedList
      data={getFlatData()}
      {nestable}
      showSelection={true}
      onDataChange={handleDataChange}
      onRemove={handleRemove}
      onBulkDelete={handleBulkDelete}
    >
      {#snippet children({
        node,
        handleDelete,
        dragHandleAttributes,
        isDragging,
        showSelection,
        isSelected,
        onSelectNode
      }: {
        node: {
          id: string;
          name: string;
          description?: string;
          status?: string;
          [key: string]: any;
        };
        handleDelete: (nodeId: string) => void;
        dragHandleAttributes: {
          draggable: string;
          ondragstart: (e: DragEvent) => void;
          ondragend: (e: DragEvent) => void;
          style: string;
        };
        isDragging: boolean;
        showSelection: boolean;
        isSelected: boolean;
        onSelectNode: (checked: boolean) => void;
      })}
        <DraggableCard
          title={node.name}
          subtitle={node.description}
          open={false}
          onEdit={() => handleEdit(node)}
          onRemove={() => handleDelete(node.id)}
          dragAttributes={dragHandleAttributes}
          {isDragging}
          {showSelection}
          {isSelected}
          {onSelectNode}
        >
          {#snippet children()}
            <div class="p-4 text-center">
              <Button onclick={() => handleEdit(node)} variant="outline"
                >{m.array_edit_item()}</Button
              >
            </div>
          {/snippet}
        </DraggableCard>
      {/snippet}
    </NestedList>
  {/if}

  <Button type="button" variant="outline" size="sm" onclick={addItem}>
    <Plus class="mr-2 h-4 w-4" />
    {m.array_add_item()}
  </Button>
</div>

{#if editingItem && editingIndex >= 0}
  <ArrayFieldModal
    isOpen={modalOpen}
    item={editingItem}
    {itemSchema}
    onSave={handleModalSave}
    onClose={handleModalClose}
    itemIndex={editingIndex}
  />
{/if}
