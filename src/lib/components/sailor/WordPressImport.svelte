<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Badge } from '$lib/components/ui/badge';
  import { FileText, CheckCircle, XCircle, Loader2, AlertCircle } from '@lucide/svelte';
  import { toast } from '$sailor/core/ui/toast';
  import { m } from '$sailor/i18n';
  import * as Select from '$lib/components/ui/select';
  import { Progress } from '$lib/components/ui/progress';
  import { Separator } from '$lib/components/ui/separator';
  import { browser } from '$app/environment';

  let {
    collectionSlug,
    open = $bindable(false),
    onImportComplete
  }: {
    collectionSlug: string;
    open?: boolean;
    onImportComplete?: () => void;
  } = $props();

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
  let previewData: any = $state(null);
  let selectedPostType: string = $state('posts'); // Default to posts

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
  let importResult: {
    success: boolean;
    imported: number;
    skipped: number;
    errors: string[];
    files: { imported: number; failed: number };
    total: number;
  } | null = $state(null);

  // Collection fields
  let availableFields: Array<{ key: string; label: string; type: string }> = $state([]);
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
      toast.error(m.toast_wp_invalid_credentials());
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
        toast.success(m.toast_preview_loaded());
      } else {
        previewError = result.error || m.wp_error_load_preview();
        toast.error(previewError);
      }
    } catch (error) {
      previewError = m.wp_error_connect();
      toast.error(previewError);
      console.error('Preview error:', error);
    } finally {
      loadingPreview = false;
    }
  }

  function goToStep(step: number) {
    currentStep = step;
    if (step === 3 && browser && collectionSlug && availableFields.length === 0) {
      fetchCollectionFields();
    }
  }

  // Import function
  async function startImport() {
    if (!isApiConfigValid) {
      toast.error(m.toast_wp_invalid_credentials());
      return;
    }

    importing = true;
    importProgress = 0;
    importStatus = m.wp_status_connecting();
    importResult = null;

    try {
      // Start import process with manual progress updates
      importStatus = m.wp_status_connecting();
      importProgress = 10;

      const { importWordPressContent } = await import('$sailor/remote/wordpress.remote.js');

      // Update progress during fetch phase
      importStatus = m.wp_status_fetching();
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
        { progress: 40, status: m.wp_status_processing() },
        { progress: 55, status: m.wp_status_categories_tags() },
        { progress: 70, status: m.wp_status_downloading() },
        { progress: 85, status: m.wp_status_finalizing() }
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
      importStatus = m.wp_status_completed();

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

        toast.success(result.data?.message || m.toast_import_completed());
        if (onImportComplete) {
          onImportComplete();
        }
      } else {
        importStatus = m.toast_import_failed();
        toast.error(result.error || m.toast_import_failed());
      }
    } catch (error) {
      importStatus = m.toast_import_failed();
      toast.error(
        m.toast_import_failed_with_error({
          error: error instanceof Error ? error.message : m.toast_unknown_error()
        })
      );
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
</script>

<div class="space-y-4">
  <!-- Step Indicator -->
  <div class="flex items-center justify-between">
    <h2 class="flex items-center gap-2 text-lg font-semibold">
      <FileText class="h-5 w-5" />
      {isMediaLibraryImport
        ? m.wp_import_title_media()
        : m.wp_import_title_collection({ collection: collectionSlug })}
    </h2>
    <div class="text-muted-foreground flex items-center gap-2 text-sm">
      <span class={currentStep >= 1 ? 'text-primary' : ''}>{m.wp_step_connect()}</span>
      <span class="text-muted-foreground">→</span>
      <span class={currentStep >= 2 ? 'text-primary' : ''}>{m.wp_step_select()}</span>
      {#if !isMediaLibraryImport}
        <span class="text-muted-foreground">→</span>
        <span class={currentStep >= 3 ? 'text-primary' : ''}>{m.wp_step_map()}</span>
      {/if}
      <span class="text-muted-foreground">→</span>
      <span
        class={currentStep >= (isMediaLibraryImport ? 3 : 4) ? 'text-primary font-semibold' : ''}
        >{m.wp_step_import_short({ step: isMediaLibraryImport ? 3 : 4 })}</span
      >
    </div>
  </div>

  <!-- Step 1: API Configuration -->
  {#if currentStep === 1}
    <div class="space-y-3">
      <!-- WordPress API Configuration -->
      <div class="border-muted-foreground/20 space-y-4 rounded-lg border p-4">
        <div class="space-y-3">
          <Label for="base-url" class="text-sm font-medium">{m.wp_field_site_url()}</Label>
          <Input
            id="base-url"
            type="url"
            placeholder={m.wp_field_site_url_placeholder()}
            bind:value={apiConfig.baseUrl}
          />
          <p class="text-muted-foreground text-xs">{m.wp_field_site_url_help()}</p>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-2">
            <Label for="username" class="text-sm font-medium">{m.wp_field_username()}</Label>
            <Input
              id="username"
              type="text"
              placeholder={m.wp_field_username_placeholder()}
              bind:value={apiConfig.username}
            />
          </div>
          <div class="space-y-2">
            <Label for="password" class="text-sm font-medium">{m.wp_field_password()}</Label>
            <Input
              id="password"
              type="password"
              placeholder={m.wp_field_password_placeholder()}
              bind:value={apiConfig.password}
            />
          </div>
        </div>
        <p class="text-muted-foreground text-xs">{m.wp_field_credentials_help()}</p>
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
            {m.wp_connecting()}
          {:else}
            {m.wp_button_connect()}
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
            {m.wp_select_what()}
          </CardTitle>
          <p class="text-muted-foreground text-sm">
            {m.wp_connected_to({
              name: previewData.siteInfo.name,
              url: previewData.siteInfo.url
            })}
          </p>
        </CardHeader>
        <CardContent class="space-y-4">
          <div>
            {#if isMediaLibraryImport}
              <h4 class="mb-3 text-sm font-medium">{m.wp_import_media_heading()}</h4>
              <p class="text-muted-foreground mb-4 text-sm">{m.wp_import_media_description()}</p>
              <div class="flex items-center justify-between rounded-md border p-3">
                <div class="flex items-center gap-3">
                  <div class="bg-primary/10 flex h-8 w-8 items-center justify-center rounded-full">
                    <FileText class="text-primary h-4 w-4" />
                  </div>
                  <div>
                    <p class="text-sm font-medium">{m.wp_import_media_label()}</p>
                    <p class="text-muted-foreground text-xs">{m.wp_import_media_meta()}</p>
                  </div>
                </div>
                <Badge variant="outline" class="text-xs">{m.wp_badge_ready()}</Badge>
              </div>
            {:else}
              <h4 class="mb-3 text-sm font-medium">{m.wp_select_post_types_heading()}</h4>
              <p class="text-muted-foreground mb-4 text-sm">
                {m.wp_select_post_types_description()}
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
                        {m.wp_post_type_available({ name: postType.name })}
                      </p>
                    </div>
                    <Badge variant="outline" class="text-xs">{m.wp_badge_available()}</Badge>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        </CardContent>
      </Card>

      <div class="flex gap-2">
        <Button variant="outline" onclick={() => goToStep(1)}>{m.wp_button_back()}</Button>
        <Button
          onclick={() => goToStep(isMediaLibraryImport ? 4 : 3)}
          class="flex-1"
          disabled={!canProceedToMapping}
        >
          {isMediaLibraryImport ? m.wp_button_continue_import() : m.wp_button_continue_mapping()}
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
          <span class="text-sm">{m.wp_loading_fields()}</span>
        </div>
      {:else if availableFields.length > 0}
        <Card>
          <CardHeader class="pb-3">
            <CardTitle class="text-base">
              {m.wp_field_mapping_for({
                label: selectedPostTypeData?.label || selectedPostType
              })}
            </CardTitle>
            <p class="text-muted-foreground text-sm">
              {m.wp_field_mapping_description({ type: selectedPostType })}
            </p>
          </CardHeader>
          <CardContent class="space-y-4">
            <!-- Field Mapping -->
            <div class="space-y-4">
              <!-- Content Field -->
              <div class="bg-muted/30 rounded-md px-3 py-2">
                <div class="flex items-center justify-between">
                  <span class="text-sm font-medium">{m.wp_field_content()}</span>
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
                          {m.wp_dont_import()}
                        {/if}
                      </Select.Trigger>
                      <Select.Content>
                        <Select.Item value="">{m.wp_dont_import()}</Select.Item>
                        {#each availableFields.filter( (f) => ['wysiwyg', 'textarea', 'text'].includes(f.type) ) as field (field.key)}
                          <Select.Item value={field.key}>{field.label} ({field.type})</Select.Item>
                        {/each}
                      </Select.Content>
                    </Select.Root>
                    {#if fieldMappings.content}
                      <div class="flex items-center gap-2">
                        <Checkbox id="content-strip-html" bind:checked={stripHtmlOptions.content} />
                        <Label for="content-strip-html" class="text-muted-foreground text-xs">
                          {m.wp_strip_html()}
                        </Label>
                      </div>
                    {/if}
                  </div>
                </div>
              </div>

              <!-- Excerpt Field -->
              <div class="bg-muted/30 rounded-md px-3 py-2">
                <div class="flex items-center justify-between">
                  <span class="text-sm font-medium">{m.wp_field_excerpt()}</span>
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
                          {m.wp_dont_import()}
                        {/if}
                      </Select.Trigger>
                      <Select.Content>
                        <Select.Item value="">{m.wp_dont_import()}</Select.Item>
                        {#each availableFields.filter( (f) => ['wysiwyg', 'textarea', 'text'].includes(f.type) ) as field (field.key)}
                          <Select.Item value={field.key}>{field.label} ({field.type})</Select.Item>
                        {/each}
                      </Select.Content>
                    </Select.Root>
                    {#if fieldMappings.excerpt}
                      <div class="flex items-center gap-2">
                        <Checkbox id="excerpt-strip-html" bind:checked={stripHtmlOptions.excerpt} />
                        <Label for="excerpt-strip-html" class="text-muted-foreground text-xs">
                          {m.wp_strip_html()}
                        </Label>
                      </div>
                    {/if}
                  </div>
                </div>
              </div>

              <!-- Featured Image Field -->
              <div class="bg-muted/30 flex items-center justify-between rounded-md px-3 py-2">
                <span class="text-sm font-medium">{m.wp_field_featured_image()}</span>
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
                      {m.wp_dont_import()}
                    {/if}
                  </Select.Trigger>
                  <Select.Content>
                    <Select.Item value="">{m.wp_dont_import()}</Select.Item>
                    {#each availableFields.filter( (f) => ['file', 'image'].includes(f.type) ) as field (field.key)}
                      <Select.Item value={field.key}>{field.label} ({field.type})</Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
              </div>

              <!-- Categories Field -->
              <div class="bg-muted/30 flex items-center justify-between rounded-md px-3 py-2">
                <span class="text-sm font-medium">{m.wp_field_categories()}</span>
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
                      {m.wp_dont_import()}
                    {/if}
                  </Select.Trigger>
                  <Select.Content>
                    <Select.Item value="">{m.wp_dont_import()}</Select.Item>
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
              <h4 class="text-sm font-medium">{m.wp_status_mapping()}</h4>
              <div class="grid grid-cols-3 gap-4">
                <div class="space-y-2">
                  <Label for="status-published" class="text-sm"
                    >{m.wp_status_published_arrow()}</Label
                  >
                  <Select.Root
                    type="single"
                    value={statusMapping.publish}
                    onValueChange={(value) => (statusMapping.publish = value)}
                  >
                    <Select.Trigger class="h-8 text-sm">
                      {statusMapping.publish}
                    </Select.Trigger>
                    <Select.Content>
                      <Select.Item value="published">{m.wp_status_value_published()}</Select.Item>
                      <Select.Item value="draft">{m.wp_status_value_draft()}</Select.Item>
                      <Select.Item value="archived">{m.wp_status_value_archived()}</Select.Item>
                      <Select.Item value="private">{m.wp_status_value_private()}</Select.Item>
                    </Select.Content>
                  </Select.Root>
                </div>
                <div class="space-y-2">
                  <Label for="status-draft" class="text-sm">{m.wp_status_draft_arrow()}</Label>
                  <Select.Root
                    type="single"
                    value={statusMapping.draft}
                    onValueChange={(value) => (statusMapping.draft = value)}
                  >
                    <Select.Trigger class="h-8 text-sm">
                      {statusMapping.draft}
                    </Select.Trigger>
                    <Select.Content>
                      <Select.Item value="published">{m.wp_status_value_published()}</Select.Item>
                      <Select.Item value="draft">{m.wp_status_value_draft()}</Select.Item>
                      <Select.Item value="archived">{m.wp_status_value_archived()}</Select.Item>
                      <Select.Item value="private">{m.wp_status_value_private()}</Select.Item>
                    </Select.Content>
                  </Select.Root>
                </div>
                <div class="space-y-2">
                  <Label for="status-private" class="text-sm">{m.wp_status_private_arrow()}</Label>
                  <Select.Root
                    type="single"
                    value={statusMapping.private}
                    onValueChange={(value) => (statusMapping.private = value)}
                  >
                    <Select.Trigger class="h-8 text-sm">
                      {statusMapping.private}
                    </Select.Trigger>
                    <Select.Content>
                      <Select.Item value="published">{m.wp_status_value_published()}</Select.Item>
                      <Select.Item value="draft">{m.wp_status_value_draft()}</Select.Item>
                      <Select.Item value="archived">{m.wp_status_value_archived()}</Select.Item>
                      <Select.Item value="private">{m.wp_status_value_private()}</Select.Item>
                    </Select.Content>
                  </Select.Root>
                </div>
              </div>
            </div>

            <Separator />

            <!-- Import Options -->
            <div class="space-y-4">
              <h4 class="text-sm font-medium">{m.wp_options_heading()}</h4>
              <div class="flex flex-wrap gap-6">
                <div class="flex items-center space-x-2">
                  <Checkbox id="create-categories" bind:checked={createCategories} />
                  <Label for="create-categories" class="text-sm"
                    >{m.wp_option_create_categories()}</Label
                  >
                </div>
                <div class="flex items-center space-x-2">
                  <Checkbox id="create-tags" bind:checked={createTags} />
                  <Label for="create-tags" class="text-sm">{m.wp_option_create_tags()}</Label>
                </div>
                <div class="flex items-center space-x-2">
                  <Checkbox id="skip-existing-slugs" bind:checked={skipExistingSlugs} />
                  <Label for="skip-existing-slugs" class="text-sm"
                    >{m.wp_option_skip_duplicates()}</Label
                  >
                </div>
                <div class="flex items-center space-x-2">
                  <Checkbox id="try-author-matching" bind:checked={tryEmailMatching} />
                  <Label for="try-author-matching" class="text-sm">
                    {m.wp_option_match_authors()}
                  </Label>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      {/if}

      <div class="flex gap-2">
        <Button variant="outline" onclick={() => goToStep(2)}>{m.wp_button_back()}</Button>
        <Button onclick={() => goToStep(4)} class="flex-1" disabled={availableFields.length === 0}>
          {m.wp_button_continue_summary()}
        </Button>
      </div>
    </div>
  {/if}

  <!-- Step 4: Import -->
  {#if currentStep === 4}
    <div class="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{m.wp_ready_title()}</CardTitle>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="space-y-4">
            <div>
              <h4 class="mb-3 text-sm font-medium">{m.wp_summary_heading()}</h4>
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
                        <p class="text-sm font-medium">{m.wp_import_media_label()}</p>
                        <p class="text-muted-foreground text-xs">{m.wp_import_media_meta()}</p>
                      {:else}
                        <p class="text-sm font-medium">
                          {selectedPostTypeData?.label || selectedPostType}
                        </p>
                        <p class="text-muted-foreground text-xs">
                          {m.wp_summary_post_type({ type: selectedPostType })}
                        </p>
                      {/if}
                    </div>
                  </div>
                  <Badge variant="secondary" class="text-sm">{m.wp_badge_available()}</Badge>
                </div>
              </div>
            </div>

            {#if !isMediaLibraryImport}
              <Separator />

              <div>
                <h4 class="mb-3 text-sm font-medium">{m.wp_field_mappings_heading()}</h4>
                <div class="space-y-2 text-sm">
                  <div class="flex justify-between">
                    <span class="text-muted-foreground">{m.wp_label_content()}</span>
                    <div class="text-right">
                      <div>
                        {fieldMappings.content
                          ? availableFields.find((f) => f.key === fieldMappings.content)?.label ||
                            fieldMappings.content
                          : m.wp_not_imported()}
                      </div>
                      {#if fieldMappings.content}
                        <div class="text-muted-foreground text-xs">
                          {stripHtmlOptions.content ? m.wp_strip_html() : m.wp_keep_html()}
                        </div>
                      {/if}
                    </div>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-muted-foreground">{m.wp_label_excerpt()}</span>
                    <div class="text-right">
                      <div>
                        {fieldMappings.excerpt
                          ? availableFields.find((f) => f.key === fieldMappings.excerpt)?.label ||
                            fieldMappings.excerpt
                          : m.wp_not_imported()}
                      </div>
                      {#if fieldMappings.excerpt}
                        <div class="text-muted-foreground text-xs">
                          {stripHtmlOptions.excerpt ? m.wp_strip_html() : m.wp_keep_html()}
                        </div>
                      {/if}
                    </div>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-muted-foreground">{m.wp_label_featured_image()}</span>
                    <span
                      >{fieldMappings.featured_image
                        ? availableFields.find((f) => f.key === fieldMappings.featured_image)
                            ?.label || fieldMappings.featured_image
                        : m.wp_not_imported()}</span
                    >
                  </div>
                  <div class="flex justify-between">
                    <span class="text-muted-foreground">{m.wp_label_categories()}</span>
                    <span
                      >{fieldMappings.categories
                        ? availableFields.find((f) => f.key === fieldMappings.categories)?.label ||
                          fieldMappings.categories
                        : m.wp_not_imported()}</span
                    >
                  </div>
                </div>
              </div>

              <Separator />
            {/if}

            {#if !isMediaLibraryImport}
              <div>
                <h4 class="mb-3 text-sm font-medium">{m.wp_options_summary_heading()}</h4>
                <div class="space-y-1 text-sm">
                  <div class="flex justify-between">
                    <span class="text-muted-foreground">{m.wp_label_create_categories()}</span>
                    <span>{createCategories ? m.wp_value_yes() : m.wp_value_no()}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-muted-foreground">{m.wp_label_create_tags()}</span>
                    <span>{createTags ? m.wp_value_yes() : m.wp_value_no()}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-muted-foreground">{m.wp_label_skip_duplicates()}</span>
                    <span>{skipExistingSlugs ? m.wp_value_yes() : m.wp_value_no()}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-muted-foreground">{m.wp_label_author_matching()}</span>
                    <span>
                      {tryEmailMatching ? m.wp_author_match_name() : m.wp_author_match_current()}
                    </span>
                  </div>
                </div>
              </div>
            {:else}
              <div>
                <h4 class="mb-3 text-sm font-medium">{m.wp_media_import_heading()}</h4>
                <div class="space-y-1 text-sm">
                  <div class="flex justify-between">
                    <span class="text-muted-foreground">{m.wp_label_import_type()}</span>
                    <span>{m.wp_value_media_only()}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-muted-foreground">{m.wp_label_metadata()}</span>
                    <span>{m.wp_value_metadata()}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-muted-foreground">{m.wp_label_duplicates()}</span>
                    <span>{m.wp_value_duplicates_skipped()}</span>
                  </div>
                </div>
              </div>
            {/if}
          </div>
        </CardContent>
      </Card>

      <div class="flex gap-2">
        <Button variant="outline" onclick={() => goToStep(3)}>{m.wp_button_back()}</Button>
        <Button onclick={startImport} disabled={importing} class="flex-1">
          {#if importing}
            <Loader2 class="mr-2 h-4 w-4 animate-spin" />
            {m.wp_importing_dots()}
          {:else}
            {m.wp_button_start_import()}
          {/if}
        </Button>
      </div>
    </div>
  {/if}

  <!-- Import Progress -->
  {#if importing}
    <Card>
      <CardHeader>
        <CardTitle>{m.wp_importing_dots()}</CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <Progress value={importProgress} />
        <p class="text-muted-foreground text-sm">{importStatus}</p>
        {#if importProgress > 0}
          <p class="text-muted-foreground text-xs">
            {m.wp_progress_complete({ percent: importProgress })}
          </p>
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
          {m.wp_results_title()}
        </CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div class="text-center">
            <p class="text-2xl font-bold text-green-600">{importResult.imported}</p>
            <p class="text-muted-foreground text-sm">{m.wp_results_imported()}</p>
          </div>
          <div class="text-center">
            <p class="text-2xl font-bold text-yellow-600">{importResult.skipped}</p>
            <p class="text-muted-foreground text-sm">{m.wp_results_skipped()}</p>
          </div>
          <div class="text-center">
            <p class="text-2xl font-bold text-blue-600">{importResult.files.imported}</p>
            <p class="text-muted-foreground text-sm">{m.wp_results_files_imported()}</p>
          </div>
          <div class="text-center">
            <p class="text-2xl font-bold text-red-600">{importResult.files.failed}</p>
            <p class="text-muted-foreground text-sm">{m.wp_results_files_failed()}</p>
          </div>
        </div>

        {#if importResult.errors.length > 0}
          <Separator />
          <div class="space-y-2">
            <Label class="flex items-center gap-2">
              <AlertCircle class="h-4 w-4" />
              {m.wp_results_errors_label({ count: importResult.errors.length })}
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
