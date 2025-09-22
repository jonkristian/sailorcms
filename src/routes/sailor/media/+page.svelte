<script lang="ts">
  import { goto } from '$app/navigation';
  import { invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import { Button } from '$lib/components/ui/button';
  import { LayoutGrid, List } from '@lucide/svelte';
  import { toast } from '$sailor/core/ui/toast';
  import { type FileType } from '$sailor/core/files/file';
  import Header from '$lib/components/sailor/Header.svelte';
  import MediaEditModal from '$lib/components/sailor/MediaEditModal.svelte';
  import DeleteDialog from '$lib/components/sailor/dialogs/DeleteDialog.svelte';
  import { BulkActionsBar, FilterBar } from '$lib/components/sailor/table';
  import { useTableFilters } from '$lib/sailor/composables/useTableFilters.svelte';
  import { useBulkSelection } from '$lib/sailor/composables/useBulkSelection.svelte';
  import Pagination from '$lib/components/sailor/Pagination.svelte';
  import type { Tag } from '$sailor/core/types/tag';
  import MediaGrid from './(components)/MediaGrid.svelte';
  import MediaTable from './(components)/MediaTable.svelte';
  import {
    deleteFiles as deleteMediaFiles,
    updateFilesTags as updateMediaFilesTags
  } from '$sailor/remote/files.remote.js';
  import { uploadFiles, type UploadOptions } from '$sailor/core/files/upload';
  import * as Dialog from '$lib/components/ui/dialog/index.js';
  import * as Select from '$lib/components/ui/select/index.js';
  import TagsInput from '$lib/components/sailor/fields/TagsInput.svelte';
  import FileUploadProgress from '$lib/components/sailor/FileUploadProgress.svelte';

  // Type for the file data with tags (matches server response)
  type FileWithTags = FileType & {
    tags?: Tag[];
  };

  let { data } = $props();

  // Extract available tags from server data
  let availableTags = $state<Tag[]>(data.availableTags || []);
  // Initialize view mode from URL parameters, defaulting to 'table'
  let viewMode = $state<'table' | 'grid'>(
    (page.url.searchParams.get('viewMode') as 'table' | 'grid') || 'table'
  );

  // Set up filters with type and tags support
  let filterConfigForState = {
    search: true,
    select: [
      {
        key: 'type',
        options: [
          { value: 'all', label: 'All Files' },
          { value: 'image', label: 'Images' },
          { value: 'video', label: 'Videos' },
          { value: 'document', label: 'Documents' }
        ],
        default: 'all'
      }
    ],
    multiSelect: [
      {
        key: 'tags',
        label: 'Tags',
        options: [] as { value: string; label: string }[]
      }
    ]
  };

  const tableFilters = useTableFilters({
    baseUrl: '/sailor/media',
    config: filterConfigForState
  });

  // Create reactive tag options
  const tagOptions = $derived(availableTags.map((tag) => ({ value: tag.name, label: tag.name })));

  // Upload progress state
  let uploadProgressOpen = $state(false);
  let uploadFilesList = $state<
    Array<{
      name: string;
      size: number;
      status: 'pending' | 'uploading' | 'success' | 'error';
      progress: number;
      error?: string;
    }>
  >([]);

  // Edit modal state
  let editModalOpen = $state(false);
  let editingFile = $state<FileType | null>(null);

  // Delete confirmation dialog state
  let deleteDialogOpen = $state(false);
  let deleteDialogLoading = $state(false);
  let pendingDeleteItems = $state<{ ids: string[]; count: number }>({ ids: [], count: 0 });

  // Bulk operations state
  let bulkAction = $state('');
  let tagsDialogOpen = $state(false);
  let tagsDialogMode = $state<'add' | 'remove' | 'replace'>('add');
  let selectedTags = $state<Tag[]>([]);

  // Use server-provided pagination data
  let pagination = $derived(data.pagination);
  let files = $derived(data.files);

  // Use composable for selection functionality
  const selection = useBulkSelection(() => files);

  // Available tags are provided by the server-side load function
  // No need to fetch them client-side

  function triggerFileUpload() {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '*/*';
    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files && files.length > 0) {
        // Initialize upload progress
        uploadFilesList = Array.from(files).map((file) => ({
          name: file.name,
          size: file.size,
          status: 'pending' as const,
          progress: 0
        }));
        uploadProgressOpen = true;

        try {
          // Update status to uploading
          uploadFilesList = uploadFilesList.map((file) => ({ ...file, status: 'uploading' }));

          // Use the upload function with progress tracking
          const results = await uploadFiles(files, {
            onFileProgress: (fileName: string, progress: number) => {
              uploadFilesList = uploadFilesList.map((file) =>
                file.name === fileName ? { ...file, progress: Math.round(progress) } : file
              );
            },
            onFileComplete: (fileName: string, result: any) => {
              uploadFilesList = uploadFilesList.map((file) =>
                file.name === fileName ? { ...file, status: 'success', progress: 100 } : file
              );
            },
            onFileError: (fileName: string, error: string) => {
              uploadFilesList = uploadFilesList.map((file) =>
                file.name === fileName ? { ...file, status: 'error', error } : file
              );
            },
            onAllComplete: (results: any[]) => {
              // Check if all uploads were successful
              const allSuccessful = results.every((r: any) => r.result?.success);

              if (allSuccessful) {
                // Close dialog after a short delay
                setTimeout(() => {
                  uploadProgressOpen = false;
                  invalidateAll(); // Refresh the file list
                }, 1500);
              }
            }
          });
        } catch (error) {
          // Mark all files as failed
          uploadFilesList = uploadFilesList.map((file) => ({
            ...file,
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
          }));
        }
      }
    };
    input.click();
  }

  // Copy filename function for grid view
  async function copyFilename(filename: string) {
    try {
      await navigator.clipboard.writeText(filename);
      toast.success('Filename copied to clipboard');
    } catch (err) {
      console.error('Failed to copy filename:', err);
      toast.error('Failed to copy filename');
    }
  }

  // Handle view mode change with pageSize adjustment
  async function changeViewMode(newViewMode: 'table' | 'grid') {
    viewMode = newViewMode;

    const url = new URL(page.url);

    // Set view mode in URL parameters
    url.searchParams.set('viewMode', newViewMode);

    // Set pageSize based on view mode
    const newPageSize = newViewMode === 'grid' ? 50 : 20;
    url.searchParams.set('pageSize', newPageSize.toString());
    url.searchParams.set('page', '1'); // Reset to first page

    await goto(url.pathname + url.search);
  }

  async function deleteFiles(ids: string | string[], skipConfirmation = false) {
    const idArray = Array.isArray(ids) ? ids : [ids];

    if (!skipConfirmation) {
      const message =
        idArray.length > 1
          ? `Are you sure you want to delete ${idArray.length} files?`
          : 'Are you sure you want to delete this file?';
      if (!confirm(message)) return;
    }

    try {
      const result = await deleteMediaFiles({ ids: idArray });

      if (result.success) {
        toast.success(result.message || 'Files deleted successfully');
        await invalidateAll();
      } else {
        toast.error(result.error || 'Failed to delete files');
      }
    } catch (error) {
      toast.error('Failed to delete files');
    }
  }

  function openEditModal(file: FileWithTags) {
    // Convert file to FileType for the modal
    editingFile = {
      id: file.id,
      name: file.name,
      url: file.url,
      path: file.path,
      size: file.size,
      mime_type: file.mime_type,
      alt: file.alt,
      title: file.title,
      description: file.description,
      created_at: file.created_at,
      updated_at: file.updated_at
    };
    editModalOpen = true;
  }

  // Handle bulk delete
  function handleBulkDelete() {
    if (selection.selectedItems.length === 0) return;
    pendingDeleteItems = { ids: selection.selectedItems, count: selection.selectedItems.length };
    deleteDialogOpen = true;
  }

  async function executeBulkDelete() {
    deleteDialogLoading = true;
    try {
      await deleteFiles(pendingDeleteItems.ids, true);
      selection.clearSelection();
      deleteDialogOpen = false;
    } catch (error) {
      console.error('Bulk delete failed:', error);
    } finally {
      deleteDialogLoading = false;
    }
  }

  // Handle bulk tag operations
  function handleBulkTagAction(action: string) {
    if (selection.selectedItems.length === 0) return;

    tagsDialogMode = action as 'add' | 'remove' | 'replace';
    selectedTags = [];
    tagsDialogOpen = true;
  }

  async function executeBulkTagOperation() {
    if (selection.selectedItems.length === 0 || selectedTags.length === 0) return;

    try {
      const tagNames = selectedTags.map((tag) => tag.name);
      const result = await updateMediaFilesTags({
        ids: selection.selectedItems,
        tags: tagNames,
        mode: tagsDialogMode
      });

      if (result.success) {
        toast.success(result.message || 'Tags updated successfully');
        await invalidateAll();
        selection.clearSelection();
        tagsDialogOpen = false;
        selectedTags = [];
      } else {
        toast.error(result.error || 'Failed to update tags');
      }
    } catch (error) {
      console.error('Failed to update tags:', error);
      toast.error('Failed to update tags');
    }
  }
