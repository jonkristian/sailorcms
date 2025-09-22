<script lang="ts">
  import type LucideIcon from '@lucide/svelte/icons/database';
  import * as Sidebar from '$lib/components/ui/sidebar/index.js';
  import type { WithoutChildren } from '$lib/sailor/utils.js';
  import type { ComponentProps } from 'svelte';
  import { page } from '$app/state';

  let {
    items,
    ...restProps
  }: { items: { title: string; url: string; icon: typeof LucideIcon }[] } & WithoutChildren<
    ComponentProps<typeof Sidebar.Group>
  > = $props();

  function isActive(url: string) {
    return page.url.pathname.startsWith(url);
  }
</script>

<Sidebar.Group {...restProps}>
  <Sidebar.GroupContent>
    <Sidebar.Menu>
      {#each items as item (item.title)}
        <Sidebar.MenuItem>
          <Sidebar.MenuButton tooltipContent={item.title} isActive={isActive(item.url)}>
            {#snippet child({ props })}
              <a href={item.url} {...props}>
                <item.icon class="h-4 w-4" />
                <span>{item.title}</span>
              </a>
            {/snippet}
          </Sidebar.MenuButton>
        </Sidebar.MenuItem>
      {/each}
    </Sidebar.Menu>
  </Sidebar.GroupContent>
</Sidebar.Group>
