<script lang="ts">
  import { Button } from '$lib/components/ui/button/index.js';
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

  const baseDocsUrl = 'https://github.com/jonkristian/sailor-cms/blob/master/docs';
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
      <Button
        class="w-full"
        onclick={() => window.open(`${baseDocsUrl}/getting-started.md`, '_blank')}
      >
        <Rocket class="mr-2 h-4 w-4" />
        Get Started
        <ExternalLink class="ml-2 h-4 w-4" />
      </Button>
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
        <Button
          variant="outline"
          class="flex-1"
          onclick={() =>
            window.open('https://github.com/jonkristian/sailor-cms/tree/master/docs', '_blank')}
        >
          <Book class="mr-2 h-4 w-4" />
          Browse All Docs
          <ExternalLink class="ml-2 h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          class="flex-1"
          onclick={() => window.open(`${baseDocsUrl}/contributing.md`, '_blank')}
        >
          <Github class="mr-2 h-4 w-4" />
          Contributing Guide
          <ExternalLink class="ml-2 h-4 w-4" />
        </Button>
      </div>
    </CardContent>
  </Card>
</div>
