<script lang="ts">
  import { Button } from 'sailorcms/components/ui/button/index.js';
  import { Label } from 'sailorcms/components/ui/label/index.js';
  import { Input } from 'sailorcms/components/ui/input/index.js';
  import LocaleField from 'sailorcms/components/sailor/fields/LocaleField.svelte';
  import { Textarea } from 'sailorcms/components/ui/textarea/index.js';
  import { Save, RotateCcw } from '@lucide/svelte';
  import { toast } from 'sailorcms/core/ui/toast';
  import { m } from '$sailor/i18n';
  import { invalidateAll } from '$app/navigation';
  import type { PageData } from './$types';
  import * as Card from 'sailorcms/components/ui/card/index.js';
  import Header from 'sailorcms/components/sailor/Header.svelte';

  const { data }: { data: PageData } = $props();

  let submitting = $state(false);
  let purging = $state(false);
  let formData = $state({
    // svelte-ignore state_referenced_locally
    siteName: data.settings.siteName,
    // svelte-ignore state_referenced_locally
    siteUrl: data.settings.siteUrl,
    // svelte-ignore state_referenced_locally
    siteDescription: data.settings.siteDescription,
    // svelte-ignore state_referenced_locally
    siteLang: data.settings.siteLang,
    // svelte-ignore state_referenced_locally
    allowRegistration: data.settings.allowRegistration
  });

  async function handleSubmit(event: Event) {
    event.preventDefault();
    submitting = true;

    try {
      // Create FormData from reactive state, not from form elements
      const form = new FormData();
      form.append('siteName', formData.siteName);
      form.append('siteUrl', formData.siteUrl);
      form.append('siteDescription', formData.siteDescription);
      form.append('siteLang', formData.siteLang);
      if (formData.allowRegistration) {
        form.append('allowRegistration', 'on');
      }

      const response = await fetch('?/save', {
        method: 'POST',
        body: form
      });
      const result = await response.json();

      if (result.type === 'failure') {
        const errorMessage = result.data?.error || m.toast_save_site_settings_failed();
        toast.error(errorMessage);
      } else {
        toast.success(result.message || m.toast_site_settings_saved());
        await invalidateAll();
      }
    } catch (error) {
      toast.error(m.toast_save_site_settings_failed());
    } finally {
      submitting = false;
    }
  }

  async function handlePurge() {
    if (!confirm(m.settings_purge_confirm())) {
      return;
    }

    purging = true;
    try {
      const response = await fetch('?/purge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      const result = await response.json();

      if (result.type === 'success') {
        toast.success(result.data?.message || m.toast_settings_purged());
        await invalidateAll();
      } else {
        toast.error(result.data?.error || m.toast_purge_settings_failed());
      }
    } catch (error) {
      console.error('Purge error:', error);
      toast.error(m.toast_purge_settings_failed());
    } finally {
      purging = false;
    }
  }
</script>

<svelte:head>
  <title>{m.settings_page_title()} - Sailor CMS</title>
</svelte:head>

<div class="container mx-auto px-6">
  <Header title={m.settings_page_title()} description={m.settings_page_description()} />

  <form onsubmit={handleSubmit}>
    <Card.Root>
      <Card.Header>
        <Card.Title>{m.settings_basic_info_title()}</Card.Title>
        <Card.Description>{m.settings_basic_info_description()}</Card.Description>
      </Card.Header>
      <Card.Content class="space-y-6">
        <!-- Site Name -->
        <div class="space-y-2">
          <Label for="siteName">{m.settings_field_site_name()}</Label>
          <Input id="siteName" name="siteName" bind:value={formData.siteName} required />
          <p class="text-muted-foreground text-xs">
            {m.settings_field_site_name_help()}
          </p>
        </div>

        <!-- Site URL -->
        <div class="space-y-2">
          <Label for="siteUrl">{m.settings_field_site_url()}</Label>
          <Input id="siteUrl" name="siteUrl" bind:value={formData.siteUrl} type="url" />
          <p class="text-muted-foreground text-xs">
            {m.settings_field_site_url_help()}
          </p>
        </div>

        <!-- Site Description -->
        <div class="space-y-2">
          <Label for="siteDescription">{m.settings_field_site_description()}</Label>
          <Textarea
            id="siteDescription"
            name="siteDescription"
            bind:value={formData.siteDescription}
            rows={3}
          />
          <p class="text-muted-foreground text-xs">
            {m.settings_field_site_description_help()}
          </p>
        </div>

        <!-- Site Language -->
        <div class="space-y-2">
          <Label for="siteLang">{m.settings_field_site_lang()}</Label>
          <LocaleField
            id="siteLang"
            bind:value={formData.siteLang}
            onChange={(next) => (formData.siteLang = next)}
            contentLocales={data.contentLocales ?? []}
          />
          <input type="hidden" name="siteLang" value={formData.siteLang ?? ''} />
          <p class="text-muted-foreground text-xs">
            {m.settings_field_site_lang_help()}
          </p>
        </div>

        <!-- User Registration -->
        <div class="space-y-2">
          <Label for="allowRegistration">{m.settings_field_user_registration()}</Label>
          <div class="flex items-center space-x-3">
            <input
              id="allowRegistration"
              name="allowRegistration"
              type="checkbox"
              bind:checked={formData.allowRegistration}
              class="border-input focus:ring-ring h-4 w-4 rounded border focus:ring-2"
            />
            <div class="space-y-1">
              <p class="text-sm font-medium">{m.settings_user_registration_label()}</p>
              <p class="text-muted-foreground text-xs">
                {m.settings_user_registration_help()}
              </p>
            </div>
          </div>
        </div>

        <!-- Save Button -->
        <div class="flex items-center justify-end border-t pt-6">
          <Button type="submit" disabled={submitting} class="flex items-center gap-2">
            <Save class="h-4 w-4" />
            {submitting ? m.settings_saving() : m.settings_save_button()}
          </Button>
        </div>
      </Card.Content>
    </Card.Root>
  </form>

  <!-- Settings Management -->
  <Card.Root class="mt-6">
    <Card.Header>
      <Card.Title class="text-lg">{m.settings_management_title()}</Card.Title>
      <Card.Description>{m.settings_management_description()}</Card.Description>
    </Card.Header>
    <Card.Content>
      <div class="space-y-4">
        <div class="flex items-center justify-between rounded-lg border p-4">
          <div>
            <h4 class="font-medium">{m.settings_purge_title()}</h4>
            <p class="text-muted-foreground text-sm">
              {m.settings_purge_description()}
            </p>
          </div>
          <Button
            variant="destructive"
            onclick={handlePurge}
            disabled={purging}
            class="flex items-center gap-2"
          >
            <RotateCcw class="h-4 w-4" />
            {purging ? m.settings_purging() : m.settings_purge_button()}
          </Button>
        </div>
      </div>
    </Card.Content>
  </Card.Root>
</div>
