<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import type { Component } from 'svelte';

  let {
    icon: IconComponent,
    title,
    onclick = undefined,
    href = undefined
  } = $props<{
    icon: Component;
    title: string;
    onclick?: () => void;
    href?: string;
  }>();

  function handleClick() {
    if (onclick) {
      onclick();
    } else if (href) {
      window.open(href, '_blank');
    }
  }
</script>

<Button variant="ghost" size="icon" onclick={handleClick} {title} class="hover:bg-muted h-8 w-8">
  <IconComponent class="h-4 w-4"></IconComponent>
</Button>
