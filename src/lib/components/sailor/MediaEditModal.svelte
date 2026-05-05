<script lang="ts">
  import { onMount } from 'svelte';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Textarea } from '$lib/components/ui/textarea';
  import { type FileType } from 'sailorcms/core/files/file';
  import { Save, Copy, ExternalLink } from '@lucide/svelte';
  import TagsInput from 'sailorcms/components/sailor/fields/TagsInput.svelte';
  import { toast } from 'sailorcms/core/ui/toast';
  import { m } from '$sailor/i18n';
  import { getFileTags, updateFile } from 'sailorcms/remote/files.remote.js';

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

  let altText = $derived(file?.alt || '');
  let title = $derived(file?.title || '');
  let description = $derived(file?.description || '');

  let fileTags: { id: string; name: string }[] = $state([]);
  let saving = $state(false);
  let loadingTags = $state(false);

  onMount(() => {
    if (file) loadFileTags();
  });

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

      toast.success(m.toast_file_updated());
      onClose();
    } catch (error) {
      console.error('Failed to save file:', error);
      toast.error(m.toast_file_update_failed());
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
  <Dialog.Content class="max-h-[90vh] overflow-x-hidden overflow-y-auto sm:max-w-3xl">
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
                ? m.media_edit_image()
                : file.mime_type?.startsWith('video/')
                  ? m.media_edit_video()
                  : file.mime_type === 'application/pdf'
                    ? m.media_edit_document()
                    : file.mime_type?.includes('spreadsheet') || file.mime_type?.includes('excel')
                      ? m.media_edit_spreadsheet()
                      : file.mime_type?.includes('presentation') ||
                          file.mime_type?.includes('powerpoint')
                        ? m.media_edit_presentation()
                        : m.media_edit_file()}
            {/if}
          {:else}
            {m.media_edit_default_title()}
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
                  toast.success(m.toast_filename_copied());
                } catch {
                  toast.error(m.toast_filename_copy_failed());
                }
              }}
              title={m.media_edit_copy_filename_title()}
            >
              <Copy class="h-4 w-4" />
            </button>
            <a
              href={file.url}
              target="_blank"
              rel="noopener noreferrer"
              class="text-muted-foreground hover:text-foreground inline-flex p-1 transition-colors"
              title={m.media_edit_view_original()}
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
          <div
            class="bg-muted/40 flex max-h-96 items-center justify-center overflow-hidden rounded-lg border"
          >
            <img
              src={file.url}
              alt={file.alt || file.name}
              class="max-h-96 w-auto max-w-full object-contain"
            />
          </div>
        {/if}

        <!-- Form Fields -->
        <div class="grid gap-4">
          <!-- Alt Text -->
          <div class="space-y-2">
            <Label for="alt-text">
              {m.media_edit_alt_text()}
              <span class="text-muted-foreground ml-1 text-xs">
                {m.media_edit_alt_chars({ current: altTextLength, max: 125 })}
              </span>
            </Label>
            <Textarea
              id="alt-text"
              bind:value={altText}
              placeholder={m.media_edit_alt_placeholder()}
              class="min-h-20 resize-none"
              disabled={saving}
            />
            {#if isAltTextLong}
              <p class="text-xs text-amber-600">
                {m.media_edit_alt_long_warning()}
              </p>
            {/if}
          </div>

          <!-- Title -->
          <div class="space-y-2">
            <Label for="title">{m.media_edit_title_label()}</Label>
            <Input
              id="title"
              bind:value={title}
              placeholder={m.media_edit_title_placeholder()}
              disabled={saving}
            />
          </div>

          <!-- Description -->
          <div class="space-y-2">
            <Label for="description">{m.media_edit_description_label()}</Label>
            <Textarea
              id="description"
              bind:value={description}
              placeholder={m.media_edit_description_placeholder()}
              class="min-h-16 resize-none"
              disabled={saving}
            />
          </div>

          <!-- Tags -->
          <div class="space-y-2">
            <Label>{m.media_edit_tags_label()}</Label>
            {#if loadingTags}
              <div class="text-muted-foreground flex items-center gap-2 text-sm">
                <div
                  class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                ></div>
                {m.media_edit_tags_loading()}
              </div>
            {:else}
              <TagsInput
                value={fileTags}
                placeholder={m.media_edit_tags_placeholder()}
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
        {m.media_edit_save()}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
