<script lang="ts">
  import * as Sheet from '$lib/components/ui/sheet';
  import { Button } from '$lib/components/ui/button';
  import {
    Search,
    LoaderCircle,
    FileText,
    ChevronLeft,
    ChevronRight,
    X,
    Upload,
    Copy
  } from '@lucide/svelte';
  import { cn } from '$lib/sailor/utils';
  import * as Table from '$lib/components/ui/table';
  import * as Pagination from '$lib/components/ui/pagination';
  import { formatDate } from '$sailor/core/utils/date';
  import { formatFileSize } from '$sailor/core/files/file';
  import type { FileType } from '$sailor/core/files/file';
  import { debounce } from '$sailor/core/utils/debounce';
  import { GripVertical } from '@lucide/svelte';
  import { Label } from '$lib/components/ui/label';
  import * as Select from '$lib/components/ui/select';
  import { getFiles } from '$sailor/remote/files.remote.js';
  import { uploadFiles } from '$sailor/core/files/upload';
  import FileUploadProgress from '$lib/components/sailor/FileUploadProgress.svelte';
  import VerticalList from '$lib/components/sailor/dnd/VerticalList.svelte';

  let {
    value = $bindable(''),
    fileType = 'document',
    multiple = false,
    open = $bindable(false),
    onSelect,
    onOpenChange = (isOpen: boolean) => (open = isOpen)
  } = $props<{
    value?: string | string[];
    onSelect?: (value: string | string[]) => void;
    fileType?: 'image' | 'document' | 'all';
    multiple?: boolean;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  }>();

  let searchInput = $state('');
  let searchQuery = $state('');
  let currentPage = $state(1);
  let previewFile = $state<FileType | null>(null);
  let uploadLoading = $state(false);
  let refreshTrigger = $state(0); // Force refresh when incremented

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

  let itemsPerPage = $state(20);

  // Reactive query - directly call the remote function as shown in SvelteKit docs
  const filesQuery = $derived(
    open && refreshTrigger >= 0 // Include refreshTrigger to force refresh when files are uploaded
      ? getFiles({
          limit: itemsPerPage,
          offset: (currentPage - 1) * itemsPerPage,
          type: fileType,
          search: searchQuery || undefined
        })
      : Promise.resolve({ success: false, files: [], total: 0 })
  );

  // Selected files state management - like FileField does it
  let selectedFiles = $state<any[]>([]);

  // Load selected files when value changes
  $effect(() => {
    const currentValues = Array.isArray(value) ? value : value ? [value] : [];
    if (currentValues.length === 0) {
      selectedFiles = [];
      return;
    }

    // Load files asynchronously
    getFiles({ ids: currentValues })
      .then((result) => {
        if (result.success && result.files) {
          // Order files according to the value array
          selectedFiles = currentValues
            .map((id) => result.files?.find((f) => f.id === id))
            .filter(Boolean);
        }
      })
      .catch((error) => {
        console.error('Failed to load selected files:', error);
        selectedFiles = [];
      });
  });

  function handleSelect(selectedValue: string | string[]) {
    if (!onSelect) return;

    if (multiple) {
      if (Array.isArray(selectedValue)) {
        onSelect(selectedValue);
      } else {
        const currentValues = Array.isArray(value) ? value : [];
        const newValues = currentValues.includes(selectedValue)
          ? currentValues.filter((v) => v !== selectedValue)
          : [...currentValues, selectedValue];
        onSelect(newValues);
      }
    } else {
      const newValue = selectedValue === value ? '' : selectedValue;
      onSelect(newValue);

      // Don't auto-close picker for single file selection to allow users to change their selection
      // Users can manually close the picker when they're done
      // Note: Auto-close behavior removed for better UX
    }
  }

  function isSelected(fileValue: string) {
    const selected = Array.isArray(value) ? value.includes(fileValue) : value === fileValue;
    return selected;
  }

  function handleSearch(e: Event) {
    const target = e.target as HTMLInputElement;
    searchInput = target.value;
    debouncedSearch(target.value);
  }

  // Update the debounced search to trigger server-side search
  const debouncedSearch = debounce((value: string) => {
    searchQuery = value.trim();
    currentPage = 1; // Reset to first page when searching
  }, 500);

  function handlePageChange(page: number) {
    if (page >= 1) {
      currentPage = page;
    }
  }

  function getVisiblePages(current: number, total: number) {
    if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);

    if (current <= 3) return [1, 2, 3, '...', total];
    if (current >= total - 2) return [1, '...', total - 2, total - 1, total];

    return [1, '...', current - 1, current, current + 1, '...', total];
  }

  function handleSheetOpenChange(isOpen: boolean) {
    onOpenChange(isOpen);
  }

  async function copyFilename(label: string) {
    try {
      await navigator.clipboard.writeText(label);
      // Could add toast notification here if needed
    } catch (err) {
      console.error('Failed to copy filename:', err);
    }
  }

  // Reset pagination when search query changes
  let previousSearchQuery = $state('');
  $effect(() => {
    if (searchQuery !== previousSearchQuery) {
      currentPage = 1;
      previousSearchQuery = searchQuery;
    }
  });

  async function handleFileUpload(fileList: FileList) {
    if (uploadLoading) return;

    uploadLoading = true;

    // Initialize upload progress
    uploadFilesList = Array.from(fileList).map((file) => ({
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
      const results = await uploadFiles(Array.from(fileList), {
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
            // Auto-select if it's a single file upload in single mode
            if (!multiple && results.length === 1) {
              const file = results[0].result?.files?.[0];
              if (file) {
                handleSelect(file.id);
              }
            }

            // Close upload progress dialog after a short delay, but keep file picker open
            setTimeout(() => {
              uploadProgressOpen = false;
              uploadLoading = false;
              // Trigger refresh of file list to show newly uploaded files
              refreshTrigger++;
              // Note: File picker stays open so user can see the uploaded files and select more if needed
            }, 1500);
          } else {
            // If some uploads failed, reset loading state immediately
            uploadLoading = false;
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
      uploadLoading = false;
    }
  }

  // Update the file input handler
  function handleFileInput() {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true; // Always allow multiple file uploads
    input.accept =
      fileType === 'image' ? 'image/*' : fileType === 'document' ? '.pdf,.doc,.docx,.txt' : '*/*';
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files && files.length > 0) {
        handleFileUpload(files);
      }
    };
    input.click();
  }
</script>

<Sheet.Root {open} onOpenChange={handleSheetOpenChange}>
  <Sheet.Content side="bottom" class="flex h-[55vh] flex-col gap-0 p-0">
    <Sheet.Header class="flex-shrink-0 border-b px-4 py-4">
      <div class="flex items-center justify-between">
        <!-- Left side: Search and Upload -->
        <div class="flex items-center gap-4">
          <div class="relative w-[300px]">
            <Search
              class="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
            />
            <input
              type="text"
              placeholder="Search for files..."
              value={searchInput}
              oninput={handleSearch}
              class="bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring border-input h-9 w-full rounded-md border pr-4 pl-9 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          <Button
            variant="outline"
            class="flex h-9 items-center gap-2"
            disabled={uploadLoading}
            onclick={handleFileInput}
          >
            {#if uploadLoading}
              <LoaderCircle class="h-4 w-4 animate-spin" />
            {:else}
              <Upload class="h-4 w-4" />
            {/if}
            <span>Upload {multiple ? 'files' : 'file'}</span>
          </Button>
        </div>

        <!-- Right side: Pagination -->
        <div class="flex items-center gap-4">
          <div class="flex items-center gap-2">
            <Label for="file-rows-per-page" class="text-sm font-medium">Rows per page</Label>
            <Select.Root
              type="single"
              value={itemsPerPage.toString()}
              onValueChange={(value) => {
                itemsPerPage = Number(value);
                currentPage = 1; // Reset to first page when changing page size
              }}
            >
              <Select.Trigger size="sm" class="w-16" id="file-rows-per-page">
                {itemsPerPage}
              </Select.Trigger>
              <Select.Content side="top">
                {#each [20, 50, 100] as size (size)}
                  <Select.Item value={size.toString()}>
                    {size}
                  </Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </div>
          <div class="flex items-center">
            {#await filesQuery then result}
              {@const totalCount = result.success ? result.total || 0 : 0}
              {@const totalPages = Math.ceil(totalCount / itemsPerPage)}
              <Pagination.Root
                count={totalCount}
                perPage={itemsPerPage}
                page={currentPage}
                onPageChange={handlePageChange}
              >
                <Pagination.Content class="!justify-start">
                  <Pagination.Item>
                    <Button
                      variant="outline"
                      size="icon"
                      class="h-9 w-9"
                      disabled={currentPage === 1 || totalPages <= 1}
                      onclick={() => handlePageChange(currentPage - 1)}
                    >
                      <ChevronLeft class="h-4 w-4" />
                    </Button>
                  </Pagination.Item>

                  {#each getVisiblePages(currentPage, totalPages) as page, index (index)}
                    {#if page === '...'}
                      <Pagination.Item>
                        <span class="px-2">...</span>
                      </Pagination.Item>
                    {:else}
                      <Pagination.Item>
                        <Button
                          variant={currentPage === page ? 'default' : 'outline'}
                          size="sm"
                          class="h-9 w-9"
                          onclick={() => typeof page === 'number' && handlePageChange(page)}
                        >
                          {page}
                        </Button>
                      </Pagination.Item>
                    {/if}
                  {/each}

                  <Pagination.Item>
                    <Button
                      variant="outline"
                      size="icon"
                      class="h-9 w-9"
                      disabled={currentPage === totalPages || totalPages <= 1}
                      onclick={() => handlePageChange(currentPage + 1)}
                    >
                      <ChevronRight class="h-4 w-4" />
                    </Button>
                  </Pagination.Item>
                </Pagination.Content>
              </Pagination.Root>
            {/await}
          </div>
        </div>
      </div>
    </Sheet.Header>

    <div class="flex flex-1 overflow-hidden">
      <!-- Selected Files Sidebar -->
      <div class="bg-muted/30 flex w-[180px] flex-col border-r">
        <div class="flex h-[49px] items-center border-b px-4 py-3">
          <h4 class="text-sm font-medium">Selected files</h4>
        </div>
        <div class="flex-1 overflow-auto">
          <div class="p-4">
            {#if selectedFiles.length > 0}
              <VerticalList
                items={selectedFiles}
                onItemsChange={(newItems) => {
                  const newValues = newItems.map((item) => item.id);
                  onSelect?.(newValues);
                }}
              >
                {#snippet children({
                  item: selectedFile,
                  dragHandleAttributes,
                  isDragging
                }: {
                  item: any;
                  dragHandleAttributes: any;
                  isDragging: boolean;
                })}
                  <div
                    class="group relative flex items-center gap-2 transition-all duration-200"
                    class:opacity-70={isDragging}
                  >
                    <div class="relative min-w-0 flex-1">
                      <div
                        class="border-input bg-background w-full overflow-hidden rounded-md border shadow-sm"
                      >
                        {#if selectedFile.mime_type?.includes('image')}
                          <div class="relative aspect-square">
                            <img
                              src={selectedFile.url}
                              alt={selectedFile.name}
                              class="h-full w-full object-cover"
                            />
                            <!-- Control buttons overlay -->
                            <div
                              class="absolute top-2 right-2 flex items-center gap-1 rounded-md bg-black/70 p-1 opacity-0 transition-opacity group-hover:opacity-100"
                            >
                              <div
                                class="flex cursor-grab items-center justify-center rounded p-1 hover:bg-white/20"
                                {...dragHandleAttributes}
                                role="button"
                                tabindex={0}
                                aria-label="Drag handle"
                              >
                                <GripVertical class="h-3 w-3 text-white" />
                              </div>
                              <button
                                type="button"
                                class="flex items-center justify-center rounded p-1 text-white hover:bg-white/20"
                                title="Copy filename"
                                onclick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  copyFilename(selectedFile.name);
                                }}
                              >
                                <Copy class="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                class="flex items-center justify-center rounded p-1 text-white hover:bg-white/20"
                                onclick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleSelect(selectedFile.id);
                                }}
                              >
                                <X class="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        {:else}
                          <div
                            class="relative flex aspect-square flex-col items-center justify-center p-2"
                          >
                            <FileText class="mb-2 h-6 w-6 shrink-0" />
                            <div class="w-full min-w-0">
                              <p
                                class="text-muted-foreground truncate px-0.5 text-center text-xs"
                                title={selectedFile.name}
                              >
                                {selectedFile.name}
                              </p>
                            </div>
                            <!-- Control buttons overlay for non-images -->
                            <div
                              class="absolute top-2 right-2 flex items-center gap-1 rounded-md bg-black/70 p-1 opacity-0 transition-opacity group-hover:opacity-100"
                            >
                              <div
                                class="flex cursor-grab items-center justify-center rounded p-1 hover:bg-white/20"
                                {...dragHandleAttributes}
                                role="button"
                                tabindex={0}
                                aria-label="Drag handle"
                              >
                                <GripVertical class="h-3 w-3 text-white" />
                              </div>
                              <button
                                type="button"
                                class="flex items-center justify-center rounded p-1 text-white hover:bg-white/20"
                                title="Copy filename"
                                onclick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  copyFilename(selectedFile.name);
                                }}
                              >
                                <Copy class="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                class="flex items-center justify-center rounded p-1 text-white hover:bg-white/20"
                                onclick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleSelect(selectedFile.id);
                                }}
                              >
                                <X class="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        {/if}
                      </div>
                    </div>
                  </div>
                {/snippet}
              </VerticalList>
            {:else}
              <div
                class="text-muted-foreground flex h-full items-center justify-center p-4 pl-0 text-center text-sm"
              >
                Click on a row to select images.
              </div>
            {/if}
          </div>
        </div>
      </div>

      <!-- Main Table Area -->
      <div class="flex min-w-0 flex-1 flex-col">
        {#if !open}
          <div class="text-muted-foreground flex flex-1 items-center justify-center text-sm">
            No files found.
          </div>
        {:else}
          <!-- Table with proper scrolling -->
          <div class="flex-1 overflow-hidden border-r">
            <div class="h-full overflow-auto">
              <Table.Root>
                <Table.Header class="bg-background sticky top-0 z-10 border-b">
                  <Table.Row class="h-[48px]">
                    <Table.Head class="w-12 px-4"></Table.Head>
                    <Table.Head class="px-4">Filename</Table.Head>
                    <Table.Head class="px-4 text-right">Size</Table.Head>
                    <Table.Head class="px-4 text-right">Date</Table.Head>
                    <Table.Head class="w-12 px-4"></Table.Head>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {#await filesQuery then result}
                    {#each result.success ? result.files || [] : [] as file, fileIndex (file?.id || fileIndex)}
                      {#if file && file.id}
                        {@const selected = isSelected(file.id)}
                        <Table.Row
                          class={cn(
                            'group h-[52px] border-b transition-colors',
                            selected ? 'bg-primary/10 hover:bg-primary/15' : 'hover:bg-muted/50',
                            'cursor-pointer'
                          )}
                          onclick={(e) => {
                            // Only handle clicks that are not on the preview button
                            if (!(e.target as HTMLElement).closest('button')) {
                              handleSelect(file.id);
                            }
                          }}
                          role="button"
                          tabindex={0}
                        >
                          <Table.Cell class="w-12 px-4 py-1.5">
                            <div class="group relative">
                              <button
                                type="button"
                                class={cn(
                                  'relative h-10 w-10 overflow-hidden rounded-md p-0',
                                  'border transition-colors',
                                  selected
                                    ? 'border-primary shadow-sm'
                                    : 'border-muted-foreground/20 hover:border-muted-foreground/40',
                                  file.mime_type?.includes('image') && 'cursor-zoom-in'
                                )}
                                onclick={(e) => {
                                  e.stopPropagation();
                                  previewFile = previewFile === file ? null : file;
                                }}
                              >
                                {#if file.mime_type?.includes('image')}
                                  <img
                                    src={file.url}
                                    alt={file.name}
                                    class="h-full w-full object-cover"
                                  />
                                {:else}
                                  <div
                                    class="bg-muted flex h-full w-full items-center justify-center"
                                  >
                                    <FileText class="text-muted-foreground h-6 w-6" />
                                  </div>
                                {/if}
                              </button>
                            </div>
                          </Table.Cell>
                          <Table.Cell class="px-4">
                            <div class="flex flex-col">
                              <span class="max-w-xs truncate font-medium" title={file.name}
                                >{file.name}</span
                              >
                              <span class="text-muted-foreground text-sm">
                                {formatFileSize(file.size ?? 0)}
                              </span>
                            </div>
                          </Table.Cell>
                          <Table.Cell class="text-muted-foreground px-4 text-right">
                            {formatFileSize(file.size ?? 0)}
                          </Table.Cell>
                          <Table.Cell class="text-muted-foreground px-4 text-right">
                            {file.created_at ? formatDate(file.created_at) : '—'}
                          </Table.Cell>
                          <Table.Cell class="w-12 px-4"></Table.Cell>
                        </Table.Row>
                      {/if}
                    {/each}
                  {/await}
                </Table.Body>
              </Table.Root>
            </div>
          </div>
        {/if}
      </div>

      <!-- Preview Sidebar -->
      {#if previewFile}
        <div class="bg-muted/30 flex w-[280px] flex-col">
          <div class="flex h-[49px] items-center border-b px-4 py-3">
            <div class="flex w-full items-center justify-between">
              <h4 class="text-sm font-medium">Preview</h4>
              <Button
                variant="ghost"
                size="icon"
                class="h-8 w-8"
                onclick={() => (previewFile = null)}
              >
                <X class="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div class="flex-1 p-4">
            <div class="space-y-4">
              {#if previewFile.mime_type?.includes('image')}
                <div class="relative overflow-hidden rounded-md border bg-white">
                  <div class="relative w-full pt-[100%]">
                    <img
                      src={previewFile.url}
                      alt={previewFile.name}
                      class="absolute inset-0 h-full w-full object-contain"
                    />
                  </div>
                </div>
              {:else}
                <div
                  class="flex aspect-square items-center justify-center rounded-md border bg-white"
                >
                  <FileText class="text-muted-foreground h-12 w-12" />
                </div>
              {/if}
              <div class="space-y-2 text-sm">
                <p class="font-medium break-words">{previewFile.name}</p>
                <p class="text-muted-foreground">Size: {formatFileSize(previewFile.size ?? 0)}</p>
                <p class="text-muted-foreground">
                  Date: {previewFile.created_at ? formatDate(previewFile.created_at) : '—'}
                </p>
              </div>
            </div>
          </div>
        </div>
      {/if}
    </div>
  </Sheet.Content>
</Sheet.Root>

<!-- File Upload Progress Dialog -->
<FileUploadProgress bind:open={uploadProgressOpen} files={uploadFilesList} />
