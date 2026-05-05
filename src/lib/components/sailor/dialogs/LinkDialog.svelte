<script lang="ts">
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
  } from 'sailorcms/components/ui/dialog/index.js';
  import { Input } from 'sailorcms/components/ui/input/index.js';
  import { Label } from 'sailorcms/components/ui/label/index.js';
  import { Button } from 'sailorcms/components/ui/button/index.js';
  import * as Select from 'sailorcms/components/ui/select/index.js';
  import { m } from '$sailor/i18n';

  const {
    open,
    url = '',
    text = '',
    target = '_self',
    onSubmit,
    onCancel
  }: {
    open: boolean;
    url?: string;
    text?: string;
    target?: string;
    onSubmit: (url: string, text: string, target: string) => void;
    onCancel: () => void;
  } = $props();

  let linkUrl = $derived(url);
  let linkText = $derived(text);
  let linkTarget = $derived(target);

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
      <DialogTitle>{m.link_dialog_title()}</DialogTitle>
      <DialogDescription>{m.link_dialog_description()}</DialogDescription>
    </DialogHeader>
    <div class="space-y-4">
      <div class="space-y-2">
        <Label for="link-url">{m.link_dialog_field_url()}</Label>
        <Input id="link-url" bind:value={linkUrl} placeholder="https://example.com" type="url" />
      </div>
      <div class="space-y-2">
        <Label for="link-text">{m.link_dialog_field_text()}</Label>
        <Input
          id="link-text"
          bind:value={linkText}
          placeholder={m.link_dialog_field_text_placeholder()}
        />
      </div>
      <div class="space-y-2">
        <Label for="link-target">{m.link_dialog_field_target()}</Label>
        <Select.Root
          type="single"
          value={linkTarget}
          onValueChange={(value) => {
            linkTarget = value || '_self';
          }}
        >
          <Select.Trigger id="link-target">
            {linkTarget === '_self'
              ? m.link_dialog_target_self()
              : linkTarget === '_blank'
                ? m.link_dialog_target_blank()
                : linkTarget === '_parent'
                  ? m.link_dialog_target_parent()
                  : linkTarget === '_top'
                    ? m.link_dialog_target_top()
                    : m.link_dialog_target_select()}
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="_self">{m.link_dialog_target_self()}</Select.Item>
            <Select.Item value="_blank">{m.link_dialog_target_blank()}</Select.Item>
            <Select.Item value="_parent">{m.link_dialog_target_parent()}</Select.Item>
            <Select.Item value="_top">{m.link_dialog_target_top()}</Select.Item>
          </Select.Content>
        </Select.Root>
      </div>
    </div>
    <DialogFooter>
      <Button variant="outline" onclick={handleCancel}>{m.link_dialog_button_cancel()}</Button>
      <Button onclick={handleSubmit}>{m.link_dialog_button_add()}</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
