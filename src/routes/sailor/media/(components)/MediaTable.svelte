<script lang="ts">
  import { Badge } from '$lib/components/ui/badge';
  import { Copy, FileText, Trash2 } from '@lucide/svelte';
  import { toast } from '$sailor/core/ui/toast';
  import { formatFileSize, type FileType } from '$sailor/core/files/file';
  import FileWithControls from '$lib/components/sailor/FileWithControls.svelte';
  import { formatTableDate } from '$sailor/core/utils/date';
  import { DataTable } from '$lib/components/sailor/table';
  import type { Tag } from '$sailor/core/types/tag';

  // Type for the file data with tags (matches server response)
  type FileWithTags = FileType & {
    tags?: Tag[];
    authorName?: string | null;
  };

  let { files, selectedItems, onSelect, onSelectAll, onEdit, onDelete } = $props<{
    files: FileWithTags[];
    selectedItems: string[];
    onSelect: (id: string) => void;
    onSelectAll: (selected: boolean) => void;
    onEdit: (file: FileWithTags) => void;
    onDelete: (id: string) => void;
  }>();

  // Define columns for DataTable
  const columns = [
    { key: 'preview', label: '', width: 80 },
    { key: 'name', label: 'Name' },
    { key: 'type', label: 'Type', width: 100 },
    { key: 'size', label: 'Size', width: 80 },
    { key: 'author', label: 'Author', width: 120 },
    { key: 'tags', label: 'Tags' },
    { key: 'created_at', label: 'Created', width: 120 }
  ];

  function getFileTypeColor(type: string) {
    switch (type) {
      case 'image':
        return 'bg-blue-100 text-blue-800';
      case 'video':
        return 'bg-purple-100 text-purple-800';
      case 'document':
      case 'application':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }
</script>

<!-- DataTable with custom cell rendering -->
<DataTable {columns} items={files} selectable={true} {selectedItems} {onSelect} {onSelectAll}>
  {#snippet cellRenderer(item: any, column: any)}
    {#if column.key === 'preview'}
      <div class="h-16 w-16 shrink-0 overflow-hidden">
        <FileWithControls
          src={item.mime_type?.startsWith('image/') ? `${item.url}` : ''}
          alt={item.alt || item.name}
          filename={item.name}
          mimeType={item.mime_type}
          aspectRatio="aspect-square"
          controls={[]}
          showFilename={false}
          class="hover:border-primary cursor-pointer transition-colors"
          onclick={() => onEdit(item)}
        />
      </div>
    {:else if column.key === 'name'}
      <div class="max-w-xs min-w-0 space-y-1">
        <div class="truncate font-medium" title={item.name}>
          {item.name}
        </div>
        <div class="flex items-center gap-1">
          <button
            class="text-muted-foreground hover:text-foreground flex h-5 w-5 items-center justify-center p-0 transition-colors"
            onclick={async () => {
              try {
                await navigator.clipboard.writeText(item.url);
                toast.success('URL copied to clipboard');
              } catch {
                toast.error('Failed to copy URL');
              }
            }}
            title={item.url}
          >
            <Copy class="h-4 w-4" />
          </button>
          <button
            class="text-muted-foreground flex h-5 w-5 items-center justify-center p-0 transition-colors hover:text-red-600"
            onclick={() => onDelete(item.id)}
            title="Delete file"
          >
            <Trash2 class="h-4 w-4" />
          </button>
        </div>
      </div>
    {:else if column.key === 'type'}
      {@const type = item.mime_type?.split('/')[0] || 'other'}
      <Badge class={getFileTypeColor(type)}>
        {type === 'application' ? 'document' : type}
      </Badge>
    {:else if column.key === 'size'}
      <span class="text-sm">{formatFileSize(item.size)}</span>
    {:else if column.key === 'author'}
      <span class="text-sm">{item.authorName || item.author || '-'}</span>
    {:else if column.key === 'created_at'}
      <span class="text-sm">{formatTableDate(item.created_at)}</span>
    {:else if column.key === 'tags'}
      <div class="flex flex-wrap gap-1">
        {#each item.tags || [] as tag}
          <Badge variant="outline" class="text-xs">{tag.name}</Badge>
        {/each}
      </div>
    {:else}
      {item[column.key] || '-'}
    {/if}
  {/snippet}

  {#snippet empty()}
    <div class="text-center">
      <FileText class="text-muted-foreground mx-auto my-2 size-6" />
      <h3 class="text-sm font-medium">No files found.</h3>
    </div>
  {/snippet}
</DataTable>
