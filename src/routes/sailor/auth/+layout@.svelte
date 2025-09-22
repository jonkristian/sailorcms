<script lang="ts">
  import { Toaster } from 'svelte-sonner';
  import { ModeWatcher } from 'mode-watcher';
  import ThemeToggle from '$lib/components/sailor/ThemeToggle.svelte';
  import '$sailor/styles/sailor.css';

  let { children } = $props();
</script>

<div class="relative min-h-screen">
  <div class="absolute top-4 right-4">
    <ThemeToggle />
  </div>
  <div class="flex min-h-screen items-center justify-center p-4">
    {@render children()}
  </div>
</div>

<Toaster />
<ModeWatcher />
