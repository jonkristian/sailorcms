<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Plus } from '@lucide/svelte';
  import { toast } from '$sailor/core/ui/toast';
  import { invalidateAll } from '$app/navigation';
  import EditModal from './EditModal.svelte';
  import { Blocks, type FlatItem } from '$lib/components/sailor/dnd';
  import DraggableCard from '$lib/components/sailor/DraggableCard.svelte';
  import { generateUUID } from '$sailor/core/utils/common';
  import { reorderGlobalItems, deleteGlobalItem } from '../data.remote.js';

  const {
    global,
    items,
    exposeAddFunction,
    formData = $bindable(),
    permissions
  } = $props<{
    global: any;
    items: any[];
    exposeAddFunction?: (fn: () => void) => void;
    formData: Record<string, any>;
    permissions: {
      globals: {
        create: boolean;
        update: boolean;
        delete: boolean;
        view: boolean;
      };
    };
  }>();

  // Expose the handleAddNew function to parent if requested
  if (exposeAddFunction) {
    exposeAddFunction(handleAddNew);
  }

  // Modal state
  let isModalOpen = $state(false);
  let editingItem = $state<any>(null);
  let isNewItem = $state(false);

  // Use local state for flatItems to manage updates properly
  let flatItems = $state<FlatItem[]>([]);
  let lastDragSaveTime = $state(0);
  let previousItemsLength = $state(0);

  // Reactive permission checks
  let canDelete = $derived(permissions.globals.delete);
  let canCreate = $derived(permissions.globals.create);

  // Initialize and sync flatItems from items prop
  $effect(() => {
    const currentItemsLength = items.length;
    const timeSinceLastDragSave = Date.now() - lastDragSaveTime;

    // Always sync if items count changed (new item added/deleted) or enough time has passed since drag save
    const shouldSync = currentItemsLength !== previousItemsLength || timeSinceLastDragSave > 500;

    if (shouldSync) {
      flatItems = items.map((item: any) => ({
        id: item.id,
        name: item.name || item.title || 'Untitled',
        description: item.description || '',
        status: item.status || 'active',
        parent_id: item.parent_id || null,
        // Preserve all other properties
        ...item
      }));
      previousItemsLength = currentItemsLength;
    }
  });

  // Handle data changes from DragDrop component
  async function handleDataChange(updatedData: FlatItem[]) {
    try {
      // Update local state immediately for responsive UI
      flatItems = updatedData;

      // Check for any changes (parent or order) against original items
      const hasChanges = updatedData.some((updatedItem, index) => {
        const originalItem = items.find((item: any) => item.id === updatedItem.id);
        if (!originalItem) return false;

        // Check for parent changes
        if (originalItem.parent_id !== updatedItem.parent_id) return true;

        // Check for order changes (compare with original index)
        const originalIndex = items.findIndex((item: any) => item.id === updatedItem.id);
        if (originalIndex !== index) return true;

        return false;
      });

      if (hasChanges) {
        // Save to server
        const result = await reorderGlobalItems({
          globalSlug: global.slug,
          items: updatedData.map((item) => ({
            id: item.id,
            parent_id: item.parent_id
          }))
        });

        if (result.success) {
          toast.success('Items updated successfully');
          lastDragSaveTime = Date.now();
          // Manual invalidation needed because we use "unchecked" command mode
          setTimeout(async () => {
            await invalidateAll();
          }, 1000);
        } else {
          toast.error(result.error || 'Failed to update items');
          // Revert local changes on failure
          flatItems = items.map((item: any) => ({
            id: item.id,
            name: item.name || item.title || 'Untitled',
            description: item.description || '',
            status: item.status || 'active',
            parent_id: item.parent_id || null,
            ...item
          }));
        }
      }
    } catch (error) {
      toast.error('Failed to update items');
      // Revert local changes on error
      flatItems = items.map((item: any) => ({
        id: item.id,
        name: item.name || item.title || 'Untitled',
        description: item.description || '',
        status: item.status || 'active',
        parent_id: item.parent_id || null,
        ...item
      }));
    }
  }

  // Handle delete item
  async function handleDelete(itemId: string) {
    try {
      const result = await deleteGlobalItem({
        globalSlug: global.slug,
        itemId: itemId
      });

      if (result.success) {
        toast.success('Item deleted successfully');
        // Refresh the page data to reflect the changes
        await invalidateAll();
      } else {
        toast.error(result.error || 'Failed to delete item');
      }
    } catch (error) {
      toast.error('Failed to delete item');
    }
  }

  // Handle bulk delete (without individual confirmations)
  async function handleBulkDelete(itemIds: string[]) {
    try {
      // Delete each item without individual confirmations
      for (const itemId of itemIds) {
        const result = await deleteGlobalItem({
          globalSlug: global.slug,
          itemId: itemId
        });

        if (!result.success) {
          throw new Error(result.error || 'Failed to delete item');
        }
      }

      toast.success(`${itemIds.length} item(s) deleted successfully`);
      // Refresh the page data to reflect the changes
      await invalidateAll();
    } catch (error) {
      toast.error('Failed to delete some items');
    }
  }

  // Close modal
  function closeModal() {
    isModalOpen = false;
    editingItem = null;
    isNewItem = false;
  }

  // Handle add new item
  function handleAddNew() {
    isNewItem = true;
    editingItem = { id: generateUUID() };

    // Initialize form data with defaults
    Object.keys(global.fields).forEach((key) => {
      if (key === 'status') {
        formData[key] = 'active';
      } else {
        formData[key] = '';
      }
    });

    isModalOpen = true;
  }

  // Handle edit item
  function handleEdit(node: any) {
    const item = items.find((item: any) => item.id === node.id);
    if (!item) return;

    isNewItem = false;
    editingItem = item;

    // Populate form data with item data
    Object.keys(global.fields).forEach((key) => {
      formData[key] = item[key] || '';
    });

    isModalOpen = true;
  }

  // Handle form data changes
  function handleFormDataChange(key: string, value: any) {
    formData[key] = value;
  }
</script>

<div class="space-y-4">
  {#if items.length === 0}
    <div class="flex flex-col items-center justify-center py-12 text-center">
      <h3 class="mb-2 text-lg font-medium">No {global.name.plural.toLowerCase()} yet</h3>
      <p class="text-muted-foreground mb-6 max-w-md">
        Get started by creating your first {global.name.singular.toLowerCase()}
      </p>
      {#if canCreate}
        <Button onclick={handleAddNew}>
          <Plus class="mr-2 h-4 w-4" />
          Add {global.name.singular}
        </Button>
      {:else}
        <p class="text-muted-foreground text-sm">You don't have permission to create new items</p>
      {/if}
    </div>
  {:else}
    <Blocks
      data={flatItems}
      nestable={true}
      showSelection={true}
      onDataChange={handleDataChange}
      onRemove={handleDelete}
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
          onRemove={canDelete ? () => handleDelete(node.id) : undefined}
          showRemove={canDelete}
          dragAttributes={dragHandleAttributes}
          {isDragging}
          {showSelection}
          {isSelected}
          {onSelectNode}
        >
          {#snippet children()}
            <div class="p-4 text-center">
              <Button onclick={() => handleEdit(node)} variant="outline">
                Edit {global.name.singular}
              </Button>
            </div>
          {/snippet}
        </DraggableCard>
      {/snippet}
    </Blocks>
  {/if}
</div>

<!-- Modal for editing nestable globals -->
<EditModal
  {global}
  {formData}
  isOpen={isModalOpen}
  {isNewItem}
  {editingItem}
  onClose={closeModal}
  onFormDataChange={handleFormDataChange}
/>
