<script lang="ts">
  import { Badge } from 'sailorcms/components/ui/badge/index.js';
  import { Copy, FileText, Trash2 } from '@lucide/svelte';
  import { toast } from 'sailorcms/core/ui/toast';
  import { m } from '$sailor/i18n';
  import { formatFileSize, type FileType } from 'sailorcms/core/files/file';
  import FileWithControls from 'sailorcms/components/sailor/FileWithControls.svelte';
  import { formatTableDate } from 'sailorcms/core/utils/date';
  import { getUserLocale } from 'sailorcms/core/ui/user-locale';
  import { getFileTypeBadge } from 'sailorcms/core/ui/file-type-badge';
  import DataTable from 'sailorcms/components/sailor/table/DataTable.svelte';
  import type { Tag } from 'sailorcms/core/types/tag';

  // Type for the file data with tags (matches server response)
  type FileWithTags = FileType & {
    tags?: Tag[];
    authorName?: string | null;
  };

  let {
    files,
    selectedItems,
    onSelect,
    onSelectAll,
    onEdit,
    onDelete
  }: {
    files: FileWithTags[];
    selectedItems: string[];
    onSelect: (id: string) => void;
    onSelectAll: (selected: boolean) => void;
    onEdit: (file: FileWithTags) => void;
    onDelete: (id: string) => void;
  } = $props();

  // Define columns for DataTable
  const columns = $derived([
    { key: 'preview', label: '', width: 80 },
    { key: 'name', label: m.media_col_name() },
    { key: 'type', label: m.media_col_type(), width: 100 },
    { key: 'size', label: m.media_col_size(), width: 80 },
    { key: 'author', label: m.media_col_author(), width: 120 },
    { key: 'tags', label: m.media_col_tags() },
    { key: 'created_at', label: m.media_col_created(), width: 120 }
  ]);
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
      <div class="min-w-0 space-y-1">
        <div class="truncate font-medium" title={item.name}>
          {item.name}
        </div>
        <div class="flex items-center gap-1">
          <button
            class="text-muted-foreground hover:text-foreground flex h-5 w-5 items-center justify-center p-0 transition-colors"
            onclick={async () => {
              try {
                await navigator.clipboard.writeText(item.url);
                toast.success(m.toast_url_copied());
              } catch {
                toast.error(m.toast_copy_url_failed());
              }
            }}
            title={item.url}
          >
            <Copy class="h-4 w-4" />
          </button>
          <button
            class="text-muted-foreground flex h-5 w-5 items-center justify-center p-0 transition-colors hover:text-red-600"
            onclick={() => onDelete(item.id)}
            title={m.media_delete_file_title()}
          >
            <Trash2 class="h-4 w-4" />
          </button>
        </div>
      </div>
    {:else if column.key === 'type'}
      {@const badge = getFileTypeBadge(item.mime_type)}
      <Badge class={badge.classes}>{badge.label}</Badge>
    {:else if column.key === 'size'}
      <span class="text-sm">{formatFileSize(item.size)}</span>
    {:else if column.key === 'author'}
      <span class="text-sm">{item.authorName || item.author || '-'}</span>
    {:else if column.key === 'created_at'}
      <span class="text-sm">{formatTableDate(item.created_at, getUserLocale())}</span>
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
      <h3 class="text-sm font-medium">{m.media_empty_no_files()}</h3>
    </div>
  {/snippet}
</DataTable>
