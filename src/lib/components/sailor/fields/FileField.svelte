<script lang="ts">
  import FilePicker from '$lib/components/sailor/files/file-picker.svelte';
  import { Button } from '$lib/components/ui/button';
  import { Trash2, Plus } from '@lucide/svelte';
  import { getImage } from '$sailor/core/files/file';
  import Grid from '$lib/components/sailor/dnd/Grid.svelte';
  import FileWithControls from '$lib/components/sailor/FileWithControls.svelte';
  import { getFiles } from '$sailor/remote/files.remote.js';

  let {
    value = $bindable(''),
    field,
    onChange,
    required = false,
    readonly = false
  } = $props<{
    value?: string | string[];
    field: any;
    onChange: (value: string | string[]) => void;
    required?: boolean;
    readonly?: boolean;
  }>();

  const fileOptions = field.file || {};
  const multiple = fileOptions.multiple || false;
  const fileType = fileOptions.fileType || 'all';

  let selectedForDeletion = $state<Set<string>>(new Set());
  let open = $state(false);

  function handleSelect(newValue: string | string[]) {
    value = newValue;
    onChange(newValue);
  }

  // Remove the duplicate handlePickerSelect function and use handleSelect directly
  function handlePickerSelect(selectedValue: string | string[]) {
    if (multiple) {
      if (Array.isArray(selectedValue)) {
        handleSelect(selectedValue);
      } else {
        const currentValues = Array.isArray(value) ? value : [];
        const newValues = currentValues.includes(selectedValue)
          ? currentValues.filter((v) => v !== selectedValue)
          : [...currentValues, selectedValue];
        handleSelect(newValues);
      }
    } else {
      const newValue = selectedValue === value ? '' : selectedValue;
      handleSelect(newValue);
    }
  }

  function toggleFileSelection(fileValue: string) {
    const newSelection = new Set(selectedForDeletion);
    if (newSelection.has(fileValue)) {
      newSelection.delete(fileValue);
    } else {
      newSelection.add(fileValue);
    }
    selectedForDeletion = newSelection;
  }

  function selectAllVisible() {
    const currentFileValues = (Array.isArray(value) ? value : [value]).filter(Boolean);
    selectedForDeletion = new Set(currentFileValues);
  }

  function clearSelection() {
    selectedForDeletion = new Set();
  }

  function deleteSelected() {
    const currentFiles = Array.isArray(value) ? value : value ? [value] : [];
    const remainingFiles = currentFiles.filter((fileValue) => !selectedForDeletion.has(fileValue));

    if (multiple) {
      handleSelect(remainingFiles);
    } else {
      handleSelect(remainingFiles.length > 0 ? remainingFiles[0] : '');
    }

    selectedForDeletion = new Set();
  }

  function openPicker(event?: Event) {
    // Prevent any potential event bubbling issues
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    // Ensure we're not in a readonly state
    if (readonly) return;

    // Set open state
    open = true;
  }

  function handleSheetOpenChange(isOpen: boolean) {
    open = isOpen;
  }

  // Handle file reordering for grid DnD
  function handleFilesReorder(reorderedItems: any[]) {
    const reorderedValues = reorderedItems.map((item) => item.value);
    handleSelect(reorderedValues);
  }

  // Handle file removal via grid DnD
  function handleFileRemove(fileValue: string) {
    if (multiple) {
      const currentValues = Array.isArray(value) ? value : [];
      const newValues = currentValues.filter((v) => v !== fileValue);
      handleSelect(newValues);
    } else {
      handleSelect('');
    }
  }

  async function copyFilename(filename: string) {
    try {
      await navigator.clipboard.writeText(filename);
      // Could add toast notification here if needed
    } catch (err) {
      console.error('Failed to copy filename:', err);
    }
  }

  // Get file items formatted for Grid component
  let fileItems = $state<
    Array<{ id: string; value: string; url: string; label: string; type: string }>
  >([]);

  // Update fileItems when value changes
  $effect(() => {
    const fileValues = Array.isArray(value) ? value : value ? [value] : [];

    if (fileValues.length === 0) {
      fileItems = [];
      return;
    }

    // Get files directly from the query
    const selectedValues = Array.isArray(value) ? value : value ? [value] : [];

    if (selectedValues.length > 0) {
      getFiles({
        ids: selectedValues,
        limit: 50,
        type: fileType
      }).then((result) => {
        if (result.success && result.files && Array.isArray((result as any).files)) {
          const files = (result as any).files.map((file: any) => ({
            value: file.id,
            label: file.name,
            url: file.url,
            type: file.mime_type?.includes('image') ? 'image' : 'document',
            size: file.size,
            created_at: file.created_at
          }));

          if (files.length === 0) {
            fileItems = [];
            return;
          }

          const mappedItems = fileValues.map((fileValue) => {
            const file = files.find((f: any) => f.value === fileValue);

            if (!file) {
              // Create placeholder for missing file - FileWithControls will handle display
              return {
                id: fileValue,
                value: fileValue,
                url: '',
                label: 'Missing file',
                type: fileType // Let FileWithControls component decide how to display
              };
            }

            // For existing files, pass through the file data - FileWithControls handles type logic
            return {
              id: fileValue,
              value: fileValue,
              url: file.url,
              label: file.label || 'Unknown file',
              type: file.type || fileType // Use file.type if available, fallback to fieldType
            };
          });

          fileItems = mappedItems;
        } else {
          fileItems = [];
        }
      });
    } else {
      getFiles({
        limit: 50,
        offset: 0,
        type: fileType
      }).then((result) => {
        if (result.success && result.files && Array.isArray((result as any).files)) {
          const files = (result as any).files.map((file: any) => ({
            value: file.id,
            label: file.name,
            url: file.url,
            type: file.mime_type?.includes('image') ? 'image' : 'document',
            size: file.size,
            created_at: file.created_at
          }));

          if (files.length === 0) {
            fileItems = [];
            return;
          }

          const mappedItems = fileValues.map((fileValue) => {
            const file = files.find((f: any) => f.value === fileValue);

            if (!file) {
              // Create placeholder for missing file - FileWithControls component decide how to display
              return {
                id: fileValue,
                value: fileValue,
                url: '',
                label: 'Missing file',
                type: fileType // Let FileWithControls component decide how to display
              };
            }

            // For existing files, pass through the file data - FileWithControls handles type logic
            return {
              id: fileValue,
              value: fileValue,
              url: file.url,
              label: file.label || 'Unknown file',
              type: file.type || fileType // Use file.type if available, fallback to fieldType
            };
          });

          fileItems = mappedItems;
        } else {
          fileItems = [];
        }
      });
    }
  });
