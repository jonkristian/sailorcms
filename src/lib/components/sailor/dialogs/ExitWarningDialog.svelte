<script lang="ts">
  import * as AlertDialog from '$lib/components/ui/alert-dialog';
  import { AlertTriangle } from '@lucide/svelte';

  let {
    open = $bindable(false),
    onConfirm = () => {},
    onCancel = () => {},
    title = 'Unsaved Changes',
    description = 'You have unsaved changes that will be lost. Are you sure you want to continue?'
  } = $props<{
    open: boolean;
    onConfirm: () => void;
    onCancel?: () => void;
    title?: string;
    description?: string;
  }>();

  function handleConfirm() {
    open = false;
    onConfirm();
  }

  function handleCancel() {
    open = false;
    onCancel();
  }
</script>

<AlertDialog.Root bind:open>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title class="flex items-center gap-2">
        <AlertTriangle class="h-5 w-5 text-amber-500" />
        {title}
      </AlertDialog.Title>
      <AlertDialog.Description>
        {description}
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel onclick={handleCancel}>Stay on Page</AlertDialog.Cancel>
      <AlertDialog.Action onclick={handleConfirm}>Leave Page</AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
