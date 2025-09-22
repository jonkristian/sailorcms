<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Blocks } from '$lib/components/sailor/dnd';
  import type { FlatItem } from '$lib/components/sailor/dnd';
  import ArrayFieldModal from './ArrayFieldModal.svelte';
  import DraggableCard from '$lib/components/sailor/DraggableCard.svelte';
  import { Plus } from '@lucide/svelte';

  const {
    label,
    items = [],
    itemSchema,
    onChange,
    nestable = false
  } = $props<{
    label?: string;
    items: any[];
    itemSchema: Record<string, any>;
    onChange: (items: any[]) => void;
    nestable?: boolean;
  }>();

  let modalOpen = $state(false);
  let editingItem = $state<any>(null);
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
      // Try to find a good display name from common fields
      const displayName =
        item.title ||
        item.name ||
        item.label ||
        item.heading ||
        item.text ||
        item.content ||
        item.description ||
        Object.values(item).find((val: any) => typeof val === 'string' && val.length > 0) ||
        `Item ${index + 1}`;

      return {
        id: item.id || `item-${index}`,
        name: displayName,
        description: item.description,
        status: item.status || 'active',
        parent_id: nestable ? item.parent_id || null : null,
        // Only include the original item fields, not the extra display fields
        ...Object.fromEntries(
          Object.entries(item).filter(
            ([key]) => !['id', 'name', 'description', 'status', 'parent_id'].includes(key)
          )
        )
      };
    });
  }

  // Handle drag and drop data changes
  function handleDataChange(updatedData: any[]) {
    // Convert the flat data back to the original item format
    const convertedItems = updatedData.map((flatItem: any) => {
      // Just pass through all the original fields, no filtering needed
      const originalItem: any = {
        id: flatItem.id
      };

      // Add back all the original fields
      Object.entries(flatItem).forEach(([key, value]) => {
        if (key !== 'id') {
          // Only exclude id since we already set it
          originalItem[key] = value;
        }
      });

      return originalItem;
    });

    onChange(convertedItems);
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
    <Blocks
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
              <Button onclick={() => handleEdit(node)} variant="outline">Edit Item</Button>
            </div>
          {/snippet}
        </DraggableCard>
      {/snippet}
    </Blocks>
  {/if}

  <Button type="button" variant="outline" size="sm" onclick={addItem}>
    <Plus class="mr-2 h-4 w-4" />
    Add Item
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
