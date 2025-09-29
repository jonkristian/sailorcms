<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Textarea } from '$lib/components/ui/textarea';
  import { type FileType } from '$sailor/core/files/file';
  import { Save, Copy, ExternalLink } from '@lucide/svelte';
  import TagsInput from '$lib/components/sailor/fields/TagsInput.svelte';
  import { toast } from '$sailor/core/ui/toast';
  import { getFileTags, updateFile } from '$sailor/remote/files.remote.js';

  // Props
  let {
    open = $bindable(),
    file = null,
    onClose = () => {},
    onSave = async () => {}
  }: {
    open?: boolean;
    file?: FileType | null;
    onClose?: () => void;
    onSave?: () => Promise<void>;
  } = $props();

  // State
  let altText = $state('');
  let title = $state('');
  let description = $state('');
  let fileTags = $state<{ id: string; name: string }[]>([]);
  let saving = $state(false);
  let loadingTags = $state(false);

  // Track file ID to prevent unnecessary tag loading
  let currentFileId = $state<string | null>(null);

  // Update form when file changes
  $effect(() => {
    if (file) {
      altText = file.alt || '';
      title = file.title || '';
      description = file.description || '';

      // Only load tags if file ID has changed
      if (file.id !== currentFileId) {
        currentFileId = file.id;
        loadFileTags();
      }
    } else {
      resetForm();
      currentFileId = null;
    }
  });

  function resetForm() {
    altText = '';
    title = '';
    description = '';
    fileTags = [];
  }

  async function loadFileTags() {
    if (!file) return;

    try {
      loadingTags = true;
      const result = await getFileTags({ fileId: file.id });
      if (result.success) {
        fileTags = result.tags || [];
      }
    } catch (error) {
      console.error('Failed to load tags:', error);
    } finally {
      loadingTags = false;
    }
  }

  async function handleSave() {
    if (!file || saving) return;

    try {
      saving = true;

      const result = await updateFile({
        fileId: file.id,
        updates: {
          alt: altText,
          title: title || undefined,
          description: description || undefined
        },
        tags: fileTags.map((tag) => tag.name)
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      await onSave();

      toast.success('File updated successfully');
      onClose();
    } catch (error) {
      console.error('Failed to save file:', error);
      toast.error('Failed to update file');
    } finally {
      saving = false;
    }
  }

  function handleClose() {
    if (saving) return;
    onClose();
  }

  function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // Character count for alt text (accessibility recommendation: 125 chars)
  let altTextLength = $derived(altText.length);
  let isAltTextLong = $derived(altTextLength > 125);

  function handleTagsChange(tags: { id: string; name: string }[]) {
    fileTags = tags;
  }
</script>

<Dialog.Root bind:open onOpenChange={(newOpen) => !newOpen && handleClose()}>
  <Dialog.Content class="max-h-[90vh] max-w-4xl overflow-x-hidden overflow-y-auto">
    <Dialog.Header class="overflow-hidden">
      <div class="min-w-0 space-y-2">
        <Dialog.Title
          class="max-w-2xl truncate overflow-hidden !leading-normal text-ellipsis whitespace-nowrap"
          title={file?.title || file?.name}
        >
          {#if file}
            {#if file.title}
              {file.title}
            {:else if file.name}
              {file.name}
            {:else}
              {file.mime_type?.startsWith('image/')
                ? 'Image'
                : file.mime_type?.startsWith('video/')
                  ? 'Video'
                  : file.mime_type === 'application/pdf'
                    ? 'Document'
                    : file.mime_type?.includes('spreadsheet') || file.mime_type?.includes('excel')
                      ? 'Spreadsheet'
                      : file.mime_type?.includes('presentation') ||
                          file.mime_type?.includes('powerpoint')
                        ? 'Presentation'
                        : 'File'}
            {/if}
          {:else}
            Edit Media
          {/if}
        </Dialog.Title>
        {#if file}
          <div class="flex items-center gap-2">
            <span class="text-muted-foreground text-xs">{formatFileSize(file.size)}</span>
            <button
              class="text-muted-foreground hover:text-foreground p-1 transition-colors"
              onclick={async () => {
                try {
                  await navigator.clipboard.writeText(file.name);
                  toast.success('Filename copied to clipboard');
                } catch {
                  toast.error('Failed to copy filename');
                }
              }}
              title="Copy filename to clipboard"
            >
              <Copy class="h-4 w-4" />
            </button>
            <a
              href={file.url}
              target="_blank"
              rel="noopener noreferrer"
              class="text-muted-foreground hover:text-foreground inline-flex p-1 transition-colors"
              title="View original"
            >
              <ExternalLink class="h-4 w-4" />
            </a>
          </div>
        {/if}
      </div>
    </Dialog.Header>

    {#if file}
      <div class="space-y-6">
        <!-- Large Preview for Images -->
        {#if file.mime_type?.startsWith('image/')}
          <div class="overflow-hidden rounded-lg border">
            <img src={file.url} alt={file.alt || file.name} class="h-64 w-full object-cover" />
          </div>
        {/if}

        <!-- Form Fields -->
        <div class="grid gap-4">
          <!-- Alt Text -->
          <div class="space-y-2">
            <Label for="alt-text">
              Alt Text
              <span class="text-muted-foreground ml-1 text-xs">
                ({altTextLength}/125 chars)
              </span>
            </Label>
            <Textarea
              id="alt-text"
              bind:value={altText}
              placeholder="Describe this image for screen readers and SEO..."
              class="min-h-20 resize-none"
              disabled={saving}
            />
            {#if isAltTextLong}
              <p class="text-xs text-amber-600">
                Consider keeping alt text under 125 characters for better accessibility
              </p>
            {/if}
          </div>

          <!-- Title -->
          <div class="space-y-2">
            <Label for="title">Title</Label>
            <Input
              id="title"
              bind:value={title}
              placeholder="Optional title for this file"
              disabled={saving}
            />
          </div>

          <!-- Description -->
          <div class="space-y-2">
            <Label for="description">Description</Label>
            <Textarea
              id="description"
              bind:value={description}
              placeholder="Optional description or caption"
              class="min-h-16 resize-none"
              disabled={saving}
            />
          </div>

          <!-- Tags -->
          <div class="space-y-2">
            <Label>Tags</Label>
            {#if loadingTags}
              <div class="text-muted-foreground flex items-center gap-2 text-sm">
                <div
                  class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                ></div>
                Loading tags...
              </div>
            {:else}
              <TagsInput
                value={fileTags}
                placeholder="Type tag name and press Enter"
                scope="media"
                disabled={saving}
                onChange={handleTagsChange}
              />
            {/if}
          </div>
        </div>
      </div>
    {/if}

    <Dialog.Footer class="flex justify-end">
      <Button onclick={handleSave} disabled={saving || !file}>
        {#if saving}
          <div
            class="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          ></div>
        {:else}
          <Save class="mr-2 h-4 w-4" />
        {/if}
        Save
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
