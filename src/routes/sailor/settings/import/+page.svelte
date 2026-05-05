<script lang="ts">
  import { Card, CardContent, CardHeader, CardTitle } from 'sailorcms/components/ui/card/index.js';
  import { Badge } from 'sailorcms/components/ui/badge/index.js';
  import { FileText, Download } from '@lucide/svelte';
  import { toast } from 'sailorcms/core/ui/toast';
  import { m } from '$sailor/i18n';
  import * as Tabs from 'sailorcms/components/ui/tabs/index.js';
  import * as Select from 'sailorcms/components/ui/select/index.js';
  import { Label } from 'sailorcms/components/ui/label/index.js';
  import { invalidateAll } from '$app/navigation';
  import type { PageData } from './$types';
  import Header from 'sailorcms/components/sailor/Header.svelte';

  let { data } = $props();

  // Import state
  let selectedCollection = $state('');
  let availableCollections = $derived(data.collections);

  // Dynamic import state
  let WordPressImportComponent:
    | typeof import('sailorcms/components/sailor/WordPressImport.svelte').default
    | null = $state(null);
  let loadingImportComponent = $state(false);

  function handleCollectionChange(value: string) {
    selectedCollection = value;
    if (value && !WordPressImportComponent) {
      loadWordPressImport();
    }
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
      const module = await import('sailorcms/components/sailor/WordPressImport.svelte');
      WordPressImportComponent = module.default;
    } catch (error) {
      console.error('Failed to load WordPressImport component:', error);
      toast.error(m.toast_import_load_failed());
    } finally {
      loadingImportComponent = false;
    }
  }

  // Load component when tab is selected
  function handleTabChange(value: string) {
    if (value === 'import' && selectedCollection && !WordPressImportComponent) {
      loadWordPressImport();
    }
  }
</script>

<svelte:head>
  <title>{m.import_page_title()} - Sailor CMS</title>
</svelte:head>

<div class="container mx-auto px-6">
  <Header title={m.import_page_title()} description={m.import_page_description()} />

  <Tabs.Root value="import" onValueChange={handleTabChange}>
    <Tabs.List
      class="bg-muted text-muted-foreground inline-flex h-10 items-center justify-center rounded-md p-1"
    >
      <Tabs.Trigger value="import" class="flex items-center gap-2 px-3 py-1.5">
        <Download class="h-4 w-4" />
        {m.import_tab_wordpress()}
      </Tabs.Trigger>
      <Tabs.Trigger value="export" class="flex items-center gap-2 px-3 py-1.5">
        <FileText class="h-4 w-4" />
        {m.import_tab_export()}
      </Tabs.Trigger>
    </Tabs.List>

    <Tabs.Content value="import" class="mt-6 space-y-6">
      <!-- Collection Selection -->
      <Card>
        <CardContent>
          <div class="space-y-6">
            <div class="space-y-2">
              <Label for="collection" class="text-sm font-medium">{m.import_target_label()}</Label>
              <Select.Root
                type="single"
                value={selectedCollection}
                onValueChange={handleCollectionChange}
              >
                <Select.Trigger class="w-full">
                  {selectedCollection === 'media-library'
                    ? m.import_media_library()
                    : selectedCollection
                      ? availableCollections.find(
                          (c: PageData['collections'][number]) => c.slug === selectedCollection
                        )?.name
                      : m.import_target_placeholder()}
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
                      <span class="font-medium">{m.import_media_library()}</span>
                      <span class="text-muted-foreground text-xs"
                        >{m.import_media_library_description()}</span
                      >
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
                    <p class="text-muted-foreground text-sm">{m.import_loading_tools()}</p>
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
                    <p class="text-muted-foreground text-sm">{m.import_preparing_tools()}</p>
                  </div>
                </div>
              {/if}
            {:else}
              <div class="flex flex-col items-center justify-center p-12 text-center">
                <FileText class="text-muted-foreground mb-4 h-12 w-12" />
                <h3 class="mb-2 text-lg font-medium">{m.import_ready_title()}</h3>
                <p class="text-muted-foreground max-w-sm text-sm">{m.import_ready_text()}</p>
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
            {m.export_card_title()}
          </CardTitle>
          <p class="text-muted-foreground text-sm">{m.export_card_description()}</p>
        </CardHeader>
        <CardContent>
          <div class="flex flex-col items-center justify-center p-12 text-center">
            <div class="bg-muted mb-4 rounded-full p-4">
              <Download class="text-muted-foreground h-8 w-8" />
            </div>
            <Badge variant="secondary" class="mb-3">{m.export_coming_soon()}</Badge>
            <h3 class="mb-2 text-lg font-medium">{m.export_features_title()}</h3>
            <p class="text-muted-foreground max-w-md text-sm">{m.export_features_text()}</p>
          </div>
        </CardContent>
      </Card>
    </Tabs.Content>
  </Tabs.Root>
</div>
