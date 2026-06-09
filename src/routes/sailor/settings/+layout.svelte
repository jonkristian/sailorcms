<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import {
    Database,
    Cloud,
    Upload,
    Settings,
    Users,
    Tags,
    Mail,
    Search,
    Menu
  } from '@lucide/svelte';
  import { m } from '$sailor/i18n';
  import * as Sheet from 'sailorcms/components/ui/sheet/index.js';
  import { Button } from 'sailorcms/components/ui/button/index.js';

  const { children } = $props();

  // Mobile drawer open state. Closed on every nav so consumers don't have
  // to manage it explicitly; the existing `goto` callbacks already trigger
  // a page change which we hook into via $effect on $page.url.pathname below.
  let mobileNavOpen = $state(false);

  // Navigation items for settings
  const navItems = $derived([
    {
      label: m.settings_nav_settings_label(),
      href: '/sailor/settings',
      icon: Settings,
      description: m.settings_nav_settings_description()
    },
    {
      label: m.settings_nav_roles_label(),
      href: '/sailor/settings/roles',
      icon: Users,
      description: m.settings_nav_roles_description()
    },
    {
      label: m.settings_nav_database_label(),
      href: '/sailor/settings/database',
      icon: Database,
      description: m.settings_nav_database_description()
    },
    {
      label: m.settings_nav_storage_label(),
      href: '/sailor/settings/storage',
      icon: Cloud,
      description: m.settings_nav_storage_description()
    },
    {
      label: m.settings_nav_mail_label(),
      href: '/sailor/settings/mail',
      icon: Mail,
      description: m.settings_nav_mail_description()
    },
    {
      label: m.settings_nav_tags_label(),
      href: '/sailor/settings/tags',
      icon: Tags,
      description: m.settings_nav_tags_description()
    },
    {
      label: m.settings_nav_search_label(),
      href: '/sailor/settings/search',
      icon: Search,
      description: m.settings_nav_search_description()
    },
    {
      label: m.settings_nav_import_label(),
      href: '/sailor/settings/import',
      icon: Upload,
      description: m.settings_nav_import_description()
    }
  ]);

  // Check if current route matches nav item
  function isActive(href: string) {
    return $page.url.pathname === href;
  }
</script>

<!-- Mobile-only nav trigger. The sticky right-side nav below `md` would eat
     30–40% of the viewport and squeeze content into ~250px on phones, so on
     mobile we hide the sidebar and open it as a sheet from the right. -->
<div class="flex items-center gap-2 px-6 pt-2 md:hidden">
  <Sheet.Root bind:open={mobileNavOpen}>
    <Sheet.Trigger>
      {#snippet child({ props })}
        <Button {...props} variant="outline" size="sm">
          <Menu class="mr-2 h-4 w-4" />
          {m.settings_nav_open_menu()}
        </Button>
      {/snippet}
    </Sheet.Trigger>
    <Sheet.Content side="right" class="w-72 p-0">
      <Sheet.Header class="border-b px-4 py-3">
        <Sheet.Title>{m.settings_nav_open_menu()}</Sheet.Title>
      </Sheet.Header>
      <div class="space-y-1 overflow-y-auto p-3">
        {#each navItems as item (item.href)}
          {@const active = isActive(item.href)}
          <button
            class="hover:bg-muted flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors {active
              ? 'bg-muted text-foreground font-medium'
              : 'text-muted-foreground hover:text-foreground'}"
            onclick={() => {
              mobileNavOpen = false;
              goto(item.href);
            }}
          >
            <item.icon class="h-4 w-4 flex-shrink-0" />
            <div class="min-w-0 flex-1">
              <div class="text-sm {active ? 'font-medium' : ''}">{item.label}</div>
              <div class="text-muted-foreground truncate text-xs">{item.description}</div>
            </div>
          </button>
        {/each}
      </div>
    </Sheet.Content>
  </Sheet.Root>
</div>

<div class="flex min-h-[calc(100vh-8rem)] px-6">
  <!-- Main Content Area -->
  <div class="flex flex-1 flex-col md:pr-6">
    {@render children()}
  </div>

  <!-- Right Sidebar Navigation — md+ only. Phones get the sheet trigger above. -->
  <div class="hidden md:contents">
    <div class="bg-border w-px"></div>

    <div class="bg-background sticky top-16 w-70 self-start pl-6">
      <div class="h-[calc(100vh-8rem)] overflow-y-auto pt-4">
        <div class="space-y-2">
          {#each navItems as item (item.href)}
            {@const active = isActive(item.href)}
            <button
              class="hover:bg-muted flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors {active
                ? 'bg-muted text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground'}"
              onclick={() => goto(item.href)}
            >
              <item.icon class="h-4 w-4 flex-shrink-0" />
              <div class="min-w-0 flex-1">
                <div class="text-sm {active ? 'font-medium' : ''}">{item.label}</div>
                <div class="text-muted-foreground truncate text-xs">{item.description}</div>
              </div>
            </button>
          {/each}
        </div>
      </div>
    </div>
  </div>
</div>
