<script lang="ts">
  import type { PageData } from './$types';
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
  } from '$lib/components/ui/card';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import { ArrowRight } from '@lucide/svelte';
  import Header from '$lib/components/sailor/Header.svelte';

  const { data } = $props<{ data: PageData }>();

  const getGlobalType = (global: any) => {
    if (global.options?.singleton) return 'Singleton';
    return 'Global';
  };
</script>

<svelte:head>
  <title>Globals - Sailor CMS</title>
</svelte:head>

<div class="container mx-auto px-6 py-6">
  <Header title="Globals" description="Manage your site's global content and settings" />

  <div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
    {#each data.globals as global}
      <Card>
        <CardHeader>
          <CardTitle class="flex items-center justify-between">
            {global.name.plural}
            <Badge variant="secondary">{getGlobalType(global)}</Badge>
          </CardTitle>
          <CardDescription>{global.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <a href="/sailor/globals/{global.slug}">
            <Button class="w-full">
              Manage {global.name.plural}
              <ArrowRight class="ml-2 h-4 w-4" />
            </Button>
          </a>
        </CardContent>
      </Card>
    {/each}
  </div>
</div>
