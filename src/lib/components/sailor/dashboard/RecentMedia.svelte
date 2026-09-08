<script lang="ts">
  import * as Card from 'sailorcms/components/ui/card/index.js';
  import { Badge } from 'sailorcms/components/ui/badge/index.js';
  import { FileImage, FileText, Video, Music, File, ExternalLink, Pencil } from '@lucide/svelte';
  import { formatRelativeTime } from 'sailorcms/core/utils/date';
  import { getUserLocale } from 'sailorcms/core/ui/user-locale';
  import { formatFileSize } from 'sailorcms/utils/files/index';
  import { type FileType } from 'sailorcms/core/files/file';
  import MediaEditModal from 'sailorcms/components/sailor/MediaEditModal.svelte';
  import { invalidateAll } from '$app/navigation';
  import { m } from '$sailor/i18n';

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

  let editModalOpen = $state(false);
  let editingFile: FileType | null = $state(null);

  // Opens the media library's own modal rather than the raw file in a new tab —
  // clicking a file in a CMS should show what the CMS knows about it, not hand
  // you the binary. The modal writes back alt, title and description, which is
  // why the dashboard query has to select them.
  function handleFileClick(file: FileType) {
    editingFile = file;
    editModalOpen = true;
  }
</script>

<Card.Root class="@container/media">
  <Card.Header>
    <div class="flex items-center justify-between">
      <div>
        <Card.Title>{m.dashboard_media_title()}</Card.Title>
        <Card.Description>{m.dashboard_media_description()}</Card.Description>
      </div>
      <a
        href="/sailor/media"
        class="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm"
      >
        {m.common_view_all()}
        <ExternalLink class="h-3 w-3" />
      </a>
    </div>
  </Card.Header>
  <Card.Content class="p-0">
    {#if limitedFiles.length === 0}
      <div class="text-muted-foreground flex h-[200px] items-center justify-center">
        <div class="text-center">
          <FileImage class="mx-auto mb-2 h-8 w-8" />
          <p>{m.dashboard_media_empty()}</p>
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
            <div
              class="bg-muted relative flex aspect-square items-center justify-center dark:bg-zinc-100"
            >
              {#if file.mime_type.startsWith('image/')}
                <!-- Image thumbnail -->
                <img
                  src={file.url}
                  alt={file.alt || file.name}
                  class="h-full w-full object-contain"
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

              <!-- The click opens the edit modal, so the affordance is a pencil.
                   It was an external-link glyph back when it opened the raw
                   file in a new tab, which now promises the wrong thing. -->
              <div
                class="absolute inset-0 flex items-center justify-center bg-black/0 transition-all group-hover:bg-black/20"
              >
                <Pencil
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
                    <span>{formatRelativeTime(file.created_at, getUserLocale())}</span>
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
            {m.dashboard_media_view_all({ total: files.length })}
          </a>
        </div>
      {/if}
    {/if}
  </Card.Content>
</Card.Root>

{#if editModalOpen && editingFile}
  <MediaEditModal
    bind:open={editModalOpen}
    file={editingFile}
    onSave={async () => {
      await invalidateAll();
      editModalOpen = false;
    }}
  />
{/if}
