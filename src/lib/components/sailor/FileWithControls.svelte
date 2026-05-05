<script lang="ts">
  import { GripVertical, Copy, X, ImageOff, FileText, Video, RotateCcw } from '@lucide/svelte';
  import { Checkbox as CheckboxComponent } from 'sailorcms/components/ui/checkbox/index.js';
  import { m } from '$sailor/i18n';

  let {
    src,
    alt = '',
    filename = '',
    aspectRatio = 'aspect-square',
    controls = [],
    showSelection = false,
    selected = false,
    showFilename = true, // Control whether to show filename overlay
    mimeType = '', // Accept mimeType to determine file type
    deletedAt = null,
    onRemove,
    onRestore,
    onCopy,
    onSelect,
    onDragStart,
    onDragEnd,
    dragHandleAttributes = {},
    class: className = '',
    ...restProps
  }: {
    src: string;
    alt?: string;
    filename?: string;
    aspectRatio?: string;
    controls?: ('drag' | 'copy' | 'remove' | 'select')[];
    showSelection?: boolean;
    selected?: boolean;
    showFilename?: boolean; // Control whether to show filename overlay
    mimeType?: string; // MIME type from database
    deletedAt?: string | Date | null;
    onRemove?: () => void;
    onRestore?: () => void;
    onCopy?: (filename: string) => void;
    onSelect?: (checked: boolean) => void;
    onDragStart?: (e: DragEvent) => void;
    onDragEnd?: (e: DragEvent) => void;
    dragHandleAttributes?: Record<string, any>;
    class?: string;
    [key: string]: any;
  } = $props();

  async function handleCopy() {
    if (onCopy) {
      onCopy(filename);
    } else {
      try {
        await navigator.clipboard.writeText(filename);
      } catch (err) {
        console.error('Failed to copy filename:', err);
      }
    }
  }

  function handleSelect() {
    if (onSelect) {
      onSelect(!selected);
    }
  }

  function handleDragStartInternal(e: DragEvent) {
    if (onDragStart) {
      onDragStart(e);
    }
  }

  function handleDragEndInternal(e: DragEvent) {
    if (onDragEnd) {
      onDragEnd(e);
    }
  }

  let isDocument = $derived(!mimeType?.startsWith('image/') && (!src || src === ''));

  // Track image loading state
  let imageError = $state(false);

  function handleImageLoad() {
    imageError = false;
  }

  function handleImageError() {
    imageError = true;
  }

  // Check if file is actually missing (not just a document with no src)
  let isMissingFile = $derived(
    (!src || src === '') &&
      (mimeType?.startsWith('image/') || filename === 'Missing file' || filename === 'unknown')
  );

  let isDeleted = $derived(deletedAt !== null && deletedAt !== undefined);
</script>

<div
  class="group bg-muted/40 relative {aspectRatio} overflow-hidden rounded border {className}"
  {...restProps}
