<script lang="ts">
  import { page } from '$app/state';
  import * as Sidebar from '$lib/components/ui/sidebar/index.js';

  let { items }: { items: { name: string; url: string; icon?: any }[] } = $props();

  function isActive(url: string) {
    return page.url.pathname === url;
  }
</script>

<Sidebar.Group>
  <Sidebar.GroupContent class="flex flex-col gap-2">
    <Sidebar.Menu>
      {#each items as item (item.name)}
        <Sidebar.MenuItem>
          <Sidebar.MenuButton tooltipContent={item.name} isActive={isActive(item.url)}>
            {#snippet child({ props })}
              <a href={item.url} {...props}>
                {#if item.icon}
                  <item.icon class="h-4 w-4" />
                {:else}
                  <div class="bg-muted h-4 w-4 rounded"></div>
                {/if}
                <span>{item.name}</span>
              </a>
            {/snippet}
          </Sidebar.MenuButton>
        </Sidebar.MenuItem>
      {/each}
    </Sidebar.Menu>
  </Sidebar.GroupContent>
</Sidebar.Group>
