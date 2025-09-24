<script lang="ts">
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
  } from '$lib/components/ui/card/index.js';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import Book from '@lucide/svelte/icons/book';
  import Github from '@lucide/svelte/icons/github';
  import Rocket from '@lucide/svelte/icons/rocket';
  import Header from '$lib/components/sailor/Header.svelte';

  const baseDocsUrl = 'https://jonkristian.github.io/sailorcms';
</script>

<svelte:head>
  <title>Help & Documentation - Sailor CMS</title>
</svelte:head>

<div class="px-6">
  <Header title="Help & Documentation" description="Get help and learn how to use Sailor CMS" />

  <!-- Quick Start Card -->
  <Card class="mb-8">
    <CardHeader>
      <CardTitle class="flex items-center gap-2">
        <Rocket class="h-5 w-5" />
        Quick Start
      </CardTitle>
      <CardDescription>
        New to Sailor CMS? Start here to get up and running quickly.
      </CardDescription>
    </CardHeader>
    <CardContent class="space-y-4">
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div class="space-y-2">
          <h4 class="font-medium">1. Create Collections</h4>
          <p class="text-muted-foreground text-sm">
            Define your content types like posts, pages, or products
          </p>
        </div>
        <div class="space-y-2">
          <h4 class="font-medium">2. Add Blocks</h4>
          <p class="text-muted-foreground text-sm">
            Create reusable content components for flexible layouts
          </p>
        </div>
        <div class="space-y-2">
          <h4 class="font-medium">3. Configure Globals</h4>
          <p class="text-muted-foreground text-sm">Set up site-wide settings and navigation</p>
        </div>
        <div class="space-y-2">
          <h4 class="font-medium">4. Manage Users</h4>
          <p class="text-muted-foreground text-sm">Add team members and configure permissions</p>
        </div>
      </div>
      <a
        href="{baseDocsUrl}/getting-started.html"
        target="_blank"
        rel="noopener noreferrer"
        class="bg-primary text-primary-foreground ring-offset-background hover:bg-primary/90 focus-visible:ring-ring inline-flex h-10 w-full items-center justify-center rounded-md px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
      >
        <Rocket class="mr-2 h-4 w-4" />
        Get Started
        <ExternalLink class="ml-2 h-4 w-4" />
      </a>
    </CardContent>
  </Card>

  <!-- GitHub Link -->
  <Card>
    <CardHeader>
      <CardTitle class="flex items-center gap-2">
        <Github class="h-5 w-5" />
        Complete Documentation
      </CardTitle>
      <CardDescription>
        View the full documentation, contribute improvements, or report issues on GitHub.
      </CardDescription>
    </CardHeader>
    <CardContent class="space-y-3">
      <div class="flex flex-col gap-3 sm:flex-row">
        <a
          href="https://github.com/jonkristian/sailor-cms/tree/master/docs"
          target="_blank"
          rel="noopener noreferrer"
          class="border-input bg-background ring-offset-background hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring inline-flex h-10 flex-1 items-center justify-center rounded-md border px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
        >
          <Book class="mr-2 h-4 w-4" />
          Browse All Docs
          <ExternalLink class="ml-2 h-4 w-4" />
        </a>
        <a
          href="{baseDocsUrl}/contributing.html"
          target="_blank"
          rel="noopener noreferrer"
          class="border-input bg-background ring-offset-background hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring inline-flex h-10 flex-1 items-center justify-center rounded-md border px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
        >
          <Github class="mr-2 h-4 w-4" />
          Contributing Guide
          <ExternalLink class="ml-2 h-4 w-4" />
        </a>
      </div>
    </CardContent>
  </Card>
</div>
