<script lang="ts">
  import type { AdminAlert, AdminAlertKind } from 'sailorcms/core/admin/alerts';
  import type { Component } from 'svelte';
  import MailWarning from '@lucide/svelte/icons/mail-warning';
  import AlertCircle from '@lucide/svelte/icons/alert-circle';

  let {
    alerts,
    class: className = ''
  }: {
    alerts: AdminAlert[];
    class?: string;
  } = $props();

  // `Record<AdminAlertKind, Component>` forces this map to stay exhaustive —
  // adding a new kind in alerts.ts without adding an icon here is a type
  // error rather than a silent fallback at runtime.
  const ICON_BY_KIND: Record<AdminAlertKind, Component<any>> = {
    mail: MailWarning
  };
</script>

{#if alerts.length > 0}
  <div class="{className} space-y-2 px-2 group-data-[collapsible=icon]:hidden">
    {#each alerts as alert (alert.id)}
      {@const Icon = ICON_BY_KIND[alert.kind] ?? AlertCircle}
      {#if alert.href}
        <a
          href={alert.href}
          class="border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15 flex items-start gap-2 rounded-md border p-2 text-xs leading-tight transition-colors"
        >
          <Icon class="mt-0.5 h-4 w-4 shrink-0" />
          <div class="flex-1">
            <p class="font-medium">{alert.title}</p>
            <p class="mt-0.5 opacity-80">{alert.description}</p>
          </div>
        </a>
      {:else}
        <div
          class="border-destructive/40 bg-destructive/10 text-destructive flex items-start gap-2 rounded-md border p-2 text-xs leading-tight"
        >
          <Icon class="mt-0.5 h-4 w-4 shrink-0" />
          <div class="flex-1">
            <p class="font-medium">{alert.title}</p>
            <p class="mt-0.5 opacity-80">{alert.description}</p>
          </div>
        </div>
      {/if}
    {/each}
  </div>
{/if}
