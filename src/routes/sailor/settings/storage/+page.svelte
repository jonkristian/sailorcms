<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import * as Card from '$lib/components/ui/card';
  import { Badge } from '$lib/components/ui/badge';
  import { toast } from '$sailor/core/ui/toast';
  import { m } from '$sailor/i18n';
  import { pluralize } from '$sailor/utils/ui/text';
  import { Cloud, HardDrive, FileText, Wrench, Loader2, Download } from '@lucide/svelte';
  import type { PageData } from './$types';
  import Header from '$lib/components/sailor/Header.svelte';

  const { data }: { data: PageData } = $props();

  import { repairFileUrls, checkFiles, importFiles } from '$sailor/remote/files.remote.js';

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
      <Card.Content class="space-y-4">
        <div class="flex items-center gap-3">
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

          <div class="text-muted-foreground text-sm">
            {#if !importScanResult}
              {m.settings_storage_import_prompt()}
            {:else if importScanResult.stats.imported === 0}
              {m.settings_storage_import_none()}
            {:else}
              {m.settings_storage_import_ready({ count: importScanResult.stats.imported })}
            {/if}
          </div>
        </div>

        {#if importScanResult?.files?.length > 0}
          <div class="bg-muted/50 rounded-lg p-3">
            <h5 class="mb-2 text-sm font-medium">{m.settings_storage_import_preview_title()}</h5>
            <div class="text-muted-foreground space-y-1 text-sm">
              {#each importScanResult.files.slice(0, 5) as file}
                <div class="font-mono">{file.path}</div>
              {/each}
              {#if importScanResult.files.length > 5}
                <div class="text-muted-foreground text-xs">
                  {m.settings_storage_import_more_files({
                    count: importScanResult.files.length - 5
                  })}
                </div>
              {/if}
            </div>
          </div>
        {/if}
      </Card.Content>
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
      <Card.Content class="space-y-4">
        <div class="flex items-center gap-3">
          <Button variant="outline" onclick={() => repair(true)}
            >{m.settings_storage_repair_check_button()}</Button
          >

          {#if repairScanResult && repairScanResult.repaired > 0}
            <Button onclick={() => repair(false)}>
              {m.settings_storage_repair_fix_button({ count: repairScanResult.repaired })}
            </Button>
          {/if}

          <div class="text-muted-foreground text-sm">
            {#if !repairScanResult}
              {m.settings_storage_repair_prompt()}
            {:else if repairScanResult.repaired === 0}
              {m.settings_storage_repair_none()}
            {:else}
              {m.settings_storage_repair_pending({ count: repairScanResult.repaired })}
            {/if}
          </div>
        </div>

        {#if repairScanResult && repairScanResult.repaired > 0}
          <div class="bg-muted/50 rounded-lg p-3">
            <h5 class="mb-2 text-sm font-medium">{m.settings_storage_repair_will_be_repaired()}</h5>
            <div class="text-muted-foreground text-sm">
              {m.settings_storage_repair_summary({
                count: repairScanResult.repaired,
                files: pluralize(
                  repairScanResult.repaired,
                  m.common_file_singular(),
                  m.common_file_plural()
                )
              })}
            </div>
          </div>
        {/if}
      </Card.Content>
    </Card.Root>
  </div>
</div>
