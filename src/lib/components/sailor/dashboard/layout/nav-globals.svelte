<script lang="ts">
  import { page } from '$app/state';
  import * as Sidebar from 'sailorcms/components/ui/sidebar/index.js';
  import { Skeleton } from 'sailorcms/components/ui/skeleton/index.js';
  import { m } from '$sailor/i18n';
  import Settings from '@lucide/svelte/icons/settings';
  import { getLucideIcon } from 'sailorcms/core/ui/lucide-icon';

  type Global = {
    id: string;
    name_plural: string;
    slug: string;
    icon?: string;
  };

  let { globals = [], loading = false }: { globals: Global[]; loading?: boolean } = $props();

  const items = $derived(() => {
    return globals.map((global: Global) => ({
      id: global.id,
      name: global.name_plural,
      url: `/sailor/globals/${global.slug}`,
      icon: global.icon
    }));
  });

  function isActive(url: string) {
    return page.url.pathname.startsWith(url);
  }
</script>

{#if loading || items().length > 0}
  <Sidebar.Group>
    <Sidebar.GroupLabel class="group-data-[collapsible=icon]:hidden"
      >{m.nav_globals()}</Sidebar.GroupLabel
    >
    <Sidebar.GroupContent>
      {#if loading}
        <!-- Skeleton loading state -->
        <Sidebar.Menu>
          {#each Array(2) as _, i}
            <Sidebar.MenuItem>
              <Sidebar.MenuButton>
                <Skeleton class="h-4 w-4 rounded" />
                <Skeleton class="h-4 w-24" />
              </Sidebar.MenuButton>
            </Sidebar.MenuItem>
          {/each}
        </Sidebar.Menu>
      {:else if items().length > 0}
        <Sidebar.Menu>
          {#each items() as item (item.id)}
            <Sidebar.MenuItem>
              <Sidebar.MenuButton tooltipContent={item.name} isActive={isActive(item.url)}>
                {#snippet child({ props })}
                  {@const IconComponent = getLucideIcon(item.icon) ?? Settings}
                  <a href={item.url} {...props}>
                    <IconComponent class="h-4 w-4" />
                    <span>{item.name}</span>
                  </a>
                {/snippet}
              </Sidebar.MenuButton>
            </Sidebar.MenuItem>
          {/each}
        </Sidebar.Menu>
      {/if}
    </Sidebar.GroupContent>
  </Sidebar.Group>
{/if}
