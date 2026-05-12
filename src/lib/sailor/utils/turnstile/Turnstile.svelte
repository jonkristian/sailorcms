<script lang="ts">
  import { onMount } from 'svelte';
  import { env } from '$env/dynamic/public';

  let {
    token = $bindable(''),
    theme = 'auto'
  }: {
    token?: string;
    theme?: 'auto' | 'light' | 'dark';
  } = $props();

  const siteKey = env.PUBLIC_TURNSTILE_SITE_KEY;
  let container: HTMLDivElement | undefined = $state();
  let widgetId: string | undefined;

  onMount(() => {
    if (!siteKey || !container) return;

    function render() {
      const w = (window as unknown as { turnstile?: TurnstileApi }).turnstile;
      if (!w || !container || !siteKey) return;
      widgetId = w.render(container, {
        sitekey: siteKey,
        theme,
        callback: (t) => (token = t),
        'expired-callback': () => (token = ''),
        'error-callback': () => (token = '')
      });
    }

    const existing = (window as unknown as { turnstile?: TurnstileApi }).turnstile;
    if (existing) {
      render();
    } else {
      const cbName = `__sailorTurnstile_${Math.random().toString(36).slice(2)}`;
      (window as unknown as Record<string, unknown>)[cbName] = render;
      const script = document.createElement('script');
      script.src = `https://challenges.cloudflare.com/turnstile/v0/api.js?onload=${cbName}`;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    return () => {
      const w = (window as unknown as { turnstile?: TurnstileApi }).turnstile;
      if (widgetId && w) w.remove(widgetId);
    };
  });

  type TurnstileApi = {
    render: (
      el: HTMLElement,
      opts: {
        sitekey: string;
        theme?: 'auto' | 'light' | 'dark';
        callback?: (token: string) => void;
        'expired-callback'?: () => void;
        'error-callback'?: () => void;
      }
    ) => string;
    remove: (widgetId: string) => void;
    reset: (widgetId?: string) => void;
  };
</script>

{#if siteKey}
  <div bind:this={container}></div>
{/if}
