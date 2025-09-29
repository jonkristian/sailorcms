<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import { Label } from '$lib/components/ui/label';
  import { Badge } from '$lib/components/ui/badge';
  import { FileText, CheckCircle, XCircle, Loader2, AlertCircle } from '@lucide/svelte';
  import { toast } from '$sailor/core/ui/toast';
  import * as Select from '$lib/components/ui/select';
  import { Progress } from '$lib/components/ui/progress';
  import { Separator } from '$lib/components/ui/separator';
  import { browser } from '$app/environment';

  let {
    collectionSlug,
    open = $bindable(false),
    onImportComplete
  } = $props<{
    collectionSlug: string;
    open?: boolean;
    onImportComplete?: () => void;
  }>();

  // Check if we're importing to media library
  const isMediaLibraryImport = $derived(collectionSlug === 'media-library');

  // API configuration state
  let apiConfig = $state({
    baseUrl: '',
    username: '',
    password: ''
  });

  // Import flow state
  let currentStep = $state(1); // 1: credentials, 2: preview, 3: selection, 4: mapping, 5: import
  let previewData = $state<any>(null);
  let selectedPostType = $state<string>('posts'); // Default to posts

  // Derived values for better performance
  const selectedPostTypeData = $derived(
    previewData?.postTypes.find((pt: any) => pt.name === selectedPostType)
  );

  const hasValidPostTypes = $derived(previewData?.postTypes && previewData.postTypes.length > 0);

  const canProceedToMapping = $derived(selectedPostType && hasValidPostTypes);

  const isApiConfigValid = $derived(
    apiConfig.baseUrl.trim() !== '' &&
      apiConfig.username.trim() !== '' &&
      apiConfig.password.trim() !== ''
  );

  // Import options
  let createCategories = $state(true);
  let createTags = $state(true);
  let skipExistingSlugs = $state(false);

  // Author mapping options - simplified
  let tryEmailMatching = $state(true); // true = try email matching, false = always use current user
  const useCurrentUserAsAuthor = $derived(!tryEmailMatching);

  let statusMapping = $state({
    publish: 'published',
    draft: 'draft',
    private: 'private'
  });

  // Import state
  let importing = $state(false);
  let importProgress = $state(0);
  let importStatus = $state('');
  let importResult = $state<{
    success: boolean;
    imported: number;
    skipped: number;
    errors: string[];
    files: { imported: number; failed: number };
    total: number;
  } | null>(null);

  // Collection fields
  let availableFields = $state<Array<{ key: string; label: string; type: string }>>([]);
  let loadingFields = $state(false);

  // Field mapping state - user selects manually
  let fieldMappings = $state({
    title: '',
    content: '',
    excerpt: '',
    featured_image: '',
    categories: ''
  });

  // Field processing (whether to strip HTML from content fields)
  let stripHtmlOptions = $state({
    content: false, // Default: keep HTML for content
    excerpt: true // Default: strip HTML for excerpt
  });

  // API configuration helpers
  function resetApiConfig() {
    apiConfig = {
      baseUrl: '',
      username: '',
      password: ''
    };
    importResult = null;
  }

  // Preview functionality
  let loadingPreview = $state(false);
  let previewError = $state('');

  async function fetchPreview() {
    if (!isApiConfigValid) {
      toast.error('Please provide valid WordPress API credentials');
      return;
    }

    loadingPreview = true;
    previewError = '';

    try {
      const { previewWordPressAPI } = await import('$sailor/remote/wordpress.remote.js');
      const result = await previewWordPressAPI({
        apiConfig: {
          baseUrl: apiConfig.baseUrl.trim(),
          username: apiConfig.username.trim(),
          password: apiConfig.password.trim()
        },
        postsPerPage: 5,
        maxPages: 1
      });

      if (result.success) {
        previewData = result.data;
        currentStep = 2; // Move to preview step
        toast.success('Preview loaded successfully!');
      } else {
        previewError = result.error || 'Failed to load preview';
        toast.error(previewError);
      }
    } catch (error) {
      previewError = 'Failed to connect to WordPress API';
      toast.error(previewError);
      console.error('Preview error:', error);
    } finally {
      loadingPreview = false;
    }
  }

  function goToStep(step: number) {
    currentStep = step;
  }

  // Import function
  async function startImport() {
    if (!isApiConfigValid) {
      toast.error('Please provide valid WordPress API credentials');
      return;
    }

    importing = true;
    importProgress = 0;
    importStatus = 'Connecting to WordPress API...';
    importResult = null;

    try {
      // Start import process with manual progress updates
      importStatus = 'Connecting to WordPress API...';
      importProgress = 10;

      const { importWordPressContent } = await import('$sailor/remote/wordpress.remote.js');

      // Update progress during fetch phase
      importStatus = 'Fetching content from WordPress...';
      importProgress = 25;

      // Start the import
      const importPromise = importWordPressContent({
        collectionSlug,
        selectedPostType, // Add the selected post type
        downloadFiles: true, // Always download files for complete import
        createCategories,
        createTags,
        skipExistingSlugs,
        useCurrentUserAsAuthor,
        statusMapping: statusMapping as Record<string, 'draft' | 'published' | 'archived'>,
        fieldMappings,
        apiConfig: {
          baseUrl: apiConfig.baseUrl.trim(),
          username: apiConfig.username.trim(),
          password: apiConfig.password.trim()
        }
      });

      // Simulate progress during import
      const progressUpdates = [
        { progress: 40, status: 'Processing posts and media...' },
        { progress: 55, status: 'Creating categories and tags...' },
        { progress: 70, status: 'Downloading images...' },
        { progress: 85, status: 'Finalizing import...' }
      ];

      let updateIndex = 0;
      const progressInterval = setInterval(() => {
        if (updateIndex < progressUpdates.length) {
          const update = progressUpdates[updateIndex];
          importProgress = update.progress;
          importStatus = update.status;
          updateIndex++;
        }
      }, 2000); // Update every 2 seconds

      const result = await importPromise;
      clearInterval(progressInterval);

      importProgress = 100;
      importStatus = 'Import completed!';

      if (result.success) {
        importResult = {
          success: true,
          imported: result.data?.result?.imported || 0,
          skipped: result.data?.result?.skipped || 0,
          errors: result.data?.result?.errors || [],
          files: {
            imported: result.data?.result?.files?.imported || 0,
            failed: result.data?.result?.files?.failed || 0
          },
          total: (result.data?.result?.imported || 0) + (result.data?.result?.skipped || 0)
        };

        toast.success(result.data?.message || 'Import completed successfully');
        if (onImportComplete) {
          onImportComplete();
        }
      } else {
        importStatus = 'Import failed';
        toast.error(result.error || 'Import failed');
      }
    } catch (error) {
      importStatus = 'Import failed';
      toast.error('Import failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      importing = false;
    }
  }

  // Fetch collection fields
  async function fetchCollectionFields() {
    if (!collectionSlug) return;

    loadingFields = true;
    try {
      const { getCollectionFields } = await import('$sailor/remote/collections.remote.js');
      const result = await getCollectionFields({ collection: collectionSlug });

      if (result.success) {
        availableFields = result.fields || [];
      } else {
        console.error('Failed to fetch fields:', result.error);
      }
    } catch (error) {
      console.error('Failed to fetch collection fields:', error);
    } finally {
      loadingFields = false;
    }
  }

  // Fetch fields when we reach step 3 (field mapping) - client-side only
  $effect(() => {
    if (browser && currentStep === 3 && collectionSlug && availableFields.length === 0) {
      fetchCollectionFields();
    }
  });
</script>

<div class="space-y-4">
  <!-- Step Indicator -->
  <div class="flex items-center justify-between">
    <h2 class="flex items-center gap-2 text-lg font-semibold">
      <FileText class="h-5 w-5" />
      WordPress Import to {isMediaLibraryImport ? 'Media Library' : collectionSlug}
    </h2>
    <div class="text-muted-foreground flex items-center gap-2 text-sm">
      <span class={currentStep >= 1 ? 'text-primary' : ''}>1. Connect</span>
      <span class="text-muted-foreground">→</span>
      <span class={currentStep >= 2 ? 'text-primary' : ''}>2. Select</span>
      {#if !isMediaLibraryImport}
        <span class="text-muted-foreground">→</span>
        <span class={currentStep >= 3 ? 'text-primary' : ''}>3. Map</span>
      {/if}
      <span class="text-muted-foreground">→</span>
      <span
        class={currentStep >= (isMediaLibraryImport ? 3 : 4) ? 'text-primary font-semibold' : ''}
        >{isMediaLibraryImport ? '3' : '4'}. Import</span
      >
    </div>
  </div>

  <!-- Step 1: API Configuration -->
  {#if currentStep === 1}
    <div class="space-y-3">
      <!-- WordPress API Configuration -->
      <div class="border-muted-foreground/20 space-y-4 rounded-lg border p-4">
        <div class="space-y-3">
          <Label for="base-url" class="text-sm font-medium">WordPress Site URL</Label>
          <input
            id="base-url"
            type="url"
            placeholder="https://yoursite.com"
            bind:value={apiConfig.baseUrl}
            class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          />
          <p class="text-muted-foreground text-xs">
            Enter your WordPress site URL (without /wp-json/wp/v2)
          </p>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-2">
            <Label for="username" class="text-sm font-medium">Username</Label>
            <input
              id="username"
              type="text"
              placeholder="WordPress username"
              bind:value={apiConfig.username}
              class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            />
          </div>
          <div class="space-y-2">
            <Label for="password" class="text-sm font-medium">Password</Label>
            <input
              id="password"
              type="password"
              placeholder="WordPress password"
              bind:value={apiConfig.password}
              class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            />
          </div>
        </div>
        <p class="text-muted-foreground text-xs">Use your regular WordPress admin credentials</p>
      </div>

      <!-- Step 1 Actions -->
      <div class="flex gap-2">
        <Button
          onclick={fetchPreview}
          disabled={!isApiConfigValid || loadingPreview}
          class="flex-1"
        >
          {#if loadingPreview}
            <Loader2 class="mr-2 h-4 w-4 animate-spin" />
            Connecting...
          {:else}
            Connect & Continue
          {/if}
        </Button>
      </div>

      {#if previewError}
        <div class="bg-destructive/10 text-destructive rounded-md p-3 text-sm">
          <AlertCircle class="mr-2 inline h-4 w-4" />
          {previewError}
        </div>
      {/if}
    </div>
  {/if}

  <!-- Step 2: Selection -->
  {#if currentStep === 2 && previewData}
    <div class="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle class="flex items-center gap-2">
            <CheckCircle class="h-5 w-5 text-green-500" />
            Select What to Import
          </CardTitle>
          <p class="text-muted-foreground text-sm">
            Connected to {previewData.siteInfo.name} ({previewData.siteInfo.url})
          </p>
        </CardHeader>
        <CardContent class="space-y-4">
          <div>
            {#if isMediaLibraryImport}
              <h4 class="mb-3 text-sm font-medium">Import Media Files</h4>
              <p class="text-muted-foreground mb-4 text-sm">
                Import WordPress media files directly to your media library with all metadata
                preserved.
              </p>
              <div class="flex items-center justify-between rounded-md border p-3">
                <div class="flex items-center gap-3">
                  <div class="bg-primary/10 flex h-8 w-8 items-center justify-center rounded-full">
                    <FileText class="text-primary h-4 w-4" />
                  </div>
                  <div>
                    <p class="text-sm font-medium">WordPress Media Library</p>
                    <p class="text-muted-foreground text-xs">All media files with metadata</p>
                  </div>
                </div>
                <Badge variant="outline" class="text-xs">Ready</Badge>
              </div>
            {:else}
              <h4 class="mb-3 text-sm font-medium">Select Content Types to Import</h4>
              <p class="text-muted-foreground mb-4 text-sm">
                Choose which content types you want to import from your WordPress site.
              </p>
              <div class="space-y-3">
                {#each previewData.postTypes as postType}
                  <div class="flex items-center justify-between rounded-md border p-3">
                    <div class="flex items-center gap-3">
                      <input
                        type="radio"
                        id="post-type-{postType.name}"
                        name="post-type"
                        value={postType.name}
                        checked={selectedPostType === postType.name}
                        onchange={(e) => {
                          const target = e.target as HTMLInputElement;
                          if (target.checked) {
                            selectedPostType = postType.name;
                          }
                        }}
                        class="h-4 w-4"
                      />
                      <Label
                        for="post-type-{postType.name}"
                        class="cursor-pointer text-sm font-medium"
                      >
                        {postType.label}
                      </Label>
                      <p class="text-muted-foreground text-xs">
                        Available for import • WordPress {postType.name}
                      </p>
                    </div>
                    <Badge variant="outline" class="text-xs">Available</Badge>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        </CardContent>
      </Card>

      <div class="flex gap-2">
        <Button variant="outline" onclick={() => goToStep(1)}>Back</Button>
        <Button
          onclick={() => goToStep(isMediaLibraryImport ? 4 : 3)}
          class="flex-1"
          disabled={!canProceedToMapping}
        >
          {isMediaLibraryImport ? 'Continue to Import' : 'Continue to Field Mapping'}
        </Button>
      </div>
    </div>
  {/if}

  <!-- Step 3: Field Mapping (Skip for Media Library) -->
  {#if currentStep === 3 && !isMediaLibraryImport}
    <div class="space-y-4">
      {#if loadingFields}
        <div class="text-muted-foreground flex items-center gap-2">
          <Loader2 class="h-4 w-4 animate-spin" />
          <span class="text-sm">Loading fields...</span>
        </div>
      {:else if availableFields.length > 0}
        <Card>
          <CardHeader class="pb-3">
            <CardTitle class="text-base">
              Field Mapping for {selectedPostTypeData?.label || selectedPostType}
            </CardTitle>
            <p class="text-muted-foreground text-sm">
              Map WordPress {selectedPostType} fields to your collection fields
            </p>
          </CardHeader>
          <CardContent class="space-y-4">
            <!-- Field Mapping -->
            <div class="space-y-4">
              <!-- Content Field -->
              <div class="bg-muted/30 rounded-md px-3 py-2">
                <div class="flex items-center justify-between">
                  <span class="text-sm font-medium">Content</span>
                  <div class="flex items-center gap-3">
                    <Select.Root
                      type="single"
                      value={fieldMappings.content}
                      onValueChange={(value) => (fieldMappings.content = value)}
                    >
                      <Select.Trigger class="h-8 min-w-[140px] text-sm">
                        {#if fieldMappings.content}
                          {availableFields.find((f) => f.key === fieldMappings.content)?.label ||
                            fieldMappings.content}
                        {:else}
                          Don't import
                        {/if}
                      </Select.Trigger>
                      <Select.Content>
                        <Select.Item value="">Don't import</Select.Item>
                        {#each availableFields.filter( (f) => ['wysiwyg', 'textarea', 'text'].includes(f.type) ) as field (field.key)}
                          <Select.Item value={field.key}>{field.label} ({field.type})</Select.Item>
                        {/each}
                      </Select.Content>
                    </Select.Root>
                    {#if fieldMappings.content}
                      <div class="flex items-center gap-2">
                        <Checkbox id="content-strip-html" bind:checked={stripHtmlOptions.content} />
                        <Label for="content-strip-html" class="text-muted-foreground text-xs">
                          Strip HTML
                        </Label>
                      </div>
                    {/if}
                  </div>
                </div>
              </div>

              <!-- Excerpt Field -->
              <div class="bg-muted/30 rounded-md px-3 py-2">
                <div class="flex items-center justify-between">
                  <span class="text-sm font-medium">Excerpt</span>
                  <div class="flex items-center gap-3">
                    <Select.Root
                      type="single"
                      value={fieldMappings.excerpt}
                      onValueChange={(value) => (fieldMappings.excerpt = value)}
                    >
                      <Select.Trigger class="h-8 min-w-[140px] text-sm">
                        {#if fieldMappings.excerpt}
                          {availableFields.find((f) => f.key === fieldMappings.excerpt)?.label ||
                            fieldMappings.excerpt}
                        {:else}
                          Don't import
                        {/if}
                      </Select.Trigger>
                      <Select.Content>
                        <Select.Item value="">Don't import</Select.Item>
                        {#each availableFields.filter( (f) => ['wysiwyg', 'textarea', 'text'].includes(f.type) ) as field (field.key)}
                          <Select.Item value={field.key}>{field.label} ({field.type})</Select.Item>
                        {/each}
                      </Select.Content>
                    </Select.Root>
                    {#if fieldMappings.excerpt}
                      <div class="flex items-center gap-2">
                        <Checkbox id="excerpt-strip-html" bind:checked={stripHtmlOptions.excerpt} />
                        <Label for="excerpt-strip-html" class="text-muted-foreground text-xs">
                          Strip HTML
                        </Label>
                      </div>
                    {/if}
                  </div>
                </div>
              </div>

              <!-- Featured Image Field -->
              <div class="bg-muted/30 flex items-center justify-between rounded-md px-3 py-2">
                <span class="text-sm font-medium">Featured Image</span>
                <Select.Root
                  type="single"
                  value={fieldMappings.featured_image}
                  onValueChange={(value) => (fieldMappings.featured_image = value)}
                >
                  <Select.Trigger class="h-8 min-w-[140px] text-sm">
                    {#if fieldMappings.featured_image}
                      {availableFields.find((f) => f.key === fieldMappings.featured_image)?.label ||
                        fieldMappings.featured_image}
                    {:else}
                      Don't import
                    {/if}
                  </Select.Trigger>
                  <Select.Content>
                    <Select.Item value="">Don't import</Select.Item>
                    {#each availableFields.filter( (f) => ['file', 'image'].includes(f.type) ) as field (field.key)}
                      <Select.Item value={field.key}>{field.label} ({field.type})</Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
              </div>

              <!-- Categories Field -->
              <div class="bg-muted/30 flex items-center justify-between rounded-md px-3 py-2">
                <span class="text-sm font-medium">Categories</span>
                <Select.Root
                  type="single"
                  value={fieldMappings.categories}
                  onValueChange={(value) => (fieldMappings.categories = value)}
                >
                  <Select.Trigger class="h-8 min-w-[140px] text-sm">
                    {#if fieldMappings.categories}
                      {availableFields.find((f) => f.key === fieldMappings.categories)?.label ||
                        fieldMappings.categories}
                    {:else}
                      Don't import
                    {/if}
                  </Select.Trigger>
                  <Select.Content>
                    <Select.Item value="">Don't import</Select.Item>
                    {#each availableFields.filter( (f) => ['relation'].includes(f.type) ) as field (field.key)}
                      <Select.Item value={field.key}>{field.label} ({field.type})</Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
              </div>
            </div>

            <Separator />

            <!-- Status Mapping -->
            <div class="space-y-4">
              <h4 class="text-sm font-medium">Status Mapping</h4>
              <div class="grid grid-cols-3 gap-4">
                <div class="space-y-2">
                  <Label for="status-published" class="text-sm">Published →</Label>
                  <Select.Root
                    type="single"
                    value={statusMapping.publish}
                    onValueChange={(value) => (statusMapping.publish = value)}
                  >
                    <Select.Trigger class="h-8 text-sm">
                      {statusMapping.publish}
                    </Select.Trigger>
                    <Select.Content>
                      <Select.Item value="published">Published</Select.Item>
                      <Select.Item value="draft">Draft</Select.Item>
                      <Select.Item value="archived">Archived</Select.Item>
                      <Select.Item value="private">Private</Select.Item>
                    </Select.Content>
                  </Select.Root>
                </div>
                <div class="space-y-2">
                  <Label for="status-draft" class="text-sm">Draft →</Label>
                  <Select.Root
                    type="single"
                    value={statusMapping.draft}
                    onValueChange={(value) => (statusMapping.draft = value)}
                  >
                    <Select.Trigger class="h-8 text-sm">
                      {statusMapping.draft}
                    </Select.Trigger>
                    <Select.Content>
                      <Select.Item value="published">Published</Select.Item>
                      <Select.Item value="draft">Draft</Select.Item>
                      <Select.Item value="archived">Archived</Select.Item>
                      <Select.Item value="private">Private</Select.Item>
                    </Select.Content>
                  </Select.Root>
                </div>
                <div class="space-y-2">
                  <Label for="status-private" class="text-sm">Private →</Label>
                  <Select.Root
                    type="single"
                    value={statusMapping.private}
                    onValueChange={(value) => (statusMapping.private = value)}
                  >
                    <Select.Trigger class="h-8 text-sm">
                      {statusMapping.private}
                    </Select.Trigger>
                    <Select.Content>
                      <Select.Item value="published">Published</Select.Item>
                      <Select.Item value="draft">Draft</Select.Item>
                      <Select.Item value="archived">Archived</Select.Item>
                      <Select.Item value="private">Private</Select.Item>
                    </Select.Content>
                  </Select.Root>
                </div>
              </div>
            </div>

            <Separator />

            <!-- Import Options -->
            <div class="space-y-4">
              <h4 class="text-sm font-medium">Import Options</h4>
              <div class="flex flex-wrap gap-6">
                <div class="flex items-center space-x-2">
                  <Checkbox id="create-categories" bind:checked={createCategories} />
                  <Label for="create-categories" class="text-sm">Create categories</Label>
                </div>
                <div class="flex items-center space-x-2">
                  <Checkbox id="create-tags" bind:checked={createTags} />
                  <Label for="create-tags" class="text-sm">Create tags</Label>
                </div>
                <div class="flex items-center space-x-2">
                  <Checkbox id="skip-existing-slugs" bind:checked={skipExistingSlugs} />
                  <Label for="skip-existing-slugs" class="text-sm">Skip duplicates</Label>
                </div>
                <div class="flex items-center space-x-2">
                  <Checkbox id="try-author-matching" bind:checked={tryEmailMatching} />
                  <Label for="try-author-matching" class="text-sm">
                    Try matching authors by name
                  </Label>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      {/if}

      <div class="flex gap-2">
        <Button variant="outline" onclick={() => goToStep(2)}>Back</Button>
        <Button onclick={() => goToStep(4)} class="flex-1" disabled={availableFields.length === 0}>
          Continue to Summary
        </Button>
      </div>
    </div>
  {/if}

  <!-- Step 4: Import -->
  {#if currentStep === 4}
    <div class="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Ready to Import</CardTitle>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="space-y-4">
            <div>
              <h4 class="mb-3 text-sm font-medium">Import Summary</h4>
              <div class="space-y-2">
                <div class="flex items-center justify-between rounded-md border p-3">
                  <div class="flex items-center gap-3">
                    <div
                      class="bg-primary/10 flex h-8 w-8 items-center justify-center rounded-full"
                    >
                      <FileText class="text-primary h-4 w-4" />
                    </div>
                    <div>
                      {#if isMediaLibraryImport}
                        <p class="text-sm font-medium">WordPress Media Library</p>
                        <p class="text-muted-foreground text-xs">All media files with metadata</p>
                      {:else}
                        <p class="text-sm font-medium">
                          {selectedPostTypeData?.label || selectedPostType}
                        </p>
                        <p class="text-muted-foreground text-xs">WordPress {selectedPostType}</p>
                      {/if}
                    </div>
                  </div>
                  <Badge variant="secondary" class="text-sm">Available</Badge>
                </div>
              </div>
            </div>

            {#if !isMediaLibraryImport}
              <Separator />

              <div>
                <h4 class="mb-3 text-sm font-medium">Field Mappings</h4>
                <div class="space-y-2 text-sm">
                  <div class="flex justify-between">
                    <span class="text-muted-foreground">Content:</span>
                    <div class="text-right">
                      <div>
                        {fieldMappings.content
                          ? availableFields.find((f) => f.key === fieldMappings.content)?.label ||
                            fieldMappings.content
                          : 'Not imported'}
                      </div>
                      {#if fieldMappings.content}
                        <div class="text-muted-foreground text-xs">
                          {stripHtmlOptions.content ? 'Strip HTML' : 'Keep HTML'}
                        </div>
                      {/if}
                    </div>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-muted-foreground">Excerpt:</span>
                    <div class="text-right">
                      <div>
                        {fieldMappings.excerpt
                          ? availableFields.find((f) => f.key === fieldMappings.excerpt)?.label ||
                            fieldMappings.excerpt
                          : 'Not imported'}
                      </div>
                      {#if fieldMappings.excerpt}
                        <div class="text-muted-foreground text-xs">
                          {stripHtmlOptions.excerpt ? 'Strip HTML' : 'Keep HTML'}
                        </div>
                      {/if}
                    </div>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-muted-foreground">Featured Image:</span>
                    <span
                      >{fieldMappings.featured_image
                        ? availableFields.find((f) => f.key === fieldMappings.featured_image)
                            ?.label || fieldMappings.featured_image
                        : 'Not imported'}</span
                    >
                  </div>
                  <div class="flex justify-between">
                    <span class="text-muted-foreground">Categories:</span>
                    <span
                      >{fieldMappings.categories
                        ? availableFields.find((f) => f.key === fieldMappings.categories)?.label ||
                          fieldMappings.categories
                        : 'Not imported'}</span
                    >
                  </div>
                </div>
              </div>

              <Separator />
            {/if}

            {#if !isMediaLibraryImport}
              <div>
                <h4 class="mb-3 text-sm font-medium">Import Options</h4>
                <div class="space-y-1 text-sm">
                  <div class="flex justify-between">
                    <span class="text-muted-foreground">Create categories:</span>
                    <span>{createCategories ? 'Yes' : 'No'}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-muted-foreground">Create tags:</span>
                    <span>{createTags ? 'Yes' : 'No'}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-muted-foreground">Skip duplicates:</span>
                    <span>{skipExistingSlugs ? 'Yes' : 'No'}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-muted-foreground">Author matching:</span>
                    <span>
                      {tryEmailMatching ? 'Try name matching' : 'Assign all to current user'}
                    </span>
                  </div>
                </div>
              </div>
            {:else}
              <div>
                <h4 class="mb-3 text-sm font-medium">Media Import</h4>
                <div class="space-y-1 text-sm">
                  <div class="flex justify-between">
                    <span class="text-muted-foreground">Import type:</span>
                    <span>Media files only</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-muted-foreground">Metadata:</span>
                    <span>Alt text, titles, descriptions preserved</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-muted-foreground">Duplicates:</span>
                    <span>Automatically skipped</span>
                  </div>
                </div>
              </div>
            {/if}
          </div>
        </CardContent>
      </Card>

      <div class="flex gap-2">
        <Button variant="outline" onclick={() => goToStep(3)}>Back</Button>
        <Button onclick={startImport} disabled={importing} class="flex-1">
          {#if importing}
            <Loader2 class="mr-2 h-4 w-4 animate-spin" />
            Importing...
          {:else}
            Start Import
          {/if}
        </Button>
      </div>
    </div>
  {/if}

  <!-- Import Progress -->
  {#if importing}
    <Card>
      <CardHeader>
        <CardTitle>Importing...</CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <Progress value={importProgress} />
        <p class="text-muted-foreground text-sm">{importStatus}</p>
        {#if importProgress > 0}
          <p class="text-muted-foreground text-xs">{importProgress}% complete</p>
        {/if}
      </CardContent>
    </Card>
  {/if}

  <!-- Import Results -->
  {#if importResult}
    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          {#if importResult.success}
            <CheckCircle class="h-5 w-5 text-green-500" />
          {:else}
            <XCircle class="h-5 w-5 text-red-500" />
          {/if}
          Import Results
        </CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div class="text-center">
            <p class="text-2xl font-bold text-green-600">{importResult.imported}</p>
            <p class="text-muted-foreground text-sm">Imported</p>
          </div>
          <div class="text-center">
            <p class="text-2xl font-bold text-yellow-600">{importResult.skipped}</p>
            <p class="text-muted-foreground text-sm">Skipped</p>
          </div>
          <div class="text-center">
            <p class="text-2xl font-bold text-blue-600">{importResult.files.imported}</p>
            <p class="text-muted-foreground text-sm">Files Imported</p>
          </div>
          <div class="text-center">
            <p class="text-2xl font-bold text-red-600">{importResult.files.failed}</p>
            <p class="text-muted-foreground text-sm">Files Failed</p>
          </div>
        </div>

        {#if importResult.errors.length > 0}
          <Separator />
          <div class="space-y-2">
            <Label class="flex items-center gap-2">
              <AlertCircle class="h-4 w-4" />
              Errors ({importResult.errors.length})
            </Label>
            <div class="max-h-32 space-y-1 overflow-y-auto">
              {#each importResult.errors as error, index (index)}
                <p class="text-sm text-red-600">{error}</p>
              {/each}
            </div>
          </div>
        {/if}
      </CardContent>
    </Card>
  {/if}
</div>
