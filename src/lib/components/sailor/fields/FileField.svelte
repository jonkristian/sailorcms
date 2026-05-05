<script lang="ts">
  import FilePicker from 'sailorcms/components/sailor/files/file-picker.svelte';
  import { Button } from 'sailorcms/components/ui/button/index.js';
  import { Trash2, Plus } from '@lucide/svelte';
  import { getImage } from 'sailorcms/core/files/file';
  import Grid from 'sailorcms/components/sailor/dnd/Grid.svelte';
  import FileWithControls from 'sailorcms/components/sailor/FileWithControls.svelte';
  import { getFiles, restoreFile } from 'sailorcms/remote/files.remote.js';
  import { toast, toastResult } from 'sailorcms/core/ui/toast';
  import { m } from '$sailor/i18n';
  import { invalidateAll } from '$app/navigation';

  let {
    value = $bindable(''),
    field,
    onChange,
    required = false,
    readonly = false
  }: {
    value?: string | string[];
    field: any;
    onChange: (value: string | string[]) => void;
    required?: boolean;
    readonly?: boolean;
  } = $props();

  // Support both field.items (preferred) and field.file (legacy) for configuration
  let fileOptions = $derived(field.items || field.file || {});
  let multiple = $derived(fileOptions.multiple || false);
  let fileType = $derived(fileOptions.fileType || 'all');

  let selectedForDeletion: Set<string> = $state(new Set());
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

  async function handleRestore(fileId: string) {
    try {
      const result = await restoreFile({ fileId });
      if (toastResult(result, m.toast_file_restored, m.toast_restore_file_failed)) {
        await invalidateAll();
      }
    } catch {
      toast.error(m.toast_restore_file_failed());
    }
  }

  const fileValues = $derived(Array.isArray(value) ? value : value ? [value] : []);

  const fileItems: Array<{
    id: string;
    value: string;
    url: string;
    label: string;
    type: string;
    deletedAt: string | Date | null;
  }> = $derived.by(() => {
    if (fileValues.length === 0) return [];
    const result = getFiles({ ids: fileValues, limit: 50, type: fileType }).current;
    const files = result?.success ? ((result as any).files ?? []) : [];
    return fileValues.map((fv: string) => {
      const f = files.find((file: any) => file.id === fv);
      if (!f) {
        return {
          id: fv,
          value: fv,
          url: '',
          label: m.file_field_missing_name(),
          type: fileType,
          deletedAt: null
        };
      }
      return {
        id: fv,
        value: fv,
        url: f.url,
        label: f.name || m.file_field_unknown_name(),
        type: f.mime_type?.includes('image') ? 'image' : 'document',
        deletedAt: f.deleted_at ?? null
      };
    });
  });
</script>

<div class="space-y-3">
  <!-- Field Header -->
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-2">
      <span class="text-sm font-medium">
        {field.label || m.file_field_label()}
      </span>
      <Button
        type="button"
        variant="default"
        size="icon"
        class="h-6 w-6 rounded-full"
        onclick={(e) => openPicker(e)}
        title={multiple ? m.file_field_select_many_title() : m.file_field_select_one_title()}
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
            {m.file_field_delete_count({ count: selectedForDeletion.size })}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onclick={clearSelection}
            class="h-7 px-2 text-xs"
          >
            {m.file_field_cancel()}
          </Button>
        {:else}
          <span class="text-muted-foreground text-sm">
            {#if Array.isArray(value)}
              {value.length === 1
                ? m.file_field_count_one()
                : m.file_field_count_many({ count: value.length })}
            {:else}
              {m.file_field_count_one()}
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
              {m.file_field_select_all()}
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
              {m.file_field_remove()}
            </Button>
          {/if}
        {/if}
      {:else}
        <span class="text-muted-foreground text-sm">
          {multiple ? m.file_field_no_many_selected() : m.file_field_no_one_selected()}
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
              item: {
                id: string;
                value: string;
                url: string;
                label: string;
                type: string;
                deletedAt: string | Date | null;
              };
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
                deletedAt={item.deletedAt}
                aspectRatio="aspect-square"
                controls={['select', 'drag', 'copy', 'remove']}
                showSelection={true}
                selected={selectedForDeletion.has(item.value)}
                class="shadow-sm {isDragging ? 'opacity-50' : ''}"
                onSelect={() => toggleFileSelection(item.value)}
                onRemove={() => handleRemoveItem(item.id)}
                onRestore={() => handleRestore(item.value)}
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
              deletedAt={item.deletedAt}
              aspectRatio="aspect-[4/3]"
              controls={['copy', 'remove']}
              class="w-full shadow-sm"
              onRemove={() => handleFileRemove(item.value)}
              onRestore={() => handleRestore(item.value)}
              onCopy={copyFilename}
            />
          {/each}
        {:else}
          <!-- Fallback: handle missing files when fileItems is empty but value exists -->
          {#if !multiple && value}
            <!-- Single missing file -->
            <FileWithControls
              src=""
              alt={m.file_field_missing_name()}
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
                  alt={selectedFile?.label || m.file_field_missing_name()}
                  filename={selectedFile?.label || 'unknown'}
                  fileType={selectedFile?.type || fileType}
                  deletedAt={selectedFile?.deletedAt ?? null}
                  aspectRatio="aspect-square"
                  controls={['select', 'copy', 'remove']}
                  showSelection={true}
                  selected={selectedForDeletion.has(selectedValue)}
                  class="transition-shadow hover:shadow-md"
                  onSelect={() => toggleFileSelection(selectedValue)}
                  onRemove={() => handleFileRemove(selectedValue)}
                  onRestore={() => handleRestore(selectedValue)}
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
              deletedAt={item.deletedAt}
              aspectRatio="aspect-[8/3]"
              controls={['select', 'copy', 'remove']}
              showSelection={true}
              selected={selectedForDeletion.has(item.value)}
              class="transition-shadow hover:shadow-sm"
              onSelect={() => toggleFileSelection(item.value)}
              onRemove={() => handleFileRemove(item.value)}
              onRestore={() => handleRestore(item.value)}
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
