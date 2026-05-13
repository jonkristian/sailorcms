<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { Button } from 'sailorcms/components/ui/button/index.js';
  import { Label } from 'sailorcms/components/ui/label/index.js';
  import { Badge } from 'sailorcms/components/ui/badge/index.js';
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
  } from 'sailorcms/components/ui/card/index.js';
  import { Alert, AlertDescription } from 'sailorcms/components/ui/alert/index.js';
  import * as Select from 'sailorcms/components/ui/select/index.js';
  import * as Dialog from 'sailorcms/components/ui/dialog/index.js';
  import { toast } from 'sailorcms/core/ui/toast';
  import { Mail, AlertCircle, Send, RotateCcw, CheckCircle2, Copy } from '@lucide/svelte';
  import Header from 'sailorcms/components/sailor/Header.svelte';
  import DataTable from 'sailorcms/components/sailor/table/DataTable.svelte';
  import Pagination from 'sailorcms/components/sailor/Pagination.svelte';
  import { formatTableDate } from 'sailorcms/core/utils/date';
  import { highlightHtmlSync } from 'sailorcms/core/ui/syntax-highlighting';
  import { getUserLocale } from 'sailorcms/core/ui/user-locale';
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
  let selectedEvent = $state<(typeof data.events.items)[number] | null>(null);
  let retrying = $state(false);
  // 'preview' (rendered HTML in sandboxed iframe) | 'source' (raw text/HTML in
  // a <pre>). Defaults to preview when HTML body exists so the admin sees
  // what the recipient saw. Reset on dialog open so prior choice doesn't leak.
  let bodyView = $state<'preview' | 'source'>('preview');

  const eventColumns = [
    { key: 'status', label: m.mail_outbox_col_status() },
    { key: 'to_address', label: m.mail_outbox_col_to() },
    { key: 'subject', label: m.mail_outbox_col_subject() },
    { key: 'created_at', label: m.mail_outbox_col_when() }
  ];

  async function copyMessageId(messageId: string) {
    try {
      await navigator.clipboard.writeText(messageId);
      toast.success(m.mail_outbox_message_id_copied());
    } catch {
      toast.error(m.mail_outbox_message_id_copy_error());
    }
  }

  async function handleRetry(id: string) {
    retrying = true;
    try {
      const body = new FormData();
      body.set('id', id);
      const res = await fetch('?/retry', { method: 'POST', body });
      const result = await res.json();
      if (result.type === 'failure') {
        toast.error(result.data?.error || m.mail_outbox_retry_error());
      } else {
        toast.success(m.mail_outbox_retry_success());
        selectedEvent = null;
        await invalidateAll();
      }
    } catch (e) {
      console.error('Retry mail error:', e);
      toast.error(m.mail_outbox_retry_error());
    } finally {
      retrying = false;
    }
  }

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

  <!--
    Environment summary — what `.env` provides, read-only. Shown only when at
    least one mail env var was synced so a fresh install with nothing wired
    doesn't get an empty card. SMTP and Gmail blocks render independently
    based on what's actually present; credentials show as a checkmark, never
    the value.
  -->
  {#if Object.keys(data.envSettings).length > 0}
    {@const smtpKeys = [
      ['mail.smtp.host', 'SMTP host'],
      ['mail.smtp.port', 'SMTP port'],
      ['mail.smtp.from', 'SMTP from'],
      ['mail.smtp.secure', 'SMTP TLS forced']
    ]}
    {@const gmailKeys = [['mail.gmail.client_id', 'Google OAuth client ID']]}
    {@const hasSmtp =
      smtpKeys.some(([k]) => data.envSettings[k]) || data.envSettings['mail.smtp.credentials_set']}
    {@const hasGmail =
      data.envSettings['mail.gmail.client_id'] || data.envSettings['mail.gmail.client_secret_set']}

    <Card class="mt-6">
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <AlertCircle class="h-5 w-5" />
          {m.settings_mail_env_title()}
        </CardTitle>
        <CardDescription>{m.settings_mail_env_description()}</CardDescription>
      </CardHeader>
      <CardContent class="space-y-6">
        <!--
          2-column grid + label/`<code>`-chip pairs mirror `/sailor/settings/storage`'s
          "Current configuration" card so env-derived info reads the same way
          across the admin. `break-all` accommodates the long Gmail client ID;
          credential rows show a green check rather than the value.
        -->
        {#if hasSmtp}
          <div>
            <h3 class="mb-3 text-sm font-semibold">SMTP</h3>
            <div class="grid grid-cols-2 gap-4">
              {#each smtpKeys as [key, label] (key)}
                {#if data.envSettings[key]}
                  <div>
                    <h4 class="text-muted-foreground mb-1 text-sm font-medium">{label}</h4>
                    <code class="bg-muted block rounded px-2 py-1 text-sm break-all"
                      >{data.envSettings[key]}</code
                    >
                  </div>
                {/if}
              {/each}
              {#if data.envSettings['mail.smtp.credentials_set']}
                <div>
                  <h4 class="text-muted-foreground mb-1 text-sm font-medium">
                    {m.settings_mail_env_credentials_label()}
                  </h4>
                  <code
                    class="bg-muted inline-block rounded px-2 py-1 text-sm text-emerald-600 dark:text-emerald-400"
                    >✓ {m.settings_mail_env_configured()}</code
                  >
                </div>
              {/if}
            </div>
          </div>
        {/if}

        {#if hasGmail}
          <div>
            <h3 class="mb-3 text-sm font-semibold">Gmail</h3>
            <div class="grid grid-cols-2 gap-4">
              {#each gmailKeys as [key, label] (key)}
                {#if data.envSettings[key]}
                  <div>
                    <h4 class="text-muted-foreground mb-1 text-sm font-medium">{label}</h4>
                    <code class="bg-muted block rounded px-2 py-1 text-sm break-all"
                      >{data.envSettings[key]}</code
                    >
                  </div>
                {/if}
              {/each}
              {#if data.envSettings['mail.gmail.client_secret_set']}
                <div>
                  <h4 class="text-muted-foreground mb-1 text-sm font-medium">
                    {m.settings_mail_env_client_secret_label()}
                  </h4>
                  <code
                    class="bg-muted inline-block rounded px-2 py-1 text-sm text-emerald-600 dark:text-emerald-400"
                    >✓ {m.settings_mail_env_configured()}</code
                  >
                </div>
              {/if}
            </div>
          </div>
        {/if}
      </CardContent>
    </Card>
  {/if}

  <!--
    Send events list. "At-a-glance" framing — status summary in the header so
    the admin sees current outbox health at a glance, full pagination below
    for browsing history. Retry updates a row in place (status flips back to
    'sent', attempts increment), so a successful retry naturally clears the
    failed badge.
  -->
  <Card class="mt-6">
    <CardHeader>
      <div class="flex items-start justify-between gap-4">
        <div>
          <CardTitle class="flex items-center gap-2">
            <Mail class="h-5 w-5" />
            {m.settings_mail_events_title()}
          </CardTitle>
          <CardDescription>{m.settings_mail_events_description()}</CardDescription>
        </div>
        {#if data.failedCount > 0}
          <Badge variant="destructive" class="shrink-0">
            <AlertCircle class="mr-1 h-3 w-3" />
            {m.settings_mail_events_failed_count({ count: data.failedCount })}
          </Badge>
        {:else if data.events.items.length > 0}
          <Badge variant="secondary" class="shrink-0">
            <CheckCircle2 class="mr-1 h-3 w-3" />
            {m.settings_mail_events_healthy()}
          </Badge>
        {/if}
      </div>
    </CardHeader>
    <CardContent class="space-y-4">
      {#if data.events.items.length === 0}
        <p class="text-muted-foreground py-4 text-center text-sm">
          {m.mail_outbox_empty()}
        </p>
      {:else}
        <DataTable
          items={data.events.items}
          columns={eventColumns}
          onRowClick={(item) => (selectedEvent = item)}
        >
          {#snippet cellRenderer(item: (typeof data.events.items)[number], column: { key: string })}
            {#if column.key === 'status'}
              <Badge
                variant={item.status === 'sent' ? 'secondary' : 'destructive'}
                class="capitalize"
              >
                {item.status}
              </Badge>
            {:else if column.key === 'to_address'}
              <span class="block truncate font-medium" title={item.to_address}>
                {item.to_address}
              </span>
            {:else if column.key === 'subject'}
              <span class="block truncate" title={item.subject}>{item.subject}</span>
            {:else if column.key === 'created_at'}
              {formatTableDate(item.created_at as any, getUserLocale())}
            {:else}
              {(item as any)[column.key] ?? '-'}
            {/if}
          {/snippet}
        </DataTable>

        {#if data.events.total > data.events.pageSize}
          <Pagination
            page={data.events.page}
            pageSize={data.events.pageSize}
            totalItems={data.events.total}
            totalPages={Math.max(1, Math.ceil(data.events.total / data.events.pageSize))}
            hasNextPage={data.events.page * data.events.pageSize < data.events.total}
            hasPreviousPage={data.events.page > 1}
            useUrlNavigation={true}
            showTotalItems={true}
            showPageSizeSelector={true}
          />
        {/if}
      {/if}
    </CardContent>
  </Card>
</div>

<Dialog.Root
  open={selectedEvent !== null}
  onOpenChange={(o) => {
    if (!o) {
      selectedEvent = null;
      bodyView = 'preview';
    }
  }}
>
  <Dialog.Content class="sm:max-w-4xl">
    {#if selectedEvent}
      {@const event = selectedEvent}
      <Dialog.Header>
        <Dialog.Title class="flex items-center gap-2">
          <Mail class="h-5 w-5" />
          {event.subject}
        </Dialog.Title>
        <Dialog.Description>
          {event.to_address} · {event.driver} · {formatTableDate(
            event.created_at as any,
            getUserLocale()
          )}
        </Dialog.Description>
      </Dialog.Header>

      <div class="space-y-4 py-2">
        <div class="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant={event.status === 'sent' ? 'secondary' : 'destructive'} class="capitalize">
            {event.status}
          </Badge>
          {#if (event.attempts ?? 1) > 1}
            <span class="text-muted-foreground">
              {m.mail_outbox_attempts({ count: event.attempts ?? 1 })} ·
              {m.mail_outbox_last_try({
                when: formatTableDate(event.updated_at as any, getUserLocale())
              })}
            </span>
          {/if}
          {#if event.message_id}
            <!--
              Grouped with status / attempts as one left-aligned metadata
              strip — symmetric right-alignment looked off when the attempts
              text was absent. Buttonified so the admin can copy the ID for
              cross-referencing with the SMTP/Gmail logs.
            -->
            <button
              type="button"
              class="text-muted-foreground hover:text-foreground inline-flex h-5 items-center gap-1.5 leading-none transition-colors"
              onclick={() => copyMessageId(event.message_id!)}
              title={m.mail_outbox_message_id_copy_hint()}
            >
              <span>{m.mail_outbox_message_id_label()}</span>
              <span>{event.message_id}</span>
              <Copy class="h-3 w-3 opacity-60" />
            </button>
          {/if}
        </div>

        {#if event.status === 'failed' && event.error_message}
          <div class="space-y-1">
            <p class="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              {m.mail_outbox_error_label()}
            </p>
            <p
              class="border-destructive/40 bg-destructive/10 text-destructive rounded-md border p-2 text-xs"
            >
              {event.error_message}
            </p>
          </div>
        {/if}

        {#if event.body_text || event.body_html}
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <p class="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                {m.mail_outbox_body_label()}
              </p>
              {#if event.body_html}
                <!--
                  Preview / Source toggle only when HTML is present. Plain-text
                  emails skip the toggle since there's nothing to render
                  differently from source.
                -->
                <div class="bg-muted flex rounded-md p-0.5 text-xs">
                  <button
                    type="button"
                    class={`rounded px-2 py-0.5 ${bodyView === 'preview' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
                    onclick={() => (bodyView = 'preview')}
                  >
                    {m.mail_outbox_body_preview()}
                  </button>
                  <button
                    type="button"
                    class={`rounded px-2 py-0.5 ${bodyView === 'source' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
                    onclick={() => (bodyView = 'source')}
                  >
                    {m.mail_outbox_body_source()}
                  </button>
                </div>
              {/if}
            </div>

            {#if event.body_html && bodyView === 'preview'}
              <!--
                Sandboxed iframe — no `allow-scripts`, no `allow-same-origin`,
                no `allow-top-navigation`. Template HTML can't read parent state,
                can't execute JS, can't redirect the admin. Defense in depth
                even though templates are sailor-controlled.
              -->
              <!--
                Height scales with viewport so desktop gets a generous preview
                while small screens / short windows still fit the dialog frame.
                Floor at 24rem keeps it readable; the body cap stays at 60vh so
                the dialog never out-grows the viewport.
              -->
              <iframe
                title={event.subject}
                srcdoc={event.body_html}
                sandbox=""
                class="bg-background h-[60vh] min-h-96 w-full rounded-md border"
              ></iframe>
            {:else if event.body_html && bodyView === 'source'}
              <!--
                Source view: highlight.js xml grammar over the stored HTML. No
                explicit background — sailor.css forces `.hljs` transparent so
                the dialog's popover background shows through (same look as
                PayloadPreview). Bordered + rounded container matches the
                iframe envelope for a clean Preview/Source toggle.
              -->
              <pre
                class="h-[60vh] min-h-96 overflow-auto rounded-md border p-2 text-xs whitespace-pre-wrap"><code
                  class="hljs language-xml">{@html highlightHtmlSync(event.body_html)}</code
                ></pre>
            {:else}
              <pre
                class="h-[60vh] min-h-96 overflow-auto rounded-md border p-2 text-xs whitespace-pre-wrap">{event.body_text ||
                  event.body_html}</pre>
            {/if}
          </div>
        {/if}
      </div>

      <Dialog.Footer>
        <Button variant="outline" onclick={() => (selectedEvent = null)}>{m.common_close()}</Button>
        {#if event.status === 'failed'}
          <Button onclick={() => handleRetry(event.id)} disabled={retrying}>
            <RotateCcw class="mr-2 h-4 w-4" />
            {retrying ? m.mail_outbox_retrying() : m.mail_outbox_retry()}
          </Button>
        {/if}
      </Dialog.Footer>
    {/if}
  </Dialog.Content>
</Dialog.Root>
