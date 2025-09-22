<script lang="ts">
  import { page } from '$app/state';
  import * as Sidebar from '$lib/components/ui/sidebar/index.js';
  import { Skeleton } from '$lib/components/ui/skeleton/index.js';
  import FileText from '@lucide/svelte/icons/file-text';
  import Layout from '@lucide/svelte/icons/layout';
  import FolderTree from '@lucide/svelte/icons/folder-tree';
  import HelpCircle from '@lucide/svelte/icons/help-circle';
  import Menu from '@lucide/svelte/icons/menu';
  import Settings from '@lucide/svelte/icons/settings';
  import Image from '@lucide/svelte/icons/image';
  import Users from '@lucide/svelte/icons/users';
  import Calendar from '@lucide/svelte/icons/calendar';
  import Tag from '@lucide/svelte/icons/tag';
  import Database from '@lucide/svelte/icons/database';
  import Globe from '@lucide/svelte/icons/globe';
  import ShoppingCart from '@lucide/svelte/icons/shopping-cart';
  import BarChart from '@lucide/svelte/icons/bar-chart-3';

  const iconMap: Record<string, any> = {
    FileText,
    Layout,
    FolderTree,
    HelpCircle,
    Menu,
    Settings,
    Image,
    Users,
    Calendar,
    Tag,
    Database,
    Globe,
    ShoppingCart,
    BarChart
  };

  type Collection = {
    id: string;
    name_plural: string;
    slug: string;
    icon?: string;
  };

  let { collections = [], loading = false } = $props<{
    collections: Collection[];
    loading?: boolean;
  }>();

  const items = $derived(() => {
    return collections.map((collection: Collection) => ({
      id: collection.id,
      name: collection.name_plural,
      url: `/sailor/collections/${collection.slug}`,
      icon: collection.icon
    }));
  });

  function isActive(url: string) {
    return page.url.pathname.startsWith(url);
  }
</script>

{#if loading || items().length > 0}
  <Sidebar.Group>
    <Sidebar.GroupLabel class="group-data-[collapsible=icon]:hidden">Collections</Sidebar.GroupLabel
    >
    <Sidebar.GroupContent>
      {#if loading}
        <!-- Skeleton loading state -->
        <Sidebar.Menu>
          {#each Array(3) as _, i}
            <Sidebar.MenuItem>
              <Sidebar.MenuButton>
                <Skeleton class="h-4 w-4 rounded" />
                <Skeleton class="h-4 w-20" />
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
                  <a href={item.url} {...props}>
                    {#if item.icon && iconMap[item.icon]}
                      {@const IconComponent = iconMap[item.icon]}
                      <IconComponent class="h-4 w-4" />
                    {:else}
                      <FileText class="h-4 w-4" />
                    {/if}
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
