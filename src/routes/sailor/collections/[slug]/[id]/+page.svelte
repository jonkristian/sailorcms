<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Dialog, DialogContent, DialogHeader, DialogTitle } from '$lib/components/ui/dialog';
  import { Card, CardHeader, CardTitle, CardDescription } from '$lib/components/ui/card';
  import { Plus, ChevronDown, ChevronRight, Puzzle, Clock } from '@lucide/svelte';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import { toast } from '$sailor/core/ui/toast';
  import { Separator } from '$lib/components/ui/separator';
  import FieldRenderer from '$lib/components/sailor/fields/FieldRenderer.svelte';
  import DraggableCard from '$lib/components/sailor/DraggableCard.svelte';
  import { addBlock, updateBlockContent, removeBlock } from '$sailor/core/content/blocks';
  import { Blocks } from '$lib/components/sailor/dnd';
  import SEOFields from '$lib/components/sailor/SEOFields.svelte';
  import RevisionsDialog from '$lib/components/sailor/RevisionsDialog.svelte';
  import OverlayLoader from '$lib/components/sailor/OverlayLoader.svelte';
  import { headerRevisions } from '$sailor/core/ui/header-revisions.svelte';
  import type { FlatItem } from '$lib/components/sailor/dnd/types';
  import { saveCollectionItem } from './data.remote';
  import { restoreCollectionItem } from '../../data.remote.js';
  import { invalidateAll } from '$app/navigation';
  import { AlertTriangle, RotateCcw } from '@lucide/svelte';
  import { formatRelativeTime } from '$sailor/core/utils/date';
  import { getUserLocale } from '$sailor/core/ui/user-locale';
  import { getDisplayTitle } from '$lib/sailor/core/content/display';
  import { SvelteMap, SvelteSet } from 'svelte/reactivity';
  import { useUnsavedChanges } from '$sailor/core/hooks/unsaved-changes.svelte';
  import { untrack } from 'svelte';

  const { data } = $props();

  const unsavedChanges = useUnsavedChanges(
    () => Object.keys(userChanges).length > 0 || blocksChanged
  );

  function buildFormData(page: any): Record<string, any> {
    return {
      ...(page || {}),
      title: page?.title || '',
      slug: page?.slug || '',
      status: page?.status || 'draft',
      meta_title: page?.meta_title || '',
      meta_description: page?.meta_description || ''
    };
  }

  // Reshape the load function's `data.page.blocks` (server-side shape with
  // `data` / `relations` / `fileRelations` split out) into the UI shape the
  // form components consume (`{ id, blockType, content, sort, blockSchema }`).
  // Used at component init *and* after a revision restore, when we re-init
  // the local state from a freshly-invalidated load.
  function buildBlocksFromPage(page: any): any[] {
    return (page?.blocks || []).map((block: any) => {
      const blockData = block.data;
      const blockSchema = block.blockSchema;
      const content: Record<string, any> = {};

      Object.keys(blockData).forEach((key) => {
        if (!['id', 'collection_id', 'created_at', 'updated_at', 'sort'].includes(key)) {
          content[key] = blockData[key];
        }
      });

      if (block.relations && block.relations.length > 0) {
        const arrayField = Object.entries(blockSchema.fields).find(
          ([_, field]) => (field as any).type === 'array'
        );
        if (arrayField) {
          const [fieldName, fieldDef] = arrayField;
          const typedFieldDef = fieldDef as any;
          content[fieldName] = block.relations.map((item: any) => {
            const processedItem = { ...item };
            if (typedFieldDef.items?.properties) {
              Object.entries(typedFieldDef.items.properties).forEach(
                ([itemFieldName, itemFieldDef]) => {
                  const t = itemFieldDef as any;
                  if (t.type === 'file' && processedItem[itemFieldName]) {
                    if (
                      typeof processedItem[itemFieldName] === 'object' &&
                      processedItem[itemFieldName].id
                    ) {
                      processedItem[itemFieldName] = processedItem[itemFieldName].id;
                    }
                  }
                }
              );
            }
            return processedItem;
          });
        }
      }

      if (block.fileRelations) {
        Object.entries(block.fileRelations).forEach(([fieldName, fileIds]) => {
          content[fieldName] = fileIds as string[];
        });
      }

      return {
        id: block.id,
        blockType: block.blockType,
        content,
        sort: blockData.sort,
        blockSchema
      };
    });
  }

  let formData: Record<string, any> = $state(untrack(() => buildFormData(data.page)));

  let submitting = $state(false);

  // Revisions: shown when the collection template opts in via options.revisions.
  // New (unsaved) items have no history yet, so the button is hidden until the
  // first save assigns an ID.
  const revisionsEnabled = $derived(
    !data.isNewItem && Boolean((data.collectionType as any)?.options?.revisions)
  );
  let revisionsDialogOpen = $state(false);

  // Publish a "history" handler to the admin layout's HeaderRevisionsButton so
  // the icon appears next to PayloadPreview. Page owns the dialog + restore
  // (because they touch local form state); layout just owns the button. $effect
  // is appropriate here because we're subscribing an external module-level
  // store to this page's lifecycle — clearing on unmount and re-publishing
  // when revision count changes.
  $effect(() => {
    if (revisionsEnabled) {
      headerRevisions.set(() => (revisionsDialogOpen = true), data.revisions?.length ?? 0);
    } else {
      headerRevisions.clear();
    }
    return () => headerRevisions.clear();
  });

  // Restore re-runs the existing save command with the snapshot's payload as
  // formData (same code path as a normal save: search-index, new revision row,
  // pruning all happen automatically). Restore is one of the few ops that
  // *wants* to overwrite local edit state with the server's truth, so after
  // `invalidateAll()` we explicitly re-init `formData` / `blocks` from the
  // refreshed `data.page` — bypassing the `untrack(...)` guard that normally
  // keeps in-progress edits safe from background data refreshes.
  async function handleRestoreRevision(snapshot: Record<string, unknown>): Promise<boolean | void> {
    if (submitting) return false;
    submitting = true;
    try {
      const result = await saveCollectionItem({
        collectionSlug: data.slug,
        itemId: data.page.id,
        formData: snapshot as Record<string, any>
      });
      if (!result.success) {
        toast.error(result.error || 'Failed to restore revision');
        return false;
      }
      await invalidateAll();
      formData = buildFormData(data.page);
      blocks = buildBlocksFromPage(data.page);
      userChanges = {};
      blocksChanged = false;
      toast.success('Revision restored');
      return true;
    } catch (err) {
      console.error('Restore error', err);
      toast.error('Failed to restore revision');
      return false;
    } finally {
      submitting = false;
    }
  }

  // Soft-deleted item opened directly via its URL: surface a banner so editors
  // realise it's in recovery and can restore in one click.
  const isInRecovery = $derived(!data.isNewItem && !!data.page?.deleted_at);

  async function handleRestoreFromBanner() {
    try {
      const result = await restoreCollectionItem({
        collectionSlug: data.slug,
        itemId: data.page.id
      });
      if (result.success) {
        toast.success(result.message || 'Item restored');
        await invalidateAll();
      } else {
        toast.error(result.error || 'Failed to restore item');
      }
    } catch {
      toast.error('Failed to restore item');
    }
  }

  // Form submission handler using remote function
  async function handleSave() {
    if (submitting) return;

    submitting = true;
    try {
      // Prepare form data
      const formPayload: Record<string, any> = {
        ...formData,
        blocks: blocks.map((block: any) => ({
          id: block.id,
          blockType: block.blockType,
          sort: block.sort,
          content: block.content
        }))
      };

      // Add SEO fields if SEO is enabled
      if (data.collectionType?.options?.seo) {
        const pageTitle = formData.title || '';
        const pageSlug = formData.slug || '';
        const canonicalUrl = data.siteUrl && pageSlug ? `${data.siteUrl}/${pageSlug}` : '';
        const autoValues: Record<string, any> = {
          meta_title: pageTitle,
          meta_description: formData.excerpt || '',
          og_title: pageTitle,
          og_description: formData.excerpt || '',
          canonical_url: canonicalUrl,
          og_image: '',
          noindex: false
        };

        // Add SEO fields to formPayload
        Object.entries(autoValues).forEach(([key, autoValue]) => {
          const userValue = formData[key];
          let finalValue =
            userValue !== null && userValue !== undefined && userValue !== ''
              ? userValue
              : autoValue;

          formPayload[key] = finalValue;
        });
      }

      // Call remote function
      const result = await saveCollectionItem({
        collectionSlug: data.slug,
        itemId: data.page.id,
        formData: formPayload
      });

      if (result.success) {
        const wasNew = data.isNewItem;
        if (wasNew) {
          toast.success('Collection created successfully', { id: 'collection-save' });
        } else {
          toast.success('Collection saved successfully', { id: 'collection-save' });
        }
        userChanges = {};
        blocksChanged = false;

        if (wasNew) {
          // First save of a new item — re-run the load once so headerActions
          // ("Create" → "Save") and isNewItem flip correctly.
          await invalidateAll();
        } else if (result.item) {
          // Subsequent edits: merge server-side mutations onto formData.
          // result.item is the flat row only — file/array/block fields live
          // in their own tables and stay as-is.
          formData = { ...formData, ...result.item };
          if (result.tags) {
            for (const [key, fieldDef] of Object.entries(data.collectionType?.fields || {})) {
              if ((fieldDef as any).type === 'tags') {
                formData[key] = result.tags;
              }
            }
          }
          // Refresh server-loaded auxiliaries (most importantly `data.revisions`,
          // so the History dialog includes this save). The form's local
          // `formData`/`blocks` state is initialized with `untrack(...)` so it
          // won't be clobbered by the data refresh.
          void invalidateAll();
        }
      } else {
        toast.error(result.error || 'Failed to save collection', { id: 'collection-save' });
      }
    } catch (error) {
      console.error('Save error:', error);
      toast.error('Failed to save collection', { id: 'collection-save' });
    } finally {
      submitting = false;
    }
  }

  let showBlockSelector = $state(false);
  let blockStates = $state(new Map<string, boolean>()); // For collapsible state
  let selectedBlocks: Set<string> = $state(new Set()); // For selection state

  // svelte-ignore state_referenced_locally
  let blocks = $state(untrack(() => buildBlocksFromPage(data.page)));

  // Initialize available blocks from data
  let availableBlocks = $derived(data.availableBlocks || []);

  // Create drag-and-drop data
  let dragDropData = $derived(
    (blocks || []).map((block: any) => ({
      id: block.id,
      name:
        availableBlocks?.find((b: { slug: string; name: string }) => b.slug === block.blockType)
          ?.name || block.blockType,
      description: block.content?.title || '',
      sort: block.sort,
      blockType: block.blockType,
      content: block.content
    }))
  );

  // Track form changes for unsaved changes warning
  let userChanges: Record<string, any> = $state({});
  let blocksChanged = $state(false);

  // Handle title changes (no longer auto-generates slug)
  function handleTitleChange(newTitle: string) {
    formData.title = newTitle;
    userChanges.title = newTitle;
  }

  function handleAddBlock(blockType: string) {
    const blockTypeConfig = availableBlocks.find(
      (b: { slug: string; fields: unknown }) => b.slug === blockType
    );

    if (!blockTypeConfig?.fields) {
      console.error('No schema found for block type:', blockType);
      return;
    }

    const newBlocks = addBlock(blocks, blockType, blockTypeConfig);
    blocks = [...newBlocks.map((block) => ({ ...block, blockSchema: blockTypeConfig.fields }))];
    blocksChanged = true;
    showBlockSelector = false;
  }

  function handleUpdateBlockContent(id: string, content: Record<string, unknown>) {
    const updatedBlocks = updateBlockContent(blocks, id, content);
    blocks = [
      ...updatedBlocks.map((block) => ({
        ...block,
        blockSchema:
          (block as any).blockSchema ||
          availableBlocks.find((b) => b.slug === block.blockType)?.fields
      }))
    ];
    blocksChanged = true;
  }

  function handleRemoveBlock(id: string) {
    const updatedBlocks = removeBlock(blocks, id);
    blocks = [
      ...updatedBlocks.map((block) => ({
        ...block,
        blockSchema:
          (block as any).blockSchema ||
          availableBlocks.find((b) => b.slug === block.blockType)?.fields
      }))
    ];
    blocksChanged = true;
  }

  function handleBulkDeleteBlocks(ids: string[]) {
    blocks = blocks.filter((block: any) => !ids.includes(block.id));
    blocksChanged = true;
  }

  // Selection handlers
  function handleSelectAll(checked: boolean) {
    if (checked) {
      selectedBlocks = new Set(blocks.map((block: any) => block.id));
    } else {
      selectedBlocks = new Set();
    }
  }

  function handleSelectBlock(blockId: string, checked: boolean) {
    const newSelectedBlocks = new SvelteSet(selectedBlocks);
    if (checked) {
      newSelectedBlocks.add(blockId);
    } else {
      newSelectedBlocks.delete(blockId);
    }
    selectedBlocks = newSelectedBlocks;
  }

  function handleBulkDeleteSelectedBlocks() {
    if (selectedBlocks.size === 0) return;

    const selectedBlockIds = Array.from(selectedBlocks);
    const selectedBlockNames = selectedBlockIds
      .map((id) => {
        const block = blocks.find((b: any) => b.id === id);
        const blockTemplate = availableBlocks.find(
          (b: { slug: string; name: string }) => b.slug === block?.blockType
        );
        return blockTemplate?.name || block?.blockType || 'Untitled';
      })
      .join(', ');

    if (
      confirm(
        `Are you sure you want to delete ${selectedBlocks.size} block(s)?\n\n${selectedBlockNames}`
      )
    ) {
      handleBulkDeleteBlocks(selectedBlockIds);
      selectedBlocks = new Set(); // Clear selection after bulk delete
    }
  }

  // Derived states for selection
  let allSelected = $derived(blocks.length > 0 && selectedBlocks.size === blocks.length);
  let someSelected = $derived(selectedBlocks.size > 0 && selectedBlocks.size < blocks.length);

  function toggleBlockCollapse(id: string) {
    blockStates.set(id, !blockStates.get(id));
  }

  // Handle drag and drop data changes
  function handleDragDropDataChange(updatedData: FlatItem[]) {
    // Update blocks with new order
    const updatedBlocks = updatedData.map((item, index) => {
      const originalBlock = blocks.find((b: any) => b.id === item.id);
      return {
        ...originalBlock,
        sort: index
      };
    });

    // Update local state immediately for responsive UI
    blocks = updatedBlocks.map((block) => ({
      id: block.id!,
      blockType: block.blockType!,
      content: block.content || {},
      sort: block.sort!,
      blockSchema:
        (block as any).blockSchema ||
        availableBlocks.find((b) => b.slug === block.blockType)?.fields
    }));
    blocksChanged = true;
  }

  // Split fields by UI position using Svelte 5 runes
  const mainFields = $derived(
    Object.entries(data.collectionType?.fields || {})
      .filter(([fieldName, fieldConfig]) => {
        const config = fieldConfig as Record<string, any>;
        return fieldName !== 'blocks' && config.position === 'main' && !config.hidden;
      })
      .sort(([, a], [, b]) => {
        const aOrder = (a as any).order || 0;
        const bOrder = (b as any).order || 0;
        return aOrder - bOrder;
      })
  );

  const sidebarFields = $derived(
    Object.entries(data.collectionType?.fields || {})
      .filter(([fieldName, fieldConfig]) => {
        const config = fieldConfig as Record<string, any>;
        // Exclude SEO fields as they're handled by the SEO component
        const seoFields = [
          'meta_title',
          'meta_description',
          'og_title',
          'og_description',
          'og_image',
          'canonical_url',
          'noindex'
        ];
        return (
          fieldName !== 'blocks' &&
          !seoFields.includes(fieldName) &&
          (!config.position || config.position === 'sidebar') &&
          !config.hidden
        );
      })
      .sort(([, a], [, b]) => {
        const aOrder = (a as any).order || 0;
        const bOrder = (b as any).order || 0;
        return aOrder - bOrder;
      })
  );

  // Get all fields (including hidden ones) for form submission
  const allFields = $derived(
    Object.entries(data.collectionType?.fields || {}).filter(
      ([fieldName]) => fieldName !== 'blocks'
    )
  );
