<script lang="ts">
  import { Separator } from '$lib/components/ui/separator/index.js';
  import * as Sidebar from '$lib/components/ui/sidebar/index.js';
  import Breadcrumbs from '$lib/components/sailor/Breadcrumbs.svelte';
  import { page } from '$app/state';

  let { children } = $props();
</script>

<header
  class="bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40 flex h-(--header-height) shrink-0 items-center gap-2 border-b backdrop-blur transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)"
>
  <div class="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
    <Sidebar.Trigger class="-ml-1" />
    <Separator orientation="vertical" class="mx-2 data-[orientation=vertical]:h-4" />
    <Breadcrumbs title={page.data.page?.title} />
    <div class="ml-auto flex items-center gap-2">
      <!-- Route-specific actions -->
      {@render children?.()}
    </div>
  </div>
</header>
