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
  import Github from '$lib/components/sailor/icons/GithubIcon.svelte';
  import Rocket from '@lucide/svelte/icons/rocket';
  import Header from '$lib/components/sailor/Header.svelte';
  import { m } from '$sailor/i18n';

  const baseDocsUrl = 'https://jonkristian.github.io/sailorcms';
</script>

<svelte:head>
  <title>{m.help_page_title()} - Sailor CMS</title>
</svelte:head>

<div class="px-6">
  <Header title={m.help_page_title()} description={m.help_page_description()} />

  <!-- Quick Start Card -->
  <Card class="mb-8">
    <CardHeader>
      <CardTitle class="flex items-center gap-2">
        <Rocket class="h-5 w-5" />
        {m.help_quickstart_title()}
      </CardTitle>
      <CardDescription>
        {m.help_quickstart_description()}
      </CardDescription>
    </CardHeader>
    <CardContent class="space-y-4">
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div class="space-y-2">
          <h4 class="font-medium">{m.help_step1_title()}</h4>
          <p class="text-muted-foreground text-sm">
            {m.help_step1_text()}
          </p>
        </div>
        <div class="space-y-2">
          <h4 class="font-medium">{m.help_step2_title()}</h4>
          <p class="text-muted-foreground text-sm">
            {m.help_step2_text()}
          </p>
        </div>
        <div class="space-y-2">
          <h4 class="font-medium">{m.help_step3_title()}</h4>
          <p class="text-muted-foreground text-sm">{m.help_step3_text()}</p>
        </div>
        <div class="space-y-2">
          <h4 class="font-medium">{m.help_step4_title()}</h4>
          <p class="text-muted-foreground text-sm">{m.help_step4_text()}</p>
        </div>
      </div>
      <a
        href="{baseDocsUrl}/getting-started.html"
        target="_blank"
        rel="noopener noreferrer"
        class="bg-primary text-primary-foreground ring-offset-background hover:bg-primary/90 focus-visible:ring-ring inline-flex h-10 w-full items-center justify-center rounded-md px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
      >
        <Rocket class="mr-2 h-4 w-4" />
        {m.help_get_started()}
        <ExternalLink class="ml-2 h-4 w-4" />
      </a>
    </CardContent>
  </Card>

  <!-- GitHub Link -->
  <Card>
    <CardHeader>
      <CardTitle class="flex items-center gap-2">
        <Github class="h-5 w-5" />
        {m.help_docs_title()}
      </CardTitle>
      <CardDescription>
        {m.help_docs_description()}
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
          {m.help_docs_browse()}
          <ExternalLink class="ml-2 h-4 w-4" />
        </a>
        <a
          href="{baseDocsUrl}/contributing.html"
          target="_blank"
          rel="noopener noreferrer"
          class="border-input bg-background ring-offset-background hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring inline-flex h-10 flex-1 items-center justify-center rounded-md border px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
        >
          <Github class="mr-2 h-4 w-4" />
          {m.help_contributing()}
          <ExternalLink class="ml-2 h-4 w-4" />
        </a>
      </div>
    </CardContent>
  </Card>
</div>
