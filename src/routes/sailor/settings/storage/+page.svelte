<script lang="ts">
  import { Button } from 'sailorcms/components/ui/button/index.js';
  import * as Card from 'sailorcms/components/ui/card/index.js';
  import { Badge } from 'sailorcms/components/ui/badge/index.js';
  import { toast } from 'sailorcms/core/ui/toast';
  import { m } from '$sailor/i18n';
  import { pluralize } from 'sailorcms/utils/ui/text';
  import { formatFileSize } from 'sailorcms/utils/files/client';
  import {
    Cloud,
    HardDrive,
    FileText,
    Wrench,
    Loader2,
    Download,
    Trash2,
    FolderTree
  } from '@lucide/svelte';
  import type { PageData } from './$types';
  import Header from 'sailorcms/components/sailor/Header.svelte';

  const { data }: { data: PageData } = $props();

  import { repairFileUrls, checkFiles, importFiles } from 'sailorcms/remote/files.remote.js';
  import { purgeImageCache } from 'sailorcms/remote/storage.remote.js';

  let isPurging = $state(false);

  async function purgeCache() {
    if (!confirm(m.settings_storage_image_cache_confirm())) return;
    isPurging = true;
    const result = await purgeImageCache({});
    isPurging = false;
    if (result.success) {
      toast.success(m.settings_storage_image_cache_purged({ count: result.removed }));
    } else {
      toast.error(result.error || m.settings_storage_image_cache_failed());
    }
  }

  // State for tracking scan results
  let importScanResult: any = $state(null);
  let repairScanResult: any = $state(null);
  let isScanning = $state(false);

  async function repair(dryRun = false) {
    const result = await repairFileUrls({ dryRun, provider: 'auto' });
    if (result.success) {
      const count = (result as any).repaired || 0;
      if (dryRun) {
        repairScanResult = result;
        toast.success(m.toast_repair_analysis({ count }));
      } else {
        toast.success(m.toast_repair_completed({ count }));
        repairScanResult = null; // Reset after actual repair
      }
    } else {
      toast.error(result.error || m.toast_repair_failed());
    }
  }

  async function check() {
    isScanning = true;
    const result = await checkFiles({});
    isScanning = false;

    if (result.success) {
      importScanResult = result;
      toast.success(result.message);
    } else {
      toast.error(result.error || m.toast_check_failed());
    }
  }

  async function doImport() {
    const result = await importFiles({ dryRun: false });
    if (result.success) {
      toast.success(result.message);
      importScanResult = null; // Reset after actual import
    } else {
      toast.error(result.error || m.toast_import_failed());
    }
  }

  function getProviderColor(provider: string | undefined) {
    switch (provider) {
      case 's3':
        return 'bg-blue-100 text-blue-800';
      case 'local':
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }
</script>

<svelte:head>
  <title>{m.settings_storage_page_title()} - Sailor CMS</title>
</svelte:head>

<div class="container mx-auto px-6">
  <Header title={m.settings_storage_page_title()} description={m.settings_storage_description()} />

  <div class="flex flex-col gap-6">
    <!-- Current Configuration -->
    <Card.Root>
      <Card.Header>
        <Card.Title class="flex items-center gap-2">
          <FileText class="h-5 w-5" />
          {m.settings_storage_current_config_title()}
        </Card.Title>
        <Card.Description>{m.settings_storage_current_config_description()}</Card.Description>
      </Card.Header>
      <Card.Content class="space-y-4">
        <!-- Provider Info -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            {#if data.displayConfig.provider === 's3'}
              <Cloud class="h-4 w-4" />
              {m.settings_storage_provider_s3()}
            {:else}
              <HardDrive class="h-4 w-4" />
              {m.settings_storage_provider_local()}
            {/if}
            <Badge class={getProviderColor(data.displayConfig.provider)}>
              {data.displayConfig.provider}
            </Badge>
          </div>
        </div>

        <!-- Local Storage Configuration -->
        {#if data.displayConfig.provider === 'local'}
          <div class="grid grid-cols-2 gap-4">
            <div>
              <h4 class="text-muted-foreground mb-1 text-sm font-medium">
                {m.settings_storage_upload_dir()}
              </h4>
              <code class="bg-muted rounded px-2 py-1 text-sm"
                >{data.displayConfig.local.uploadDir}</code
              >
            </div>
            <div>
              <h4 class="text-muted-foreground mb-1 text-sm font-medium">
                {m.settings_storage_public_url()}
              </h4>
              <code class="bg-muted rounded px-2 py-1 text-sm"
                >{data.displayConfig.local.publicUrl}</code
              >
            </div>
          </div>
        {/if}

        <!-- S3 Configuration -->
        {#if data.displayConfig.provider === 's3' && data.displayConfig.s3}
          <div class="space-y-3">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <h4 class="text-muted-foreground mb-1 text-sm font-medium">
                  {m.settings_storage_s3_bucket()}
                </h4>
                <code class="bg-muted rounded px-2 py-1 text-sm"
                  >{data.displayConfig.s3.bucket}</code
                >
              </div>
              <div>
                <h4 class="text-muted-foreground mb-1 text-sm font-medium">
                  {m.settings_storage_aws_region()}
                </h4>
                <code class="bg-muted rounded px-2 py-1 text-sm"
                  >{data.displayConfig.s3.region}</code
                >
              </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <h4 class="text-muted-foreground mb-1 text-sm font-medium">
                  {m.settings_storage_folder_structure()}
                </h4>
                <code class="bg-muted rounded px-2 py-1 text-sm"
                  >{data.displayConfig.upload?.folderStructure || 'flat'}</code
                >
              </div>
              <div>
                <h4 class="text-muted-foreground mb-1 text-sm font-medium">
                  {m.settings_storage_max_file_size()}
                </h4>
                <code class="bg-muted rounded px-2 py-1 text-sm"
                  >{data.displayConfig.upload?.maxFileSize || '10.0MB'}</code
                >
              </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <h4 class="text-muted-foreground mb-1 text-sm font-medium">
                  {m.settings_storage_public_url()}
                </h4>
                <code class="bg-muted rounded px-2 py-1 text-sm"
                  >{data.displayConfig.s3.publicUrl || m.settings_storage_not_set()}</code
                >
              </div>
            </div>
          </div>
        {/if}
      </Card.Content>
    </Card.Root>

    <!-- Storage Overview -->
    <Card.Root>
      <Card.Header>
        <Card.Title class="flex items-center gap-2">
          <FolderTree class="h-5 w-5" />
          {m.settings_storage_overview_title()}
        </Card.Title>
        <Card.Description>
          {m.settings_storage_overview_description()}
        </Card.Description>
      </Card.Header>
      <Card.Content>
        {#if data.folders.length === 0}
          <p class="text-muted-foreground text-sm">{m.settings_storage_overview_empty()}</p>
        {:else}
          {@const totalFiles = data.folders.reduce((s, f) => s + f.count, 0)}
          {@const totalSize = data.folders.reduce((s, f) => s + f.size, 0)}
          {@const anyTruncated = data.folders.some((f) => f.truncated)}
          <ul class="divide-border bg-muted/30 divide-y rounded-md border">
            <li class="flex items-center gap-3 px-3 py-2">
              <span class="font-mono text-sm font-medium">/</span>
              <span class="text-muted-foreground ml-auto shrink-0 text-xs whitespace-nowrap">
                {data.folders.length}
                {pluralize(
                  data.folders.length,
                  m.common_folder_singular(),
                  m.common_folder_plural()
                )}
                · {totalFiles}{anyTruncated ? '+' : ''}
                {pluralize(totalFiles, m.common_file_singular(), m.common_file_plural())}
                · {formatFileSize(totalSize)}{anyTruncated ? '+' : ''}
              </span>
            </li>
            {#each data.folders as folder (folder.name)}
              <li class="flex items-center gap-3 px-3 py-2">
                <span class="min-w-0 truncate font-mono text-sm">{folder.name}/</span>
                {#if folder.excluded}
                  <Badge variant="secondary" class="shrink-0 text-xs">
                    {m.settings_storage_overview_excluded()}
                  </Badge>
                {/if}
                <span class="text-muted-foreground ml-auto shrink-0 text-xs whitespace-nowrap">
                  {#if folder.count === 0}
                    {m.settings_storage_overview_empty_folder()}
                  {:else}
                    {folder.truncated ? '1000+' : folder.count}
                    {pluralize(folder.count, m.common_file_singular(), m.common_file_plural())}
                    · {formatFileSize(folder.size)}{folder.truncated ? '+' : ''}
                  {/if}
                </span>
              </li>
            {/each}
          </ul>
        {/if}
      </Card.Content>
    </Card.Root>

    <div class="grid grid-cols-1 gap-6 md:grid-cols-3">
      <!-- Import Images -->
      <Card.Root>
        <Card.Header>
          <Card.Title class="flex items-center gap-2">
            <Download class="h-5 w-5" />
            {m.settings_storage_import_title()}
          </Card.Title>
          <Card.Description>
            {m.settings_storage_import_description()}
          </Card.Description>
        </Card.Header>
        <Card.Content class="flex-1 space-y-3">
          {#if importScanResult}
            <p class="text-muted-foreground text-sm">
              {#if importScanResult.stats.imported === 0}
                {m.settings_storage_import_none()}
              {:else}
                {m.settings_storage_import_ready({ count: importScanResult.stats.imported })}
              {/if}
            </p>
            {#if importScanResult.files?.length > 0}
              <div class="bg-muted/50 rounded-md p-3">
                <div class="text-muted-foreground space-y-1 text-xs">
                  {#each importScanResult.files.slice(0, 5) as file}
                    <div class="truncate font-mono">{file.path}</div>
                  {/each}
                  {#if importScanResult.files.length > 5}
                    <div class="text-muted-foreground/70">
                      {m.settings_storage_import_more_files({
                        count: importScanResult.files.length - 5
                      })}
                    </div>
                  {/if}
                </div>
              </div>
            {/if}
          {/if}
        </Card.Content>
        <Card.Footer class="gap-2">
          <Button variant="outline" onclick={check} disabled={isScanning}>
            {#if isScanning}
              <Loader2 class="mr-2 h-4 w-4 animate-spin" />
              {m.settings_storage_scanning()}
            {:else}
              {m.settings_storage_scan_button()}
            {/if}
          </Button>
          {#if importScanResult?.stats?.imported > 0}
            <Button onclick={doImport}>
              {m.settings_storage_import_count_button({ count: importScanResult.stats.imported })}
            </Button>
          {/if}
        </Card.Footer>
      </Card.Root>

      <!-- File URL Repair -->
      <Card.Root>
        <Card.Header>
          <Card.Title class="flex items-center gap-2">
            <Wrench class="h-5 w-5" />
            {m.settings_storage_repair_title()}
          </Card.Title>
          <Card.Description>
            {m.settings_storage_repair_description()}
          </Card.Description>
        </Card.Header>
        <Card.Content class="flex-1 space-y-3">
          {#if repairScanResult}
            <p class="text-muted-foreground text-sm">
              {#if repairScanResult.repaired === 0}
                {m.settings_storage_repair_none()}
              {:else}
                {m.settings_storage_repair_summary({
                  count: repairScanResult.repaired,
                  files: pluralize(
                    repairScanResult.repaired,
                    m.common_file_singular(),
                    m.common_file_plural()
                  )
                })}
              {/if}
            </p>
          {/if}
        </Card.Content>
        <Card.Footer class="gap-2">
          <Button variant="outline" onclick={() => repair(true)}>
            {m.settings_storage_repair_check_button()}
          </Button>
          {#if repairScanResult && repairScanResult.repaired > 0}
            <Button onclick={() => repair(false)}>
              {m.settings_storage_repair_fix_button({ count: repairScanResult.repaired })}
            </Button>
          {/if}
        </Card.Footer>
      </Card.Root>

      <!-- Image Cache -->
      <Card.Root>
        <Card.Header>
          <Card.Title class="flex items-center gap-2">
            <Trash2 class="h-5 w-5" />
            {m.settings_storage_image_cache_title()}
          </Card.Title>
          <Card.Description>
            {m.settings_storage_image_cache_description()}
          </Card.Description>
        </Card.Header>
        <Card.Content class="flex-1" />
        <Card.Footer>
          <Button variant="outline" onclick={purgeCache} disabled={isPurging}>
            {#if isPurging}
              <Loader2 class="mr-2 h-4 w-4 animate-spin" />
              {m.settings_storage_image_cache_purging()}
            {:else}
              {m.settings_storage_image_cache_button()}
            {/if}
          </Button>
        </Card.Footer>
      </Card.Root>
    </div>
  </div>
</div>
