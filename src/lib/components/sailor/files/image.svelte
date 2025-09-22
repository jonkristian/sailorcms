<script lang="ts">
  import { getFileUrl, type FileTransformOptions } from '$sailor/core/files/file';

  const {
    src,
    alt = '',
    className = '',
    width,
    height,
    quality = 80,
    format
  } = $props<{
    src: string | null | undefined;
    alt?: string;
    className?: string;
    width?: number;
    height?: number;
    quality?: number;
    format?: 'jpg' | 'png' | 'webp';
  }>();

  let imageUrl = $derived.by(() => {
    if (!src) return '';

    const options: FileTransformOptions = {
      transform: true,
      width,
      height,
      quality,
      format
    };

    // Always use getFileUrl - it now handles both local and cloud storage consistently
    return getFileUrl(src, options);
  });

  function handleError(event: Event) {
    const img = event.target as HTMLImageElement;
    // Fallback to a default image or hide
    img.style.display = 'none';
  }
</script>

{#if imageUrl}
  <img src={imageUrl} {alt} class={className} onerror={handleError} loading="lazy" />
{/if}
