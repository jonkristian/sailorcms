<script lang="ts">
  import FieldRenderer from 'sailorcms/components/sailor/fields/FieldRenderer.svelte';
  import { toast, requirePermission } from 'sailorcms/core/ui/toast';
  import { m } from '$sailor/i18n';
  import { pluralize } from '$sailor/utils/ui/text';
  import { invalidateAll } from '$app/navigation';
  import { generateUUID } from 'sailorcms/core/utils/common';
  import Blocks from 'sailorcms/components/sailor/dnd/Blocks.svelte';
  import type { FlatItem } from 'sailorcms/components/sailor/dnd/types.ts';
  import { getDisplayTitle } from 'sailorcms/core/content/display';
  import { getCurrentTimestamp } from 'sailorcms/core/utils/date';
  import DraggableCard from 'sailorcms/components/sailor/DraggableCard.svelte';
  import { Button } from '$lib/components/ui/button';
  import { SvelteSet } from 'svelte/reactivity';
  import { bulkUpdateGlobalItems, deleteGlobalItem } from '../data.remote.js';

  let {
    global,
    items = [],
    addFn = $bindable<(() => void) | null>(null),
    saveFn = $bindable<(() => Promise<void>) | null>(null),
    expandCollapseFn = $bindable<((expand: boolean) => void) | null>(null),
    permissions
  }: {
    global: any;
    items: any[];
    submitting: boolean;
    addFn?: (() => void) | null;
    saveFn?: (() => Promise<void>) | null;
    expandCollapseFn?: ((expand: boolean) => void) | null;
    permissions: {
      globals: {
        create: boolean;
        update: boolean;
        delete: boolean;
        view: boolean;
      };
    };
  } = $props();

  // Use permissions passed from layout
  let canDelete = $derived(permissions.globals.delete);
  let canUpdate = $derived(permissions.globals.update);
  let canCreate = $derived(permissions.globals.create);

  let localItems: FlatItem[] = $derived(
    items.map((item: Record<string, any>) => ({
      ...item,
      name: getDisplayTitle(item, global)
    })) as FlatItem[]
  );
  let expandedItems: SvelteSet<string> = $state(new SvelteSet());

  // Generate form fields based on global definition (excluding core fields except title)
  const getFormFields = (global: any) => {
    return Object.entries(global.fields)
      .filter(([key, field]: [string, any]) => !field.core || key === 'title')
      .map(([key, field]: [string, any]) => ({ key, field }));
  };

  let formFields = $derived(getFormFields(global));

  // Expand/collapse all items
  function expandCollapseAll(expand: boolean) {
    if (expand) {
      expandedItems = new SvelteSet(localItems.map((item) => item.id));
    } else {
      expandedItems = new SvelteSet();
    }
  }

  addFn = addItem;
  saveFn = saveAllItems;
  expandCollapseFn = expandCollapseAll;

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
    if (!requirePermission(canDelete, m.toast_perm_delete_items)) return;

    try {
      for (const nodeId of nodeIds) {
        const item = localItems.find((item) => item.id === nodeId);
        if (!item) continue;

        const isOnServer = items.some((i: any) => i.id === item.id);
        if (isOnServer) {
          const result = await deleteGlobalItem({
            globalSlug: global.slug,
            itemId: item.id
          });

          if (!result.success) {
            throw new Error(result.error || m.toast_delete_item_failed());
          }
        }

        localItems = localItems.filter((item) => item.id !== nodeId);
        expandedItems.delete(nodeId);
      }

      toast.success(
        m.toast_items_deleted_count({
          count: nodeIds.length,
          items: pluralize(nodeIds.length, m.common_item_singular(), m.common_item_plural())
        })
      );
      await invalidateAll();
    } catch (error) {
      console.error('Error deleting items:', error);
      toast.error(m.toast_delete_some_items_failed());
    }
  }

  // Add new item
  function addItem() {
    if (!requirePermission(canCreate, m.toast_perm_create_items)) return;

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

    localItems = [...localItems, newItem];
    expandedItems.add(newItem.id);
  }

  // Handle item deletion from Blocks component
  async function handleDeleteItem(nodeId: string) {
    if (!requirePermission(canDelete, m.toast_perm_delete_items)) return;

    const item = localItems.find((item) => item.id === nodeId);
    if (!item) return;

    // The item is "saved" if it exists on the server-loaded items prop —
    // ignore the id shape (legacy rows persisted with temp- prefixes).
    const isOnServer = items.some((i: any) => i.id === item.id);

    try {
      if (isOnServer) {
        const result = await deleteGlobalItem({
          globalSlug: global.slug,
          itemId: item.id
        });

        if (!result.success) {
          throw new Error(result.error || m.toast_delete_item_failed());
        }
      }

      localItems = localItems.filter((item) => item.id !== nodeId);
      expandedItems.delete(nodeId);
      expandedItems = new SvelteSet(expandedItems);

      toast.success(m.toast_item_deleted());
      await invalidateAll();
    } catch (error) {
      console.error('Error deleting item:', error);
      toast.error(m.toast_delete_item_failed());
    }
  }

  function handleFieldChange(itemIndex: number, fieldKey: string, value: any) {
    const titleField = global?.options?.titleField;
    localItems = localItems.map((item, i) => {
      if (i !== itemIndex) return item;
      const updated: FlatItem = {
        ...item,
        [fieldKey]: value,
        updated_at: getCurrentTimestamp()
      };
      if (fieldKey === titleField) {
        updated.name = getDisplayTitle(updated, global);
      }
      return updated;
    });
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
    if (!requirePermission(canUpdate, m.toast_perm_save_items)) return;

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
        toast.success(m.toast_all_items_saved());
        await invalidateAll();
      } else {
        throw new Error(result.error || m.toast_save_items_failed());
      }
    } catch (error) {
      console.error('Error saving items:', error);
      toast.error(m.toast_save_items_failed());
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
