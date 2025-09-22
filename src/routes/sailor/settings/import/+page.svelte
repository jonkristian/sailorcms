<script lang="ts">
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
  import { Badge } from '$lib/components/ui/badge';
  import { FileText, Download } from '@lucide/svelte';
  import { toast } from '$sailor/core/ui/toast';
  import * as Tabs from '$lib/components/ui/tabs';
  import * as Select from '$lib/components/ui/select';
  import { Label } from '$lib/components/ui/label';
  import { invalidateAll } from '$app/navigation';
  import type { PageData } from './$types';
  import Header from '$lib/components/sailor/Header.svelte';

  let { data } = $props();

  // Import state
  let selectedCollection = $state('');
  let availableCollections = $derived(data.collections);

  // Dynamic import state
  let WordPressImportComponent = $state<
    typeof import('$lib/components/sailor/WordPressImport.svelte').default | null
  >(null);
  let loadingImportComponent = $state(false);

  // Handle collection selection
  function handleCollectionChange(value: string) {
    selectedCollection = value;
  }

  // Handle import completion
  function handleImportComplete() {
    // Refresh the page data
    invalidateAll();
  }

  // Load WordPressImport component dynamically
  async function loadWordPressImport() {
    if (WordPressImportComponent) return;

    loadingImportComponent = true;
    try {
      const module = await import('$lib/components/sailor/WordPressImport.svelte');
      WordPressImportComponent = module.default;
    } catch (error) {
      console.error('Failed to load WordPressImport component:', error);
      toast.error('Failed to load import component');
    } finally {
      loadingImportComponent = false;
    }
  }

  // Load component when collection is selected
  $effect(() => {
    if (selectedCollection && !WordPressImportComponent) {
      loadWordPressImport();
    }
  });

  // Load component when tab is selected
  function handleTabChange(value: string) {
    if (value === 'import' && selectedCollection && !WordPressImportComponent) {
      loadWordPressImport();
    }
  }
</script>

<svelte:head>
  <title>Import Content - Sailor CMS</title>
</svelte:head>

<div class="container mx-auto px-6">
  <Header
    title="Import Content"
    description="Import content from external sources into your collections."
  />

  <Tabs.Root value="import" onValueChange={handleTabChange}>
    <Tabs.List
      class="bg-muted text-muted-foreground inline-flex h-10 items-center justify-center rounded-md p-1"
    >
      <Tabs.Trigger value="import" class="flex items-center gap-2 px-3 py-1.5">
        <Download class="h-4 w-4" />
        Import from WordPress
      </Tabs.Trigger>
      <Tabs.Trigger value="export" class="flex items-center gap-2 px-3 py-1.5">
        <FileText class="h-4 w-4" />
        Export
      </Tabs.Trigger>
    </Tabs.List>

    <Tabs.Content value="import" class="mt-6 space-y-6">
      <!-- Collection Selection -->
      <Card>
        <CardContent>
          <div class="space-y-6">
            <div class="space-y-2">
              <Label for="collection" class="text-sm font-medium">Import Target</Label>
              <Select.Root
                type="single"
                value={selectedCollection}
                onValueChange={handleCollectionChange}
              >
                <Select.Trigger class="w-full">
                  {selectedCollection === 'media-library'
                    ? 'Media Library'
                    : selectedCollection
                      ? availableCollections.find(
                          (c: PageData['collections'][number]) => c.slug === selectedCollection
                        )?.name
                      : 'Choose where to import your content'}
                </Select.Trigger>
                <Select.Content>
                  {#each availableCollections as collection (collection.slug)}
                    <Select.Item value={collection.slug}>
                      <div class="flex flex-col">
                        <span class="font-medium">{collection.name}</span>
                        <span class="text-muted-foreground text-xs"
                          >{collection.description || collection.slug}</span
                        >
                      </div>
                    </Select.Item>
                  {/each}
                  <Select.Item value="media-library">
                    <div class="flex flex-col">
                      <span class="font-medium">Media Library</span>
                      <span class="text-muted-foreground text-xs">Import media files only</span>
                    </div>
                  </Select.Item>
                </Select.Content>
              </Select.Root>
            </div>

            {#if selectedCollection}
              {#if loadingImportComponent}
                <div class="flex items-center justify-center p-12">
                  <div class="flex flex-col items-center gap-3">
                    <div
                      class="border-primary h-6 w-6 animate-spin rounded-full border-2 border-t-transparent"
                    ></div>
                    <p class="text-muted-foreground text-sm">Loading import tools...</p>
                  </div>
                </div>
              {:else if WordPressImportComponent}
                <div class="border-t pt-6">
                  <WordPressImportComponent
                    collectionSlug={selectedCollection}
                    onImportComplete={handleImportComplete}
                  />
                </div>
              {:else}
                <div class="flex items-center justify-center p-12">
                  <div class="flex flex-col items-center gap-3">
                    <div
                      class="border-primary h-6 w-6 animate-spin rounded-full border-2 border-t-transparent"
                    ></div>
                    <p class="text-muted-foreground text-sm">Preparing import tools...</p>
                  </div>
                </div>
              {/if}
            {:else}
              <div class="flex flex-col items-center justify-center p-12 text-center">
                <FileText class="text-muted-foreground mb-4 h-12 w-12" />
                <h3 class="mb-2 text-lg font-medium">Ready to Import</h3>
                <p class="text-muted-foreground max-w-sm text-sm">
                  Select a target above to begin importing your WordPress content or media.
                </p>
              </div>
            {/if}
          </div>
        </CardContent>
      </Card>
    </Tabs.Content>

    <Tabs.Content value="export" class="mt-6 space-y-6">
      <Card>
        <CardHeader class="pb-4">
          <CardTitle class="flex items-center gap-2 text-lg">
            <Download class="h-5 w-5" />
            Export Content
          </CardTitle>
          <p class="text-muted-foreground text-sm">
            Export your content to various formats for backup or migration.
          </p>
        </CardHeader>
        <CardContent>
          <div class="flex flex-col items-center justify-center p-12 text-center">
            <div class="bg-muted mb-4 rounded-full p-4">
              <Download class="text-muted-foreground h-8 w-8" />
            </div>
            <Badge variant="secondary" class="mb-3">Coming Soon</Badge>
            <h3 class="mb-2 text-lg font-medium">Export Features</h3>
            <p class="text-muted-foreground max-w-md text-sm">
              Export functionality including JSON, XML, and CSV formats will be available in a
              future update.
            </p>
          </div>
        </CardContent>
      </Card>
    </Tabs.Content>
  </Tabs.Root>
</div>
