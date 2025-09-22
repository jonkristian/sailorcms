<script lang="ts">
  import * as Sidebar from '$lib/components/ui/sidebar/index.js';
  import NavMain from './nav-main.svelte';
  import NavUser from './nav-user.svelte';
  import NavCollections from './nav-collections.svelte';
  import NavGlobals from './nav-globals.svelte';
  import NavSecondary from './nav-secondary.svelte';
  import Settings from '@lucide/svelte/icons/settings';
  import HelpCircle from '@lucide/svelte/icons/help-circle';
  import Sailboat from '@lucide/svelte/icons/sailboat';
  import Folder from '@lucide/svelte/icons/folder';
  import Users from '@lucide/svelte/icons/users';
  import { page } from '$app/state';
  import emblemSvg from '$lib/sailor/assets/emblem.svg?raw';

  let {
    navData = { collections: [], globals: [], canViewSettings: false, loading: true },
    user: sessionUser,
    ...restProps
  } = $props<{
    navData?: { collections: any[]; globals: any[]; canViewSettings: boolean; loading: boolean };
    user?: any;
  }>();

  const user = $derived.by(() => {
    if (!sessionUser?.name) return null;
    return {
      name: sessionUser.name,
      email: sessionUser.email || '',
      avatar:
        sessionUser.image ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(sessionUser.name)}`
    };
  });

  const mainItems = [
    {
      name: 'Dashboard',
      url: '/sailor',
      icon: Sailboat
    },
    {
      name: 'Media Library',
      url: '/sailor/media',
      icon: Folder
    }
  ];

  const secondaryItems = $derived(() => {
    const items = [];

    // Add Users if user can view settings (admin)
    if (navData.canViewSettings) {
      items.push({
        title: 'Users',
        url: '/sailor/users',
        icon: Users
      });
    }

    // Add Settings if user can view settings
    if (navData.canViewSettings) {
      items.push({
        title: 'Settings',
        url: '/sailor/settings',
        icon: Settings
      });
    }

    // Always add help
    items.push({
      title: 'Get help',
      icon: HelpCircle,
      url: '/sailor/help'
    });

    return items;
  });
</script>

<Sidebar.Root collapsible="icon" {...restProps}>
  <Sidebar.Header>
    <Sidebar.Menu>
      <Sidebar.MenuItem>
        <Sidebar.MenuButton class="data-[slot=sidebar-menu-button]:!p-1.5">
          {#snippet child({ props })}
            <a href="/sailor" {...props}>
              <div class="h-5 w-5">{@html emblemSvg}</div>
              <span class="text-base font-semibold group-data-[collapsible=icon]:hidden"
                >Sailor CMS</span
              >
            </a>
          {/snippet}
        </Sidebar.MenuButton>
      </Sidebar.MenuItem>
    </Sidebar.Menu>
  </Sidebar.Header>
  <Sidebar.Content>
    <NavMain items={mainItems} />
    <NavCollections collections={navData.collections} loading={navData.loading} />
    <NavGlobals globals={navData.globals} loading={navData.loading} />
    <NavSecondary items={secondaryItems()} class="mt-auto" />
  </Sidebar.Content>
  <Sidebar.Footer>
    {#if user}
      <NavUser {user} />
    {/if}
  </Sidebar.Footer>
  <Sidebar.Rail />
</Sidebar.Root>
