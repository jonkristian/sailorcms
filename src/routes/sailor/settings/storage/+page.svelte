<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import * as Card from '$lib/components/ui/card';
  import { Badge } from '$lib/components/ui/badge';
  import { toast } from '$sailor/core/ui/toast';
  import { Cloud, HardDrive, FileText, Wrench, Loader2, Download } from '@lucide/svelte';
  import type { PageData } from './$types';
  import Header from '$lib/components/sailor/Header.svelte';

  const { data } = $props<{ data: PageData }>();

  import { repairFileUrls, checkFiles, importFiles } from '$sailor/remote/files.remote.js';

  // State for tracking scan results
  let importScanResult = $state<any>(null);
  let repairScanResult = $state<any>(null);
  let isScanning = $state(false);

  async function repair(dryRun = false) {
    const result = await repairFileUrls({ dryRun, provider: 'auto' });
    if (result.success) {
      if (dryRun) {
        repairScanResult = result;
        toast.success(`File repair analysis: ${(result as any).repaired || 0} files need repair`);
      } else {
        toast.success(`File repair completed: ${(result as any).repaired || 0} files processed`);
        repairScanResult = null; // Reset after actual repair
      }
    } else {
      toast.error(result.error || 'Repair failed');
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
      toast.error(result.error || 'Check failed');
    }
  }

  async function doImport() {
    const result = await importFiles({ dryRun: false });
    if (result.success) {
      toast.success(result.message);
      importScanResult = null; // Reset after actual import
    } else {
      toast.error(result.error || 'Import failed');
    }
  }

  function getProviderColor(provider: string) {
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
  <title>Storage Settings - Sailor CMS</title>
</svelte:head>

<div class="container mx-auto px-6">
  <Header
    title="Storage Settings"
    description="Configure file storage provider and upload settings"
  />

  <div class="flex flex-col gap-6">
    <!-- Current Configuration -->
    <Card.Root>
      <Card.Header>
        <Card.Title class="flex items-center gap-2">
          <FileText class="h-5 w-5" />
          Current Configuration
        </Card.Title>
        <Card.Description>Storage settings from environment variables</Card.Description>
      </Card.Header>
      <Card.Content class="space-y-4">
        <!-- Provider Info -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            {#if data.displayConfig.provider === 's3'}
              <Cloud class="h-4 w-4" />
              Amazon S3
            {:else}
              <HardDrive class="h-4 w-4" />
              Local Storage
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
              <h4 class="text-muted-foreground mb-1 text-sm font-medium">Upload Directory</h4>
              <code class="bg-muted rounded px-2 py-1 text-sm"
                >{data.displayConfig.local.uploadDir}</code
              >
            </div>
            <div>
              <h4 class="text-muted-foreground mb-1 text-sm font-medium">Public URL</h4>
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
                <h4 class="text-muted-foreground mb-1 text-sm font-medium">S3 Bucket</h4>
                <code class="bg-muted rounded px-2 py-1 text-sm"
                  >{data.displayConfig.s3.bucket}</code
                >
              </div>
              <div>
                <h4 class="text-muted-foreground mb-1 text-sm font-medium">AWS Region</h4>
                <code class="bg-muted rounded px-2 py-1 text-sm"
                  >{data.displayConfig.s3.region}</code
                >
              </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <h4 class="text-muted-foreground mb-1 text-sm font-medium">Folder Structure</h4>
                <code class="bg-muted rounded px-2 py-1 text-sm"
                  >{data.displayConfig.upload?.folderStructure || 'flat'}</code
                >
              </div>
              <div>
                <h4 class="text-muted-foreground mb-1 text-sm font-medium">Max File Size</h4>
                <code class="bg-muted rounded px-2 py-1 text-sm"
                  >{data.displayConfig.upload?.maxFileSize || '10.0MB'}</code
                >
              </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <h4 class="text-muted-foreground mb-1 text-sm font-medium">Public URL</h4>
                <code class="bg-muted rounded px-2 py-1 text-sm"
                  >{data.displayConfig.s3.publicUrl || 'Not set'}</code
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
          Import Files
        </Card.Title>
        <Card.Description>
          Import existing files from storage into the database. Only imports files not already
          tracked. Excludes cache, backup, and hidden folders.
        </Card.Description>
      </Card.Header>
      <Card.Content class="space-y-4">
        <div class="flex items-center gap-3">
          <Button variant="outline" onclick={check} disabled={isScanning}>
            {#if isScanning}
              <Loader2 class="mr-2 h-4 w-4 animate-spin" />
              Scanning...
            {:else}
              Scan Files
            {/if}
          </Button>

          {#if importScanResult?.stats?.imported > 0}
            <Button onclick={doImport}>Import {importScanResult.stats.imported} Files</Button>
          {/if}

          <div class="text-muted-foreground text-sm">
            {#if !importScanResult}
              Click "Scan Files" to check for files to import.
            {:else if importScanResult.stats.imported === 0}
              No new files found to import.
            {:else}
              {importScanResult.stats.imported} files ready to import.
            {/if}
          </div>
        </div>

        {#if importScanResult?.files?.length > 0}
          <div class="bg-muted/50 rounded-lg p-3">
            <h5 class="mb-2 text-sm font-medium">Preview of files to import:</h5>
            <div class="text-muted-foreground space-y-1 text-sm">
              {#each importScanResult.files.slice(0, 5) as file}
                <div class="font-mono">{file.path}</div>
              {/each}
              {#if importScanResult.files.length > 5}
                <div class="text-muted-foreground text-xs">
                  ... and {importScanResult.files.length - 5} more files
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
          File URL Repair
        </Card.Title>
        <Card.Description>
          Fix file URLs for S3/cloud storage compatibility. This repairs existing files that may
          have incorrect URLs.
        </Card.Description>
      </Card.Header>
      <Card.Content class="space-y-4">
        <div class="flex items-center gap-3">
          <Button variant="outline" onclick={() => repair(true)}>Check Files</Button>

          {#if repairScanResult && repairScanResult.repaired > 0}
            <Button onclick={() => repair(false)}>Fix {repairScanResult.repaired} File URLs</Button>
          {/if}

          <div class="text-muted-foreground text-sm">
            {#if !repairScanResult}
              Click "Check Files" to scan for files that need URL repair.
            {:else if repairScanResult.repaired === 0}
              No files need URL repair.
            {:else}
              {repairScanResult.repaired} files need URL repair.
            {/if}
          </div>
        </div>

        {#if repairScanResult && repairScanResult.repaired > 0}
          <div class="bg-muted/50 rounded-lg p-3">
            <h5 class="mb-2 text-sm font-medium">Files that will be repaired:</h5>
            <div class="text-muted-foreground text-sm">
              {repairScanResult.repaired} file{repairScanResult.repaired !== 1 ? 's' : ''} will have
              their URLs updated for proper storage compatibility.
            </div>
          </div>
        {/if}
      </Card.Content>
    </Card.Root>

  </div>
</div>
