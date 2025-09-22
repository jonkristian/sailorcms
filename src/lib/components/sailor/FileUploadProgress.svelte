<script lang="ts">
  import { Progress } from '$lib/components/ui/progress';
  import { Button } from '$lib/components/ui/button';
  import { X, Upload, CheckCircle, AlertCircle } from '@lucide/svelte';
  import * as Dialog from '$lib/components/ui/dialog';

  interface UploadFile {
    name: string;
    size: number;
    status: 'pending' | 'uploading' | 'success' | 'error';
    progress: number;
    error?: string;
  }

  let {
    open = $bindable(false),
    files = $bindable([]),
    onCancel
  }: {
    open?: boolean;
    files?: UploadFile[];
    onCancel?: () => void;
  } = $props();

  // Computed values
  const totalFiles = $derived(files.length);
  const completedFiles = $derived(files.filter((f) => f.status === 'success').length);
  const failedFiles = $derived(files.filter((f) => f.status === 'error').length);
  const uploadingFiles = $derived(files.filter((f) => f.status === 'uploading').length);
  const pendingFiles = $derived(files.filter((f) => f.status === 'pending').length);

  const overallProgress = $derived(() => {
    if (totalFiles === 0) return 0;
    const totalProgress = files.reduce((sum, file) => sum + file.progress, 0);
    return Math.round(totalProgress / totalFiles);
  });

  const isComplete = $derived(completedFiles + failedFiles === totalFiles);
  const hasErrors = $derived(failedFiles > 0);

  function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case 'success':
        return CheckCircle;
      case 'error':
        return AlertCircle;
      case 'uploading':
        return Upload;
      default:
        return null;
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'success':
        return 'text-green-600';
      case 'error':
        return 'text-red-600';
      case 'uploading':
        return 'text-blue-600';
      default:
        return 'text-gray-400';
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-xl">
    <Dialog.Header>
      <Dialog.Title class="flex items-center gap-2">
        <Upload class="h-5 w-5" />
        Uploading Files
      </Dialog.Title>
      <Dialog.Description>
        {#if isComplete}
          {#if hasErrors}
            Upload completed with {failedFiles} error{failedFiles > 1 ? 's' : ''}
          {:else}
            All files uploaded successfully!
          {/if}
        {:else}
          Uploading {uploadingFiles} of {totalFiles} files
        {/if}
      </Dialog.Description>
    </Dialog.Header>

    <div class="space-y-4">
      <!-- Overall Progress -->
      <div class="space-y-2">
        <div class="flex justify-between text-sm">
          <span>Overall Progress</span>
          <span>{overallProgress()}%</span>
        </div>
        <Progress value={overallProgress()} class="w-full" />
        <div class="text-muted-foreground flex justify-between text-xs">
          <span>{completedFiles} completed</span>
          <span>{pendingFiles} pending</span>
        </div>
      </div>

      <!-- File List -->
      <div class="max-h-60 space-y-2 overflow-y-auto">
        {#each files as file (file.name)}
          <div class="flex items-center gap-3 rounded-lg border p-2">
            <div class="flex-shrink-0">
              {#if getStatusIcon(file.status)}
                {@const IconComponent = getStatusIcon(file.status)}
                <IconComponent class="h-4 w-4 {getStatusColor(file.status)}" />
              {:else}
                <div class="h-4 w-4 rounded-full border-2 border-gray-300"></div>
              {/if}
            </div>

            <div class="min-w-0 flex-1 overflow-hidden">
              <div class="max-w-full truncate text-sm font-medium" title={file.name}>
                {file.name}
              </div>
              <div class="text-muted-foreground text-xs">
                {formatFileSize(file.size)}
                {#if file.status === 'uploading'}
                  • {file.progress}%
                {/if}
              </div>

              {#if file.status === 'uploading'}
                <Progress value={file.progress} class="mt-1 w-full" />
              {/if}

              {#if file.error}
                <div class="mt-1 text-xs break-words text-red-600">{file.error}</div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </div>

    <Dialog.Footer class="flex justify-between">
      <div class="text-muted-foreground text-sm">
        {#if isComplete}
          {completedFiles} of {totalFiles} files uploaded successfully
        {:else}
          {uploadingFiles} uploading, {pendingFiles} pending
        {/if}
      </div>

      <div class="flex gap-2">
        {#if onCancel && !isComplete}
          <Button variant="outline" onclick={onCancel}>Cancel</Button>
        {/if}
      </div>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
