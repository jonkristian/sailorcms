<script lang="ts">
  import { onMount } from 'svelte';
  import { Loader2 } from '@lucide/svelte';

  // Renders children immediately and lays a viewport-centered spinner over
  // the page until the browser signals an idle moment, then fades the
  // overlay out. Useful for masking initial-paint layout shifts caused by
  // async-mounting components (Tiptap editors, lazy imports, etc.).
  let {
    children,
    minMs = 0
  }: {
    children: any;
    minMs?: number; // optional minimum visible duration so the overlay doesn't flicker
  } = $props();

  let ready = $state(false);

  onMount(() => {
    const start = performance.now();
    const finish = () => {
      const elapsed = performance.now() - start;
      const wait = Math.max(0, minMs - elapsed);
      if (wait > 0) setTimeout(() => (ready = true), wait);
      else ready = true;
    };
    // requestIdleCallback fires once the browser has finished its initial
    // layout / paint / synchronous onMount work — exactly the window where
    // Tiptap-style editors finish initializing. Fall back to a short timeout
    // for browsers without it (Safari mostly).
    const ric = (window as any).requestIdleCallback;
    if (typeof ric === 'function') {
      ric(finish, { timeout: 500 });
    } else {
      setTimeout(finish, 200);
    }
  });
</script>

{@render children()}

<div
  class="bg-background/95 pointer-events-none fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm transition-opacity duration-200"
  class:opacity-0={ready}
  aria-hidden={ready}
  aria-live="polite"
>
  <Loader2 class="text-muted-foreground size-8 animate-spin" aria-label="Loading" />
</div>
