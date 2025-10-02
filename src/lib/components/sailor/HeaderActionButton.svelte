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
</script>

{#if href}
  <a
    {href}
    target="_blank"
    rel="noopener noreferrer"
    {title}
    class="hover:bg-muted inline-flex h-8 w-8 items-center justify-center rounded-md text-sm font-medium transition-colors"
  >
    <IconComponent class="h-4 w-4"></IconComponent>
  </a>
{:else}
  <Button variant="ghost" size="icon" {onclick} {title} class="hover:bg-muted h-8 w-8">
    <IconComponent class="h-4 w-4"></IconComponent>
  </Button>
{/if}
