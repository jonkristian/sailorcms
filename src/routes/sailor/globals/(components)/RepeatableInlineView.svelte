<script lang="ts">
  import FieldRenderer from '$lib/components/sailor/fields/FieldRenderer.svelte';
  import { toast } from '$sailor/core/ui/toast';
  import { invalidateAll } from '$app/navigation';
  import { generateUUID } from '$sailor/core/utils/common';
  import { Blocks } from '$lib/components/sailor/dnd';
  import type { FlatItem } from '$lib/components/sailor/dnd';
  import { getDisplayTitle } from '$lib/sailor/core/content/display';
  import { getCurrentTimestamp } from '$sailor/core/utils/date';
  import DraggableCard from '$lib/components/sailor/DraggableCard.svelte';
  import { Button } from '$lib/components/ui/button';
  import { SvelteSet } from 'svelte/reactivity';
  import { bulkUpdateGlobalItems, deleteGlobalItem } from '../data.remote.js';

  const {
    global,
    items = [],
    exposeAddFunction,
    exposeSaveFunction,
    exposeExpandCollapseFunction,
    permissions
  } = $props<{
    global: any;
    items: any[];
    submitting: boolean;
    exposeAddFunction?: (fn: () => void) => void;
    exposeSaveFunction?: (fn: () => Promise<void>) => void;
    exposeExpandCollapseFunction?: (fn: (expand: boolean) => void) => void;
    permissions: {
      globals: {
        create: boolean;
        update: boolean;
        delete: boolean;
        view: boolean;
      };
    };
  }>();

  // Use permissions passed from layout
  let canDelete = $derived(permissions.globals.delete);
  let canUpdate = $derived(permissions.globals.update);
  let canCreate = $derived(permissions.globals.create);

  // Convert items to FlatItem format for the DnD system
  let localItems = $state<FlatItem[]>(
    items.map((item: Record<string, any>) => ({
      ...item,
      name: getDisplayTitle(item, global)
    }))
  );
  let expandedItems = $state<SvelteSet<string>>(new SvelteSet());

  // Generate form fields based on global definition (excluding core fields except title)
  const getFormFields = (global: any) => {
    return Object.entries(global.fields)
      .filter(([key, field]: [string, any]) => !field.core || key === 'title')
      .map(([key, field]: [string, any]) => ({ key, field }));
  };

  const formFields = getFormFields(global);

  // Expand/collapse all items
  function expandCollapseAll(expand: boolean) {
    if (expand) {
      expandedItems = new SvelteSet(localItems.map((item) => item.id));
    } else {
      expandedItems = new SvelteSet();
    }
  }

  // Expose functions to parent
  if (exposeAddFunction) {
    exposeAddFunction(addItem);
  }
  if (exposeSaveFunction) {
    exposeSaveFunction(saveAllItems);
  }
  if (exposeExpandCollapseFunction) {
    exposeExpandCollapseFunction(expandCollapseAll);
  }

  // Handle data changes from the Blocks component
  function handleDataChange(updatedData: FlatItem[]) {
    localItems = updatedData;
  }

  // Handle item removal from Blocks component
  function handleRemoveItem(nodeId: string) {
    handleDeleteItem(nodeId);
  }

  // Handle bulk delete from Blocks component
  async function handleBulkDelete(nodeIds: string[]) {
    if (!canDelete) {
      toast.error('You do not have permission to delete items');
      return;
    }

    try {
      // Delete each item without showing individual toasts
      for (const nodeId of nodeIds) {
        const item = localItems.find((item) => item.id === nodeId);
        if (!item) continue;

        // Only delete from server if item has been saved (has a real ID, not just local)
        if (item.id && item.created_at && !item.id.startsWith('temp-')) {
          const result = await deleteGlobalItem({
            globalSlug: global.slug,
            itemId: item.id
          });

          if (!result.success) {
            throw new Error(result.error || 'Failed to delete item from server');
          }
        }

        // Remove from local state
        localItems = localItems.filter((item) => item.id !== nodeId);
        expandedItems.delete(nodeId);
      }

      // expandedItems already updated with .delete() above - no need for reassignment
      toast.success(`${nodeIds.length} item(s) deleted successfully`);
    } catch (error) {
      console.error('Error deleting items:', error);
      toast.error('Failed to delete some items');
    }
  }

  // Add new item
  function addItem() {
    if (!canCreate) {
      toast.error('You do not have permission to create new items');
      return;
    }

    const newItem: FlatItem = {
      id: `temp-${generateUUID()}`,
      sort: localItems.length,
      created_at: null, // Don't set created_at until saved
      updated_at: getCurrentTimestamp()
    };

    // Initialize ALL fields (both core and custom) with default values
    Object.entries(global.fields).forEach(([key, field]: [string, any]) => {
      if (field.default !== undefined) {
        newItem[key] = field.default;
      } else if (field.type === 'array') {
        newItem[key] = [];
      } else if (key === 'title') {
        // For title field, provide a meaningful default
        newItem[key] = `New ${global.name.singular}`;
      } else if (key === 'slug') {
        // For slug field, generate from title
        newItem[key] = `new-${global.name.singular.toLowerCase()}-${Date.now()}`;
      } else if (key === 'status') {
        // Default status
        newItem[key] = 'draft';
      } else {
        newItem[key] = '';
      }
    });

    // Set the display name using the utility function
    newItem.name = getDisplayTitle(newItem, global);

    // Add the new item to the list first
    localItems.push(newItem);

    // Ensure the new item is expanded by default
    expandedItems.add(newItem.id);
  }

  // Handle item deletion from Blocks component
  async function handleDeleteItem(nodeId: string) {
    if (!canDelete) {
      toast.error('You do not have permission to delete items');
      return;
    }

    const item = localItems.find((item) => item.id === nodeId);
    if (!item) return;

    try {
      // Only delete from server if item has been saved (has a real ID, not just local)
      if (item.id && item.created_at && !item.id.startsWith('temp-')) {
        const result = await deleteGlobalItem({
          globalSlug: global.slug,
          itemId: item.id
        });

        if (!result.success) {
          throw new Error(result.error || 'Failed to delete item from server');
        }
      }

      // Remove from local state
      localItems = localItems.filter((item) => item.id !== nodeId);
      expandedItems.delete(nodeId);
      expandedItems = new SvelteSet(expandedItems);

      toast.success('Item deleted successfully');
    } catch (error) {
      console.error('Error deleting item:', error);
      toast.error('Failed to delete item');
    }
  }

  // Handle field changes
  function handleFieldChange(itemIndex: number, fieldKey: string, value: any) {
    localItems[itemIndex][fieldKey] = value;
    localItems[itemIndex].updated_at = getCurrentTimestamp();

    // Update the name field if the titleField changes (for DnD component display)
    const titleField = global?.options?.titleField;
    if (fieldKey === titleField) {
      localItems[itemIndex].name = getDisplayTitle(localItems[itemIndex], global);
    }
  }

  // Toggle item expansion
  function toggleExpanded(itemId: string) {
    if (expandedItems.has(itemId)) {
      expandedItems.delete(itemId);
    } else {
      expandedItems.add(itemId);
    }
    expandedItems = new SvelteSet(expandedItems);
  }

  // Get title value for slug generation
  function getTitleValue(item: any, fieldKey: string) {
    if (fieldKey === 'slug' && item.title) {
      return item.title;
    }
    return null;
  }

  // Save all items
  async function saveAllItems() {
    if (!canUpdate) {
      toast.error('You do not have permission to save items');
      return;
    }

    try {
      // Prepare items with proper sort order, excluding the name field
      const itemsToSave = localItems.map((item, index) => {
        const { name, ...itemWithoutName } = item;
        return {
          ...itemWithoutName,
          sort: index,
          updated_at: getCurrentTimestamp()
        };
      });

      const result = await bulkUpdateGlobalItems({
        globalSlug: global.slug,
        items: itemsToSave
      });

      if (result.success) {
        toast.success('All items saved successfully');
        await invalidateAll();
      } else {
        throw new Error(result.error || 'Failed to save items');
      }
    } catch (error) {
      console.error('Error saving items:', error);
      toast.error('Failed to save items');
    }
  }
