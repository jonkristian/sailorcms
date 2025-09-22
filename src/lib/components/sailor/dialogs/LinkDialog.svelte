<script lang="ts">
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
  } from '$lib/components/ui/dialog';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Button } from '$lib/components/ui/button';
  import * as Select from '$lib/components/ui/select';

  const {
    open,
    url = '',
    text = '',
    target = '_self',
    onSubmit,
    onCancel
  } = $props<{
    open: boolean;
    url?: string;
    text?: string;
    target?: string;
    onSubmit: (url: string, text: string, target: string) => void;
    onCancel: () => void;
  }>();

  let linkUrl = $state(url);
  let linkText = $state(text);
  let linkTarget = $state(target);

  // Update local state when props change
  $effect(() => {
    linkUrl = url;
    linkText = text;
    linkTarget = target;
  });

  function handleSubmit() {
    if (linkUrl.trim()) {
      onSubmit(linkUrl.trim(), linkText.trim(), linkTarget);
    }
  }

  function handleCancel() {
    onCancel();
  }
</script>

<Dialog {open}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Add Link</DialogTitle>
      <DialogDescription>Enter the URL and optional link text for your link.</DialogDescription>
    </DialogHeader>
    <div class="space-y-4">
      <div class="space-y-2">
        <Label for="link-url">URL</Label>
        <Input id="link-url" bind:value={linkUrl} placeholder="https://example.com" type="url" />
      </div>
      <div class="space-y-2">
        <Label for="link-text">Link Text (optional)</Label>
        <Input id="link-text" bind:value={linkText} placeholder="Display text for the link" />
      </div>
      <div class="space-y-2">
        <Label for="link-target">Target</Label>
        <Select.Root
          type="single"
          value={linkTarget}
          onValueChange={(value) => {
            linkTarget = value || '_self';
          }}
        >
          <Select.Trigger id="link-target">
            {linkTarget === '_self'
              ? 'Same window (_self)'
              : linkTarget === '_blank'
                ? 'New tab (_blank)'
                : linkTarget === '_parent'
                  ? 'Parent frame (_parent)'
                  : linkTarget === '_top'
                    ? 'Top window (_top)'
                    : 'Select target'}
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="_self">Same window (_self)</Select.Item>
            <Select.Item value="_blank">New tab (_blank)</Select.Item>
            <Select.Item value="_parent">Parent frame (_parent)</Select.Item>
            <Select.Item value="_top">Top window (_top)</Select.Item>
          </Select.Content>
        </Select.Root>
      </div>
    </div>
    <DialogFooter>
      <Button variant="outline" onclick={handleCancel}>Cancel</Button>
      <Button onclick={handleSubmit}>Add Link</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
