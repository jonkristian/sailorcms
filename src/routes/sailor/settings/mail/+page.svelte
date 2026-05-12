<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { Button } from 'sailorcms/components/ui/button/index.js';
  import { Label } from 'sailorcms/components/ui/label/index.js';
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
  } from 'sailorcms/components/ui/card/index.js';
  import { Alert, AlertDescription } from 'sailorcms/components/ui/alert/index.js';
  import * as Select from 'sailorcms/components/ui/select/index.js';
  import { toast } from 'sailorcms/core/ui/toast';
  import { Mail, AlertCircle, Send } from '@lucide/svelte';
  import Header from 'sailorcms/components/sailor/Header.svelte';
  import { m } from '$sailor/i18n';

  let { data } = $props();

  let form = $state({
    // svelte-ignore state_referenced_locally
    driver: data.activeDriver,
    // svelte-ignore state_referenced_locally
    senderAccountId: data.senderAccountId
  });
  let saving = $state(false);
  let testing = $state(false);

  const candidates = $derived(data.candidatesByDriver[form.driver] ?? []);
  const driverNeedsAccount = $derived(form.driver in data.candidatesByDriver);
  const selectedCandidateLabel = $derived(
    candidates.find((c) => c.id === form.senderAccountId)?.userLabel ??
      m.settings_mail_sender_auto()
  );

  async function handleSave(event: Event) {
    event.preventDefault();
    saving = true;
    try {
      const body = new FormData();
      body.set('driver', form.driver);
      body.set('sender_account_id', driverNeedsAccount ? form.senderAccountId : '');
      const res = await fetch('?/save', { method: 'POST', body });
      const result = await res.json();
      if (result.type === 'failure') {
        toast.error(result.data?.error || m.settings_mail_save_error());
      } else {
        toast.success(m.settings_mail_save_success());
        await invalidateAll();
      }
    } catch (e) {
      console.error('Save mail settings error:', e);
      toast.error(m.settings_mail_save_error());
    } finally {
      saving = false;
    }
  }

  async function handleTest() {
    testing = true;
    try {
      const res = await fetch('?/test', { method: 'POST', body: new FormData() });
      const result = await res.json();
      if (result.type === 'failure') {
        toast.error(result.data?.error || m.account_mail_test_error_generic());
      } else {
        toast.success(m.settings_mail_test_success());
      }
    } catch (e) {
      console.error('Test mail error:', e);
      toast.error(m.account_mail_test_error_generic());
    } finally {
      testing = false;
    }
  }
</script>

<svelte:head>
  <title>{m.settings_mail_page_title()} - Sailor CMS</title>
</svelte:head>

<Header title={m.settings_mail_page_title()} description={m.settings_mail_page_description()} />

<div>
  <Card>
    <CardHeader>
      <CardTitle class="flex items-center gap-2">
        <Mail class="h-5 w-5" />
        {m.settings_mail_card_title()}
      </CardTitle>
      <CardDescription>{m.settings_mail_card_description()}</CardDescription>
    </CardHeader>
    <CardContent>
      <form onsubmit={handleSave} class="space-y-6">
        <div class="space-y-2">
          <Label>{m.settings_mail_driver_label()}</Label>
          <Select.Root
            type="single"
            value={form.driver}
            onValueChange={(v) => (form.driver = v ?? form.driver)}
          >
            <Select.Trigger class="w-full">{form.driver}</Select.Trigger>
            <Select.Content>
              {#each data.driverNames as name (name)}
                <Select.Item value={name}>{name}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
          <p class="text-muted-foreground text-xs">
            {m.settings_mail_driver_help()}
          </p>
        </div>

        {#if driverNeedsAccount}
          <div class="space-y-2">
            <Label>{m.settings_mail_sender_label()}</Label>
            {#if candidates.length === 0}
              <Alert>
                <AlertCircle class="h-4 w-4" />
                <AlertDescription>
                  {m.settings_mail_sender_none()}
                </AlertDescription>
              </Alert>
            {:else}
              <Select.Root
                type="single"
                value={form.senderAccountId}
                onValueChange={(v) => (form.senderAccountId = v ?? '')}
              >
                <Select.Trigger class="w-full">{selectedCandidateLabel}</Select.Trigger>
                <Select.Content>
                  <Select.Item value="">{m.settings_mail_sender_auto()}</Select.Item>
                  {#each candidates as cand (cand.id)}
                    <Select.Item value={cand.id}>{cand.userLabel}</Select.Item>
                  {/each}
                </Select.Content>
              </Select.Root>
              <p class="text-muted-foreground text-xs">
                {m.settings_mail_sender_help()}
              </p>
            {/if}
          </div>
        {/if}

        <div class="flex gap-2 border-t pt-4">
          <Button type="submit" disabled={saving}>
            {saving ? m.common_saving() : m.common_save()}
          </Button>
          <Button
            type="button"
            variant="outline"
            onclick={handleTest}
            disabled={testing || !data.mailConfigured}
          >
            <Send class="mr-2 h-4 w-4" />
            {testing ? m.account_mail_test_sending() : m.settings_mail_test_button()}
          </Button>
        </div>
      </form>
    </CardContent>
  </Card>
</div>
