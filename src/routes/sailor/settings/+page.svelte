<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Label } from '$lib/components/ui/label';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Save, RotateCcw } from '@lucide/svelte';
  import { toast } from '$sailor/core/ui/toast';
  import { invalidateAll } from '$app/navigation';
  import type { PageData } from './$types';
  import * as Card from '$lib/components/ui/card';
  import Header from '$lib/components/sailor/Header.svelte';

  const { data } = $props<{ data: PageData }>();

  let submitting = $state(false);
  let purging = $state(false);
  let formData = $state({
    siteName: data.settings.siteName,
    siteUrl: data.settings.siteUrl,
    siteDescription: data.settings.siteDescription,
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
      if (formData.allowRegistration) {
        form.append('allowRegistration', 'on');
      }

      const response = await fetch('?/save', {
        method: 'POST',
        body: form
      });
      const result = await response.json();

      if (result.type === 'failure') {
        const errorMessage = result.data?.error || 'Failed to save site settings';
        toast.error(errorMessage);
      } else {
        toast.success(result.message || 'Site settings saved successfully');
        await invalidateAll();
      }
    } catch (error) {
      toast.error('Failed to save site settings');
    } finally {
      submitting = false;
    }
  }

  async function handlePurge() {
    if (
      !confirm(
        'This will remove all old template/environment settings and reload them fresh. Continue?'
      )
    ) {
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
        toast.success(result.data?.message || 'Settings purged successfully');
        await invalidateAll();
      } else {
        toast.error(result.data?.error || 'Failed to purge settings');
      }
    } catch (error) {
      console.error('Purge error:', error);
      toast.error('Failed to purge settings');
    } finally {
      purging = false;
    }
  }
</script>

<svelte:head>
  <title>Settings - Sailor CMS</title>
</svelte:head>

<div class="container mx-auto px-6">
  <Header title="Settings" description="Configure your site's basic information and settings" />

  <form onsubmit={handleSubmit}>
    <Card.Root>
      <Card.Header>
        <Card.Title>Basic Information</Card.Title>
        <Card.Description
          >Configure your site's name, description, and other settings</Card.Description
        >
      </Card.Header>
      <Card.Content class="space-y-6">
        <!-- Site Name -->
        <div class="space-y-2">
          <Label for="siteName">Site Name</Label>
          <Input id="siteName" name="siteName" bind:value={formData.siteName} required />
          <p class="text-muted-foreground text-xs">
            The name of your website, used in templates and API responses
          </p>
        </div>

        <!-- Site URL -->
        <div class="space-y-2">
          <Label for="siteUrl">Site URL</Label>
          <Input id="siteUrl" name="siteUrl" bind:value={formData.siteUrl} type="url" />
          <p class="text-muted-foreground text-xs">
            Base URL for your site, used for canonical links and API responses
          </p>
        </div>

        <!-- Site Description -->
        <div class="space-y-2">
          <Label for="siteDescription">Site Description</Label>
          <Textarea
            id="siteDescription"
            name="siteDescription"
            bind:value={formData.siteDescription}
            rows={3}
          />
          <p class="text-muted-foreground text-xs">
            Default description used in templates and as fallback meta description
          </p>
        </div>

        <!-- User Registration -->
        <div class="space-y-2">
          <Label for="allowRegistration">User Registration</Label>
          <div class="flex items-center space-x-3">
            <input
              id="allowRegistration"
              name="allowRegistration"
              type="checkbox"
              bind:checked={formData.allowRegistration}
              class="border-input focus:ring-ring h-4 w-4 rounded border focus:ring-2"
            />
            <div class="space-y-1">
              <p class="text-sm font-medium">Allow new user registrations</p>
              <p class="text-muted-foreground text-xs">
                When disabled, only existing users can log in. New users cannot sign up.
              </p>
            </div>
          </div>
        </div>

        <!-- Save Button -->
        <div class="flex items-center justify-end border-t pt-6">
          <Button type="submit" disabled={submitting} class="flex items-center gap-2">
            <Save class="h-4 w-4" />
            {submitting ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      </Card.Content>
    </Card.Root>
  </form>

  <!-- Settings Management -->
  <Card.Root class="mt-6">
    <Card.Header>
      <Card.Title class="text-lg">Settings Management</Card.Title>
      <Card.Description>Advanced settings maintenance and cleanup tools</Card.Description>
    </Card.Header>
    <Card.Content>
      <div class="space-y-4">
        <div class="flex items-center justify-between rounded-lg border p-4">
          <div>
            <h4 class="font-medium">Purge & Reload Settings</h4>
            <p class="text-muted-foreground text-sm">
              Remove all old template and environment settings, then reload fresh copies. This helps
              clean up outdated settings after updates.
            </p>
          </div>
          <Button
            variant="destructive"
            onclick={handlePurge}
            disabled={purging}
            class="flex items-center gap-2"
          >
            <RotateCcw class="h-4 w-4" />
            {purging ? 'Purging...' : 'Purge Settings'}
          </Button>
        </div>
      </div>
    </Card.Content>
  </Card.Root>
</div>