</script>

<svelte:head>
  <title
    >{data.isNewItem ? 'Create' : 'Edit'} {data.collectionType.name.singular} - Sailor CMS</title
  >
</svelte:head>

<OverlayLoader>
  <div class="flex gap-6 px-6">
    <!-- Main Content Area -->
    <div class="flex flex-1 flex-col">
      {#if isInRecovery}
        <div
          class="mt-4 mb-2 flex items-center justify-between gap-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
        >
          <div class="flex items-center gap-2">
            <AlertTriangle class="size-4 shrink-0" />
            <span>This item is in recovery. Restore it to bring it back to the collection.</span>
          </div>
          <Button variant="outline" size="sm" onclick={handleRestoreFromBanner}>
            <RotateCcw class="mr-1 size-3.5" />
            Restore
          </Button>
        </div>
      {/if}
      {#if revisionsEnabled && revisionsDialogOpen}
        <RevisionsDialog
          revisions={(data.revisions ?? []) as any}
          onClose={() => (revisionsDialogOpen = false)}
          onRestore={handleRestoreRevision}
        />
      {/if}
      {#if data.hasBlocks}
        <!-- Main Fields Section (for blocks-enabled collections) -->
        {#if mainFields.length > 0}
          <div class="mb-6 pt-4">
            <div class="space-y-6">
              {#each mainFields as [fieldName, fieldConfig]}
                {@const config = fieldConfig as Record<string, any>}
                <div class="space-y-2">
                  <FieldRenderer
                    field={config}
                    value={formData[fieldName]}
                    fieldKey={fieldName}
                    titleValue={fieldName === 'slug' ? formData.title : null}
                    variant="main"
                    entityType="collection_{data.slug}"
                    onChange={(value) => {
                      if (fieldName === 'title') {
                        handleTitleChange(value);
                      } else {
                        formData[fieldName] = value;
                        userChanges[fieldName] = value;
                      }
                    }}
                  />
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Sticky Header - Always visible -->
        <div class="bg-background sticky top-[var(--header-height)] z-30 mb-4 border-b pt-4 pb-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <div class="flex items-center gap-2">
                <span class="text-xl font-medium">Blocks</span>
                <Button
                  type="button"
                  variant="default"
                  size="icon"
                  class="h-6 w-6 rounded-full"
                  onclick={() => (showBlockSelector = true)}
                >
                  <Plus class="h-3 w-3" />
                </Button>
              </div>
            </div>
            {#if blocks.length > 0}
              <div class="flex items-center gap-2">
                <!-- Selection info -->
                {#if selectedBlocks.size > 0}
                  <span class="text-muted-foreground text-sm">
                    {selectedBlocks.size} of {blocks.length} selected
                  </span>
                {:else}
                  <span class="text-muted-foreground text-sm"
                    >{blocks.length} block{blocks.length !== 1 ? 's' : ''}</span
                  >
                {/if}

                <!-- Delete Selected Button -->
                {#if selectedBlocks.size > 0}
                  <Button variant="destructive" size="sm" onclick={handleBulkDeleteSelectedBlocks}>
                    Delete Selected ({selectedBlocks.size})
                  </Button>
                {/if}

                <!-- Select All Button -->
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
                      onclick={(e: Event) => e.stopPropagation()}
                    />
                  </div>
                  <span class="text-sm font-medium">Select All</span>
                </Button>

                <!-- Expand/Collapse Button -->
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onclick={() => {
                    const allExpanded = blocks.every(
                      (block: any) => blockStates.get(block.id) !== false
                    );
                    const newStates = new SvelteMap(blockStates);
                    blocks.forEach((block: any) => {
                      newStates.set(block.id, !allExpanded);
                    });
                    blockStates = newStates;
                  }}
                >
                  {#if blocks.every((block: any) => blockStates.get(block.id) !== false)}
                    <ChevronDown class="h-4 w-4" />
                    Collapse
                  {:else}
                    <ChevronRight class="h-4 w-4" />
                    Expand
                  {/if}
                </Button>
              </div>
            {/if}
          </div>
        </div>

        <!-- Blocks Area -->
        <div class="flex-1">
          <div class="pt-2">
            {#if blocks.length > 0}
              <Blocks
                data={dragDropData}
                onDataChange={handleDragDropDataChange}
                onRemove={handleRemoveBlock}
                onBulkDelete={handleBulkDeleteBlocks}
                showSelection={true}
              >
                {#snippet children({
                  node,
                  handleDelete,
                  dragHandleAttributes,
                  isDragging = false
                }: {
                  node: any;
                  handleDelete: (id: string) => void;
                  dragHandleAttributes: Record<string, any>;
                  isDragging?: boolean;
                })}
                  {@const item = dragDropData.find((item: FlatItem) => item.id === node.id)}
                  {@const blockTemplate = availableBlocks.find(
                    (b: { slug: string; name: string }) => b.slug === item?.blockType
                  )}
                  <DraggableCard
                    title={blockTemplate?.name || item?.blockType}
                    subtitle={getDisplayTitle(item?.content || {}, blockTemplate || {})}
                    open={blockStates.get(item?.id || '') ?? true}
                    onToggle={() => toggleBlockCollapse(item?.id || '')}
                    onRemove={() => handleDelete(item?.id || '')}
                    dragAttributes={dragHandleAttributes}
                    {isDragging}
                    showSelection={true}
                    isSelected={selectedBlocks.has(item?.id || '')}
                    onSelectNode={(checked) => handleSelectBlock(item?.id || '', checked)}
                  >
                    {#snippet children()}
                      {#if availableBlocks.find((b: { slug: string; fields: unknown }) => b.slug === item?.blockType)?.fields}
                        {@const blockSchema = availableBlocks.find(
                          (b: { slug: string; fields: unknown }) => b.slug === item?.blockType
                        )?.fields}
                        <div class="space-y-6">
                          {#each Object.entries(blockSchema || {}) as [fieldKey, fieldConfig]}
                            {@const config = fieldConfig as Record<string, any>}
                            {#if !config.hidden}
                              <FieldRenderer
                                field={config}
                                value={item?.content[fieldKey]}
                                {fieldKey}
                                titleValue={fieldKey === 'slug' ? formData.title : null}
                                entityType="collection_{data.slug}"
                                onChange={(value) => {
                                  const newContent = { ...item?.content, [fieldKey]: value };
                                  handleUpdateBlockContent(item?.id || '', newContent);
                                }}
                              />
                            {/if}
                          {/each}
                        </div>
                      {:else}
                        <p class="text-muted-foreground text-sm">
                          No fields available for this block type.
                        </p>
                      {/if}
                    {/snippet}
                  </DraggableCard>
                {/snippet}
              </Blocks>
            {:else}
              <!-- Empty state when no blocks -->
              <div class="flex flex-col items-center justify-center py-12 text-center">
                <Puzzle class="text-muted-foreground mb-4 h-12 w-12" />
                <h3 class="mb-2 text-lg font-medium">No blocks yet</h3>
                <p class="text-muted-foreground mb-4">
                  Add your first block to start building your content
                </p>
                <Button type="button" variant="default" onclick={() => (showBlockSelector = true)}>
                  <Plus class="mr-2 h-4 w-4" />
                  Add Block
                </Button>
              </div>
            {/if}
          </div>

          <!-- SEO Fields Section (for blocks-enabled collections) -->
          {#if data.collectionType?.options?.seo}
            <div class="bg-muted/30 -mx-4 mt-6 border-t px-4 pt-3 pb-3">
              <SEOFields
                {formData}
                entityType="collection_{data.slug}"
                titleValue={formData.title}
                onChange={(field, value) => {
                  formData[field] = value;
                  userChanges[field] = value;
                }}
              />
            </div>
          {/if}
        </div>
      {:else}
        <!-- Main Fields Section for collections without blocks -->
        {#if mainFields.length > 0}
          <div class="flex-1">
            <div class="pt-4">
              <div class="space-y-6">
                {#each mainFields as [fieldName, fieldConfig]}
                  {@const config = fieldConfig as Record<string, any>}
                  <div class="space-y-2">
                    <FieldRenderer
                      field={config}
                      value={formData[fieldName]}
                      fieldKey={fieldName}
                      titleValue={fieldName === 'slug' ? formData.title : null}
                      variant="main"
                      entityType="collection_{data.slug}"
                      onChange={(value) => {
                        if (fieldName === 'title') {
                          handleTitleChange(value);
                        } else {
                          formData[fieldName] = value;
                          userChanges[fieldName] = value;
                        }
                      }}
                    />
                  </div>
                {/each}
              </div>
            </div>

            <!-- SEO Fields Section (for collections without blocks) -->
            {#if data.collectionType?.options?.seo}
              <div class="bg-muted/30 -mx-4 mt-6 border-t px-4 pt-3 pb-3">
                <SEOFields
                  {formData}
                  entityType="collection_{data.slug}"
                  titleValue={formData.title}
                  onChange={(field, value) => {
                    formData[field] = value;
                    userChanges[field] = value;
                  }}
                />
              </div>
            {/if}
          </div>
        {:else}
          <!-- No main fields - show a message -->
          <div class="flex items-center justify-center py-12">
            <div class="text-center">
              <Puzzle class="text-muted-foreground mx-auto mb-4 h-12 w-12" />
              <h3 class="mb-2 text-lg font-medium">No main fields</h3>
              <p class="text-muted-foreground">
                This collection doesn't have any main fields. Use the sidebar to edit content.
              </p>
            </div>
          </div>
        {/if}
      {/if}
    </div>

    <!-- Right Sidebar -->
    <div
      class="bg-background sticky top-[var(--header-height)] h-[calc(100vh-var(--header-height))] w-80 border-l"
    >
      <div class="h-full overflow-y-auto p-4 pt-4">
        <form
          id="collection-form"
          onsubmit={(e) => {
            e.preventDefault();
            handleSave();
          }}
          class="space-y-6"
        >
          <div class="space-y-4">
            <!-- Render sidebar fields -->
            {#each sidebarFields as [fieldName, fieldConfig]}
              {@const config = fieldConfig as Record<string, any>}
              <div class="space-y-2">
                <FieldRenderer
                  field={config}
                  value={formData[fieldName]}
                  fieldKey={fieldName}
                  titleValue={fieldName === 'slug' ? formData.title : null}
                  entityType="collection_{data.slug}"
                  onChange={(value) => {
                    if (fieldName === 'title') {
                      handleTitleChange(value);
                    } else {
                      formData[fieldName] = value;
                      userChanges[fieldName] = value;
                    }
                  }}
                />
                <!-- Hidden input for field data -->
                <input
                  type="hidden"
                  name={fieldName}
                  value={config.type === 'tags' || typeof formData[fieldName] === 'object'
                    ? JSON.stringify(formData[fieldName] || [])
                    : formData[fieldName] || ''}
                />
              </div>
            {/each}
          </div>

          <!-- Hidden inputs for all fields (including hidden and main fields) -->
          {#each allFields as [fieldName, fieldConfig]}
            {@const config = fieldConfig as Record<string, any>}
            {#if config.hidden || !sidebarFields.some(([name]) => name === fieldName)}
              <input
                type="hidden"
                name={fieldName}
                value={config.type === 'tags' || typeof formData[fieldName] === 'object'
                  ? JSON.stringify(formData[fieldName] || [])
                  : formData[fieldName] || ''}
              />
            {/if}
          {/each}

          <!-- Hidden fields for blocks data -->
          <input
            type="hidden"
            name="blocks"
            value={JSON.stringify(
              blocks.map((block: any) => ({
                id: block.id,
                blockType: block.blockType,
                content: block.content,
                sort: block.sort
              }))
            )}
          />

          <!-- Hidden inputs for SEO fields if SEO is enabled -->
          {#if data.collectionType?.options?.seo}
            {@const seoFields = [
              'meta_title',
              'meta_description',
              'og_title',
              'og_description',
              'og_image',
              'canonical_url',
              'noindex'
            ]}
            {#each seoFields as seoField}
              {@const effectiveValue = (() => {
                const pageTitle = formData.title || '';
                const pageSlug = formData.slug || '';
                const canonicalUrl = data.siteUrl && pageSlug ? `${data.siteUrl}/${pageSlug}` : '';
                const autoValues: Record<string, any> = {
                  meta_title: pageTitle,
                  meta_description: formData.excerpt || '',
                  og_title: pageTitle,
                  og_description: formData.excerpt || '',
                  canonical_url: canonicalUrl,
                  og_image: '',
                  noindex: false
                };
                const userValue = formData[seoField];
                const autoValue = autoValues[seoField];
                return userValue !== null && userValue !== undefined && userValue !== ''
                  ? userValue
                  : autoValue;
              })()}
              <input
                type="hidden"
                name={seoField}
                value={typeof effectiveValue === 'object'
                  ? JSON.stringify(effectiveValue || '')
                  : effectiveValue || ''}
              />
            {/each}
          {/if}

          <Separator />

          <div class="space-y-3">
            {#if data.page?.created_at}
              <div class="flex items-center gap-2 overflow-hidden text-xs whitespace-nowrap">
                <Clock class="text-muted-foreground h-3 w-3 flex-shrink-0" />
                <div class="text-muted-foreground flex min-w-0 items-center gap-1">
                  <span>Created</span>
                  <span class="text-foreground">
                    {formatRelativeTime(data.page.created_at, getUserLocale())}
                  </span>
                  {#if data.page?.author_name || data.page?.author_email}
                    <span>by</span>
                    <span class="text-foreground truncate font-medium">
                      {data.page.author_name || data.page.author_email}
                    </span>
                  {/if}
                </div>
              </div>
            {/if}

            {#if data.page?.updated_at && data.page?.created_at && new Date(data.page.updated_at).getTime() !== new Date(data.page.created_at).getTime()}
              <div class="flex items-center gap-2 overflow-hidden text-xs whitespace-nowrap">
                <Clock class="text-muted-foreground h-3 w-3 flex-shrink-0" />
                <div class="text-muted-foreground flex min-w-0 items-center gap-1">
                  <span>Updated</span>
                  <span class="text-foreground">
                    {formatRelativeTime(data.page.updated_at, getUserLocale())}
                  </span>
                  {#if (data.page?.last_modified_by_name || data.page?.last_modified_by_email) && data.page.last_modified_by !== data.page.author}
                    <span>by</span>
                    <span class="text-foreground truncate font-medium">
                      {data.page.last_modified_by_name || data.page.last_modified_by_email}
                    </span>
                  {/if}
                </div>
              </div>
            {/if}
          </div>
        </form>
      </div>
    </div>
  </div>
</OverlayLoader>

<Dialog bind:open={showBlockSelector}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Add Block</DialogTitle>
    </DialogHeader>
    <div class="grid max-h-96 gap-2 overflow-y-auto py-2">
      {#each availableBlocks as blockType}
        <button
          type="button"
          class="bg-input-bg border-input hover:bg-accent flex flex-col items-start gap-1 rounded-lg border px-3 py-2.5 text-left transition-colors"
          onclick={() => handleAddBlock(blockType.slug)}
        >
          <span class="text-sm font-medium">{blockType.name}</span>
          {#if blockType.description}
            <span class="text-muted-foreground text-xs leading-snug">
              {blockType.description}
            </span>
          {/if}
        </button>
      {/each}
    </div>
  </DialogContent>
</Dialog>
