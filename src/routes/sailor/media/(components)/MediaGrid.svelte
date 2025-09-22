<script lang="ts">
  import { FileText } from '@lucide/svelte';
  import FileWithControls from '$lib/components/sailor/FileWithControls.svelte';
  import { getImage, type FileType } from '$sailor/core/files/file';
  import type { Tag } from '$sailor/core/types/tag';

  // Type for the file data with tags (matches server response)
  type FileWithTags = FileType & {
    tags?: Tag[];
  };

  let { files, selectedItems, onSelect, onEdit, onRemove, onCopy } = $props<{
    files: FileWithTags[];
    selectedItems: string[];
    onSelect: (id: string) => void;
    onEdit: (file: FileWithTags) => void;
    onRemove: (id: string) => void;
    onCopy: (filename: string) => void;
  }>();
</script>

<!-- Grid View using FileWithControls -->
<div class="grid grid-cols-2 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7">
  {#each files as file (file.id)}
    <FileWithControls
      src={file.mime_type?.startsWith('image/') ? getImage(file.id) : ''}
      alt={file.name}
      filename={file.name}
      mimeType={file.mime_type}
      aspectRatio="aspect-square"
      controls={['select', 'copy', 'remove']}
      showSelection={true}
      selected={selectedItems.includes(file.id)}
      class="cursor-pointer transition-all hover:shadow-md"
      onSelect={() => onSelect(file.id)}
      onRemove={() => onRemove(file.id)}
      {onCopy}
      onclick={() => onEdit(file)}
    />
  {/each}
</div>

{#if files.length === 0}
  <div class="py-12 text-center">
    <FileText class="text-muted-foreground mx-auto my-2 size-12" />
    <h3 class="text-lg font-medium">No files found.</h3>
  </div>
{/if}