</script>

<div class="relative pt-2">
  <Blocks
    data={localItems}
    showSelection={canDelete}
    onDataChange={handleDataChange}
    onRemove={canDelete ? handleRemoveItem : undefined}
    onBulkDelete={canDelete ? handleBulkDelete : undefined}
  >
    {#snippet extraControls()}
      <Button variant="ghost" size="sm" onclick={() => expandCollapseAll(expandedItems.size === 0)}>
        {expandedItems.size === 0 ? 'Expand All' : 'Collapse All'}
      </Button>
    {/snippet}
    {#snippet children({
      node,
      handleDelete,
      dragHandleAttributes,
      isDragging = false,
      showSelection = false,
      isSelected = false,
      onSelectNode
    }: {
      node: FlatItem;
      handleDelete: (id: string) => void;
      dragHandleAttributes: Record<string, any>;
      isDragging?: boolean;
      showSelection?: boolean;
      isSelected?: boolean;
      onSelectNode?: (checked: boolean) => void;
    })}
      {@const item = node}
      {@const actualIndex = localItems.findIndex((i) => i.id === item.id)}

      <DraggableCard
        title={getDisplayTitle(item, global)}
        open={expandedItems.has(item.id)}
        onToggle={() => toggleExpanded(item.id)}
        onRemove={canDelete ? () => handleDelete(item.id) : undefined}
        showRemove={canDelete}
        dragAttributes={dragHandleAttributes}
        {isDragging}
        {showSelection}
        {isSelected}
        {onSelectNode}
        tags={localItems[actualIndex]?.tags || []}
        featured={item.featured || false}
      >
        {#snippet children()}
          {#each formFields as { key, field }}
            <FieldRenderer
              {field}
              value={localItems[actualIndex]?.[key]}
              fieldKey={key}
              titleValue={getTitleValue(localItems[actualIndex], key)}
              currentItemId={item.id}
              entityType="global_{global.slug}"
              readonly={!canUpdate}
              onChange={(value) => handleFieldChange(actualIndex, key, value)}
            />
          {/each}
        {/snippet}
      </DraggableCard>
    {/snippet}
  </Blocks>
</div>