</script>

<div class="space-y-3">
  <!-- Field Header -->
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-2">
      <span class="text-sm font-medium">
        {field.label || 'Files'}
      </span>
      <Button
        type="button"
        variant="default"
        size="icon"
        class="h-6 w-6 rounded-full"
        onclick={(e) => openPicker(e)}
        title="Select {multiple ? 'files' : 'file'}"
        disabled={readonly}
      >
        <Plus class="h-3 w-3" />
      </Button>
    </div>

    <div class="flex min-w-0 flex-shrink-0 items-center gap-2">
      {#if Array.isArray(value) ? value.length > 0 : value}
        {#if selectedForDeletion.size > 0}
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onclick={deleteSelected}
            class="h-7 px-2"
          >
            <Trash2 class="mr-1 h-3 w-3" />
            Delete {selectedForDeletion.size}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onclick={clearSelection}
            class="h-7 px-2 text-xs"
          >
            Cancel
          </Button>
        {:else}
          <span class="text-muted-foreground text-sm">
            {#if Array.isArray(value)}
              {value.length} {value.length === 1 ? 'file' : 'files'}
            {:else}
              1 file
            {/if}
          </span>
          {#if (Array.isArray(value) ? value.length : 1) > 1}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onclick={selectAllVisible}
              class="h-7 px-2 text-xs"
            >
              Select all
            </Button>
          {:else}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onclick={() => handleSelect('')}
              class="h-7 px-2 text-xs"
            >
              <Trash2 class="mr-1 h-3 w-3" />
              Remove
            </Button>
          {/if}
        {/if}
      {:else}
        <span class="text-muted-foreground text-sm">
          No {multiple ? 'files' : 'file'} selected
        </span>
      {/if}
    </div>
  </div>

  <!-- Files Preview Area -->
  {#if Array.isArray(value) ? value.length > 0 : value}
    <div class="bg-muted/20 rounded-lg border p-3">
      {#if fileType === 'image'}
        <!-- Image Grid with Drag & Drop -->
        {#if fileItems.length > 1}
          <Grid
            items={fileItems}
            onItemsChange={handleFilesReorder}
            onItemRemove={handleFileRemove}
            showSelection={false}
            gridCols={6}
          >
            {#snippet children({
              item,
              dragHandleAttributes,
              handleRemoveItem,
              isSelected,
              onSelectItem,
              isDragging
            }: {
              item: { id: string; value: string; url: string; label: string; type: string };
              dragHandleAttributes: {
                draggable: boolean;
                ondragstart: (e: DragEvent) => void;
                ondragend: (e: DragEvent) => void;
                style: string;
              };
              handleRemoveItem: (itemId: string) => void;
              isSelected: boolean;
              onSelectItem: (checked: boolean) => void;
              isDragging: boolean;
            })}
              <!-- Unified file component handles all file types and missing files -->
              <FileWithControls
                src={item.type === 'image' ? getImage(item.value) : ''}
                alt={item.label}
                filename={item.label}
                fileType={item.type}
                aspectRatio="aspect-square"
                controls={['select', 'drag', 'copy', 'remove']}
                showSelection={true}
                selected={selectedForDeletion.has(item.value)}
                class="shadow-sm {isDragging ? 'opacity-50' : ''}"
                onSelect={() => toggleFileSelection(item.value)}
                onRemove={() => handleRemoveItem(item.id)}
                onCopy={copyFilename}
                {dragHandleAttributes}
              />
            {/snippet}
          </Grid>
        {:else if fileItems.length === 1}
          <!-- Single File Display -->
          {#each fileItems as item (item.value)}
            <FileWithControls
              src={item.type === 'image' ? getImage(item.value) : ''}
              alt={item.label}
              filename={item.label}
              fileType={item.type}
              aspectRatio="aspect-[4/3]"
              controls={['copy', 'remove']}
              class="w-full shadow-sm"
              onRemove={() => handleFileRemove(item.value)}
              onCopy={copyFilename}
            />
          {/each}
        {:else}
          <!-- Fallback: handle missing files when fileItems is empty but value exists -->
          {#if !multiple && value}
            <!-- Single missing file -->
            <FileWithControls
              src=""
              alt="Missing file"
              filename="unknown"
              {fileType}
              aspectRatio="aspect-[4/3]"
              controls={['remove']}
              class="w-full shadow-sm"
              onRemove={() => handleSelect('')}
            />
          {:else}
            <!-- Multiple missing/existing files grid -->
            <div class="grid grid-cols-6 gap-1.5">
              {#each Array.isArray(value) ? value : [value] as selectedValue (selectedValue)}
                {@const selectedFile = fileItems.find((f) => f.value === selectedValue)}
                <FileWithControls
                  src={selectedFile?.type === 'image' ? getImage(selectedFile.value) : ''}
                  alt={selectedFile?.label || 'Missing file'}
                  filename={selectedFile?.label || 'unknown'}
                  fileType={selectedFile?.type || fileType}
                  aspectRatio="aspect-square"
                  controls={['select', 'copy', 'remove']}
                  showSelection={true}
                  selected={selectedForDeletion.has(selectedValue)}
                  class="transition-shadow hover:shadow-md"
                  onSelect={() => toggleFileSelection(selectedValue)}
                  onRemove={() => handleFileRemove(selectedValue)}
                  onCopy={copyFilename}
                />
              {/each}
            </div>
          {/if}
        {/if}
      {:else}
        <!-- Document List - can also use FileWithControls for consistency -->
        <div class="grid grid-cols-1 gap-2">
          {#each fileItems as item (item.value)}
            <FileWithControls
              src={item.type === 'image' ? getImage(item.value) : ''}
              alt={item.label}
              filename={item.label}
              fileType={item.type}
              aspectRatio="aspect-[8/3]"
              controls={['select', 'copy', 'remove']}
              showSelection={true}
              selected={selectedForDeletion.has(item.value)}
              class="transition-shadow hover:shadow-sm"
              onSelect={() => toggleFileSelection(item.value)}
              onRemove={() => handleFileRemove(item.value)}
              onCopy={copyFilename}
            />
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <!-- File Picker Modal -->
  <FilePicker
    {value}
    {multiple}
    {fileType}
    {open}
    onSelect={handlePickerSelect}
    onOpenChange={handleSheetOpenChange}
  />
</div>
