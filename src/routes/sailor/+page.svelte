<script lang="ts">
  import ChartRecentActivity from '$lib/components/sailor/dashboard/RecentActivity.svelte';
  import ContentOverview from '$lib/components/sailor/dashboard/ContentOverview.svelte';
  import RecentMedia from '$lib/components/sailor/dashboard/RecentMedia.svelte';
  import RecentUsers from '$lib/components/sailor/dashboard/RecentUsers.svelte';
  import { ExternalLink } from '@lucide/svelte';

  interface DashboardData {
    stats: { collections: number; globals: number; users: number; files: number };
    recentFiles: any[];
    recentUsers: any[];
    recentActivity: any[];
    siteInfo: { name?: string; url?: string; description?: string };
  }

  let { data } = $props();
  let dashboardData = $derived(
    (data.dashboard as DashboardData) || {
      stats: { collections: 0, globals: 0, users: 0, files: 0 },
      recentFiles: [],
      recentUsers: [],
      recentActivity: [],
      siteInfo: {}
    }
  );
</script>

<svelte:head>
  <title>Dashboard - Sailor CMS</title>
</svelte:head>

<div class="container mx-auto space-y-8 px-6">
  <div class="space-y-6">
    <!-- Personalized Header -->
    <div class="flex items-center justify-between">
      <div>
        <div class="flex items-center gap-3">
          <h1 class="text-3xl font-bold tracking-tight">
            {dashboardData.siteInfo.name || 'Dashboard'}
          </h1>
          {#if dashboardData.siteInfo.url}
            <a
              href={dashboardData.siteInfo.url}
              target="_blank"
              rel="noopener noreferrer"
              class="text-muted-foreground hover:text-primary transition-colors"
              title="Visit site: {dashboardData.siteInfo.url}"
            >
              <ExternalLink class="h-5 w-5" />
            </a>
          {/if}
        </div>
        <p class="text-muted-foreground">
          {dashboardData.siteInfo.description || 'Overview of your content management system'}
        </p>
      </div>
    </div>

    <!-- Stats Overview -->
    <ContentOverview stats={dashboardData.stats} />

    <!-- Dashboard Widgets Grid -->
    <div class="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <!-- Left Column - Recent Content -->
      <div class="space-y-6">
        <ChartRecentActivity data={dashboardData.recentActivity} />
        <RecentMedia files={dashboardData.recentFiles} />
      </div>

      <!-- Right Column - Users (if user has permission) -->
      <div>
        {#if dashboardData.recentUsers.length > 0}
          <RecentUsers users={dashboardData.recentUsers} />
        {/if}
      </div>
    </div>
  </div>
</div>
