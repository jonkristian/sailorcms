<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { Database, Cloud, Upload, Settings, Users, Tags } from '@lucide/svelte';

  const { children } = $props();

  // Navigation items for settings
  const navItems = [
    {
      label: 'Site Settings',
      href: '/sailor/settings',
      icon: Settings,
      description: 'Basic site information'
    },
    {
      label: 'Roles',
      href: '/sailor/settings/roles',
      icon: Users,
      description: 'Manage roles & permissions'
    },
    {
      label: 'Database',
      href: '/sailor/settings/database',
      icon: Database,
      description: 'Schema and data management'
    },
    {
      label: 'Storage',
      href: '/sailor/settings/storage',
      icon: Cloud,
      description: 'File storage configuration'
    },
    {
      label: 'Taggables',
      href: '/sailor/settings/taggables',
      icon: Tags,
      description: 'Manage tags and their usage'
    },
    {
      label: 'Import & Export',
      href: '/sailor/settings/import',
      icon: Upload,
      description: 'Content migration tools'
    }
  ];

  // Check if current route matches nav item
  function isActive(href: string) {
    return $page.url.pathname === href;
  }
</script>

<div class="flex min-h-[calc(100vh-8rem)] px-6">
  <!-- Main Content Area -->
  <div class="flex flex-1 flex-col pr-6">
    {@render children()}
  </div>

  <!-- Centered Divider -->
  <div class="bg-border w-px"></div>

  <!-- Right Sidebar Navigation -->
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
