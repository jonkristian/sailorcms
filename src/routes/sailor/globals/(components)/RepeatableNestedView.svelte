<script lang="ts">
  import { Button } from 'sailorcms/components/ui/button/index.js';
  import { Plus } from '@lucide/svelte';
  import { toast, toastResult } from 'sailorcms/core/ui/toast';
  import { m } from '$sailor/i18n';
  import { pluralize } from 'sailorcms/utils/ui/text';
  import { invalidateAll } from '$app/navigation';
  import EditModal from './EditModal.svelte';
  import Blocks from 'sailorcms/components/sailor/dnd/Blocks.svelte';
  import type { FlatItem } from 'sailorcms/components/sailor/dnd/types.ts';
  import DraggableCard from 'sailorcms/components/sailor/DraggableCard.svelte';
  import { relationBadges } from 'sailorcms/core/ui/relation-badge';
  import { generateUUID } from 'sailorcms/core/utils/common';
  import { reorderGlobalItems, deleteGlobalItem } from '../data.remote.js';

  let {
    global,
    items,
    addFn = $bindable<(() => void) | null>(null),
    formData = $bindable(),
    permissions
  }: {
    global: any;
    items: any[];
    addFn?: (() => void) | null;
    formData: Record<string, any>;
    permissions: {
      globals: {
        create: boolean;
        update: boolean;
        delete: boolean;
        view: boolean;
      };
    };
  } = $props();

  addFn = handleAddNew;

  // Modal state
  let isModalOpen = $state(false);
  let editingItem: any = $state(null);
  let isNewItem = $state(false);

  // Reactive permission checks
  let canDelete = $derived(permissions.globals.delete);
  let canCreate = $derived(permissions.globals.create);

  // Flat-tree view of `items`. The drag-drop handler optimistically reorders
  // before invalidateAll lands, so we layer an optional override on top of
  // the derived base: when `optimisticItems` is non-null it wins, otherwise
  // we fall back to the prop-derived list. Clearing the override after the
  // save completes is what hands control back to fresh server data.
  function toFlatItems(source: any[]): FlatItem[] {
    return source.map((item: any) => ({
      id: item.id,
      name: item.name || item.title || 'Untitled',
      description: item.description || '',
      status: item.status || 'active',
      parent_id: item.parent_id || null,
      ...item
    }));
  }
  let flatItemsBase = $derived(toFlatItems(items));
  let optimisticItems: FlatItem[] | null = $state(null);
  let flatItems: FlatItem[] = $derived(optimisticItems ?? flatItemsBase);

  // Handle data changes from DragDrop component
  async function handleDataChange(updatedData: FlatItem[]) {
    try {
      // Optimistic local override for responsive UI; cleared on success
      // (so the derived snaps back to fresh props after invalidateAll) or
      // on failure (so the UI shows the server-side truth).
      optimisticItems = updatedData;

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
          setTimeout(async () => {
            await invalidateAll();
            optimisticItems = null;
          }, 1000);
        } else {
          toast.error(result.error || m.toast_update_items_failed());
          // Drop the optimistic override; derived reflects the unchanged prop.
          optimisticItems = null;
        }
      } else {
        optimisticItems = null;
      }
    } catch (error) {
      toast.error(m.toast_update_items_failed());
      // Drop the optimistic override on error.
      optimisticItems = null;
    }
  }

  // Handle delete item
  async function handleDelete(itemId: string) {
    try {
      const result = await deleteGlobalItem({
        globalSlug: global.slug,
        itemId: itemId
      });

      if (toastResult(result, m.toast_item_deleted, m.toast_delete_item_failed)) {
        // Refresh the page data to reflect the changes
        await invalidateAll();
      }
    } catch (error) {
      toast.error(m.toast_delete_item_failed());
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
          throw new Error(result.error || m.toast_delete_item_failed());
        }
      }

      toast.success(
        m.toast_items_deleted_count({
          count: itemIds.length,
          items: pluralize(itemIds.length, m.common_item_singular(), m.common_item_plural())
        })
      );
      // Refresh the page data to reflect the changes
      await invalidateAll();
    } catch (error) {
      toast.error(m.toast_delete_some_items_failed());
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

    // Initialize form data with each field's declared `default` first so any
    // template-level override (e.g. a custom select with its own default)
    // wins. Globals fall back to `'published'` for the core status — taxonomy
    // / list-style content is usually publishable on creation. Empty string
    // for any other field without a default.
    Object.entries(global.fields).forEach(([key, field]: [string, any]) => {
      if (field?.default !== undefined) {
        formData[key] = field.default;
      } else if (key === 'status') {
        formData[key] = 'published';
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
      <h3 class="mb-2 text-lg font-medium">
        {m.globals_table_empty_title({ plural: global.name.plural.toLowerCase() })}
      </h3>
      <p class="text-muted-foreground mb-6 max-w-md">
        {m.globals_table_empty_text({ singular: global.name.singular.toLowerCase() })}
      </p>
      {#if canCreate}
        <Button onclick={handleAddNew}>
          <Plus class="mr-2 h-4 w-4" />
          {m.globals_table_add_button({ label: global.name.singular })}
        </Button>
      {:else}
        <p class="text-muted-foreground text-sm">{m.globals_no_create_permission()}</p>
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
          badges={relationBadges(node, global.fields)}
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