</script>

<svelte:head>
  <title>Media Library - Sailor CMS</title>
</svelte:head>

<div class="container mx-auto px-6">
  <Header
    title="Media Library"
    description="Manage your files and media assets"
    itemCount={pagination.totalItems}
    showAddButton={true}
    showCountBadge={true}
    addButtonAction={triggerFileUpload}
  />

  {#if files.length > 0}
    <!-- Table Controls with BulkActionsBar and FilterBar -->
    <BulkActionsBar
      selectedCount={selection.selectedCount}
      totalCount={selection.totalCount}
      itemType="file"
      actions={selection.selectedCount > 0
        ? [
            {
              label: `Delete (${selection.selectedCount})`,
              variant: 'destructive',
              onClick: handleBulkDelete
            }
          ]
        : []}
    >
      {#snippet extraActions()}
        {#if selection.selectedCount > 0}
          <div class="flex items-center gap-2">
            <Select.Root
              type="single"
              value={bulkAction}
              onValueChange={async (value) => {
                if (!value) return;
                if (value === 'add-tags') {
                  handleBulkTagAction('add');
                } else if (value === 'replace-tags') {
                  handleBulkTagAction('replace');
                } else if (value === 'remove-tags') {
                  handleBulkTagAction('remove');
                }
                bulkAction = '';
              }}
            >
              <Select.Trigger class="h-9 w-44">Bulk actions…</Select.Trigger>
              <Select.Content>
                <Select.Item value="add-tags">Add tags</Select.Item>
                <Select.Item value="replace-tags">Replace tags</Select.Item>
                <Select.Item value="remove-tags">Remove tags</Select.Item>
              </Select.Content>
            </Select.Root>
          </div>
        {/if}

        <!-- View Mode Switcher -->
        <div class="flex items-center gap-1 rounded-md border">
          <Button
            variant={viewMode === 'table' ? 'secondary' : 'ghost'}
            size="sm"
            onclick={() => changeViewMode('table')}
            class="h-9 px-2"
            title="Table view"
          >
            <List class="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
            size="sm"
            onclick={() => changeViewMode('grid')}
            class="h-9 px-2"
            title="Grid view"
          >
            <LayoutGrid class="h-4 w-4" />
          </Button>
        </div>
      {/snippet}
      {#snippet filters()}
        <FilterBar
          config={{
            search: true,
            select: [
              {
                key: 'type',
                label: 'File Type',
                options: [
                  { value: 'all', label: 'All Files' },
                  { value: 'image', label: 'Images' },
                  { value: 'video', label: 'Videos' },
                  { value: 'document', label: 'Documents' }
                ],
                default: 'all'
              }
            ],
            multiSelect: [
              {
                key: 'tags',
                label: 'Tags',
                options: tagOptions
              }
            ]
          }}
          {tableFilters}
        />
      {/snippet}
    </BulkActionsBar>
  {/if}

  <!-- Clean View Components -->
  {#if viewMode === 'table'}
    <MediaTable
      {files}
      selectedItems={selection.selectedItems}
      onSelect={(id) => selection.handleSelect(id, !selection.selectedItems.includes(id))}
      onSelectAll={selection.handleSelectAll}
      onEdit={openEditModal}
      onDelete={deleteFiles}
    />
  {:else}
    <MediaGrid
      {files}
      selectedItems={selection.selectedItems}
      onSelect={(id) => selection.handleSelect(id, !selection.selectedItems.includes(id))}
      onEdit={openEditModal}
      onRemove={deleteFiles}
      onCopy={copyFilename}
    />
  {/if}

  <Pagination
    page={pagination.page}
    pageSize={pagination.pageSize}
    totalItems={pagination.totalItems}
    totalPages={pagination.totalPages}
    hasNextPage={pagination.hasNextPage}
    hasPreviousPage={pagination.hasPreviousPage}
    useUrlNavigation={true}
    showTotalItems={true}
    showPageSizeSelector={true}
  />
</div>

<!-- Edit Modal -->
{#if editModalOpen && editingFile}
  <MediaEditModal
    bind:open={editModalOpen}
    file={editingFile}
    onSave={async () => {
      invalidateAll();
      editModalOpen = false;
    }}
  />
{/if}

<!-- Delete Confirmation Dialog -->
<DeleteDialog
  bind:open={deleteDialogOpen}
  itemCount={pendingDeleteItems.count}
  itemType="file"
  onConfirm={executeBulkDelete}
  isLoading={deleteDialogLoading}
/>

<!-- Tags Input Dialog -->
<Dialog.Root bind:open={tagsDialogOpen}>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>
        {tagsDialogMode === 'add' ? 'Add' : tagsDialogMode === 'remove' ? 'Remove' : 'Replace'} Tags
      </Dialog.Title>
      <Dialog.Description>
        {tagsDialogMode === 'add'
          ? 'Add tags to'
          : tagsDialogMode === 'remove'
            ? 'Remove tags from'
            : 'Replace tags for'}
        {selection.selectedCount} selected file{selection.selectedCount > 1 ? 's' : ''}
      </Dialog.Description>
    </Dialog.Header>
    <div class="space-y-4">
      <TagsInput
        value={selectedTags}
        onChange={(tags) => (selectedTags = tags as Tag[])}
        placeholder={tagsDialogMode === 'add'
          ? 'Add tags...'
          : tagsDialogMode === 'remove'
            ? 'Select tags to remove...'
            : 'Select new tags...'}
      />
    </div>
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (tagsDialogOpen = false)}>Cancel</Button>
      <Button onclick={executeBulkTagOperation} disabled={selectedTags.length === 0}>
        {tagsDialogMode === 'add'
          ? 'Add Tags'
          : tagsDialogMode === 'remove'
            ? 'Remove Tags'
            : 'Replace Tags'}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<!-- File Upload Progress Dialog -->
<FileUploadProgress bind:open={uploadProgressOpen} files={uploadFilesList} />