>
  {#if isMissingFile}
    <!-- Missing file - empty src -->
    <div
      class="bg-muted text-muted-foreground flex h-full w-full flex-col items-center justify-center"
      class:opacity-50={selected}
    >
      <ImageOff class="mb-2 h-6 w-6" />
      {#if showFilename}
        <span class="px-2 text-center text-xs">{m.file_controls_missing()}</span>
      {/if}
    </div>
  {:else if isDocument}
    <!-- Non-image file (document, video, etc.) -->
    <div
      class="bg-muted text-muted-foreground flex h-full w-full flex-col items-center justify-center"
      class:opacity-50={selected}
    >
      {#if mimeType?.startsWith('video/')}
        <Video class="h-6 w-6 {showFilename ? 'mb-2' : ''}" />
      {:else}
        <FileText class="h-6 w-6 {showFilename ? 'mb-2' : ''}" />
      {/if}
      {#if showFilename}
        <span class="max-w-full truncate px-2 text-center text-xs"
          >{filename ||
            (mimeType?.startsWith('video/')
              ? m.file_controls_video()
              : m.file_controls_document())}</span
        >
      {/if}
    </div>
  {:else if imageError}
    <!-- Image failed to load -->
    <div
      class="bg-muted text-muted-foreground flex h-full w-full flex-col items-center justify-center"
      class:opacity-50={selected}
    >
      <ImageOff class="h-6 w-6 {showFilename ? 'mb-2' : ''}" />
      {#if showFilename}
        <span class="px-2 text-center text-xs">{m.file_controls_missing()}</span>
      {/if}
    </div>
  {:else}
    <!-- Valid image -->
    <img
      {src}
      {alt}
      class="h-full w-full object-contain"
      class:opacity-50={selected}
      onload={handleImageLoad}
      onerror={handleImageError}
    />
  {/if}

  {#if isDeleted}
    {#if onRestore}
      <button
        type="button"
        class="absolute right-2 bottom-2 flex items-center gap-1 rounded bg-red-600/90 px-1.5 py-0.5 text-[10px] font-medium text-white shadow-sm hover:bg-red-600"
        title={m.file_controls_restore_title()}
        onclick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onRestore?.();
        }}
      >
        <RotateCcw class="h-3 w-3" />
        {m.file_controls_restore()}
      </button>
    {:else}
      <div
        class="absolute right-2 bottom-2 rounded bg-red-600/90 px-1.5 py-0.5 text-[10px] font-medium text-white shadow-sm"
        title={m.file_controls_in_recovery_title()}
      >
        {m.file_controls_in_recovery()}
      </div>
    {/if}
  {/if}

  <!-- Control buttons overlay - top right like file-picker -->
  {#if controls.length > 0}
    <div
      class="absolute top-2 right-2 flex items-center gap-1 rounded-md bg-black/70 p-1 opacity-0 transition-opacity group-hover:opacity-100"
    >
      <!-- Selection checkbox -->
      {#if controls.includes('select') && showSelection}
        <div
          class="flex cursor-pointer items-center justify-center rounded p-1 hover:bg-white/20"
          onclick={handleSelect}
          onkeydown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleSelect();
            }
          }}
          tabindex="0"
          role="button"
          aria-label={m.file_controls_select_image()}
        >
          <CheckboxComponent
            checked={selected}
            class="h-3 w-3 border-white data-[state=checked]:border-white data-[state=checked]:bg-white data-[state=checked]:text-black"
          />
        </div>
      {/if}

      <!-- Drag handle - only show for existing files -->
      {#if controls.includes('drag') && !isMissingFile}
        <div
          class="flex cursor-grab items-center justify-center rounded p-1 hover:bg-white/20"
          role="button"
          tabindex="0"
          aria-label={m.file_controls_drag_handle()}
          {...dragHandleAttributes}
          ondragstart={dragHandleAttributes.ondragstart || handleDragStartInternal}
          ondragend={dragHandleAttributes.ondragend || handleDragEndInternal}
        >
          <GripVertical class="h-3 w-3 text-white" />
        </div>
      {/if}

      <!-- Copy filename button - only show if we have a real filename -->
      {#if controls.includes('copy') && filename && !isMissingFile && filename !== 'Missing file' && filename !== 'unknown'}
        <div
          class="flex cursor-pointer items-center justify-center rounded p-1 hover:bg-white/20"
          onclick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleCopy();
          }}
          onkeydown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              handleCopy();
            }
          }}
          tabindex="0"
          role="button"
          aria-label={m.file_controls_copy_filename()}
        >
          <Copy class="h-3 w-3 text-white" />
        </div>
      {/if}

      <!-- Remove button -->
      {#if controls.includes('remove')}
        <div
          class="flex cursor-pointer items-center justify-center rounded p-1 hover:bg-white/20"
          onclick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove?.();
          }}
          onkeydown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              onRemove?.();
            }
          }}
          tabindex="0"
          role="button"
          aria-label={m.file_controls_remove_image()}
        >
          <X class="h-3 w-3 text-white" />
        </div>
      {/if}
    </div>
  {/if}
</div>
