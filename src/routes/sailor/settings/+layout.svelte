<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { Database, Cloud, Upload, Settings, Users, Tags, Mail } from '@lucide/svelte';
  import { m } from '$sailor/i18n';

  const { children } = $props();

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
