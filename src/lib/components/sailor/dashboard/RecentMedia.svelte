<script lang="ts">
  import * as Card from '$lib/components/ui/card/index.js';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { FileImage, FileText, Video, Music, File, ExternalLink } from '@lucide/svelte';
  import { formatRelativeTime } from '$sailor/core/utils/date';
  import { formatFileSize } from '$sailor/utils/files';
  import type { File as FileType } from '$sailor/utils/types';

  interface Props {
    files: FileType[];
    limit?: number;
  }

  let { files = [], limit = 8 }: Props = $props();

  const limitedFiles = $derived(files.slice(0, limit));

  function getFileIcon(mimeType: string) {
    if (mimeType.startsWith('image/')) return FileImage;
    if (mimeType.startsWith('video/')) return Video;
    if (mimeType.startsWith('audio/')) return Music;
    if (mimeType.includes('text') || mimeType.includes('document')) return FileText;
    return File;
  }

  function getFileTypeColor(mimeType: string) {
    if (mimeType.startsWith('image/'))
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
    if (mimeType.startsWith('video/'))
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
    if (mimeType.startsWith('audio/'))
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
    return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
  }

  function getFileType(mimeType: string) {
    const type = mimeType.split('/')[0];
    return type.charAt(0).toUpperCase() + type.slice(1);
  }

  function handleFileClick(file: FileType) {
    window.open(file.url, '_blank');
  }
</script>

<Card.Root class="@container/media">
  <Card.Header>
    <div class="flex items-center justify-between">
      <div>
        <Card.Title>Recent Media</Card.Title>
        <Card.Description>Latest uploaded files</Card.Description>
      </div>
      <a
        href="/sailor/media"
        class="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm"
      >
        View all
        <ExternalLink class="h-3 w-3" />
      </a>
    </div>
  </Card.Header>
  <Card.Content class="p-0">
    {#if limitedFiles.length === 0}
      <div class="text-muted-foreground flex h-[200px] items-center justify-center">
        <div class="text-center">
          <FileImage class="mx-auto mb-2 h-8 w-8" />
          <p>No media files uploaded</p>
        </div>
      </div>
    {:else}
      <div class="grid grid-cols-4 gap-3 px-4">
        {#each limitedFiles as file}
          <div
            class="group bg-card relative cursor-pointer overflow-hidden rounded-lg border transition-all hover:shadow-md"
            onclick={() => handleFileClick(file)}
            onkeydown={(e) => e.key === 'Enter' && handleFileClick(file)}
            role="button"
            tabindex="0"
          >
            <!-- Visual Preview -->
            <div class="bg-muted relative flex aspect-square items-center justify-center">
              {#if file.mime_type.startsWith('image/')}
                <!-- Image thumbnail -->
                <img
                  src={file.url}
                  alt={file.alt || file.name}
                  class="h-full w-full object-cover"
                  loading="lazy"
                />
              {:else}
                {@const IconComponent = getFileIcon(file.mime_type)}
                <!-- File type icon for non-images -->
                <div class="text-muted-foreground flex flex-col items-center justify-center">
                  <IconComponent class="mb-2 size-8" />
                  <Badge variant="secondary" class="text-xs">
                    {getFileType(file.mime_type)}
                  </Badge>
                </div>
              {/if}

              <!-- Hover overlay with external link icon -->
              <div
                class="absolute inset-0 flex items-center justify-center bg-black/0 transition-all group-hover:bg-black/20"
              >
                <ExternalLink
                  class="size-6 text-white opacity-0 transition-opacity group-hover:opacity-100"
                />
              </div>
            </div>

            <!-- File Info -->
            <div class="p-3">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0 flex-1">
                  <h4
                    class="text-sm leading-tight font-medium"
                    title={file.name}
                    style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;"
                  >
                    {file.name}
                  </h4>
                  <div class="text-muted-foreground mt-1 flex items-center gap-2 text-xs">
                    <span>{formatFileSize(file.size || 0)}</span>
                    <span>•</span>
                    <span>{formatRelativeTime(file.created_at)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        {/each}
      </div>

      {#if files.length > limit}
        <div class="border-t p-4">
          <a
            href="/sailor/media"
            class="text-muted-foreground hover:text-foreground text-sm font-medium"
          >
            View all media ({files.length} total)
          </a>
        </div>
      {/if}
    {/if}
  </Card.Content>
</Card.Root>
