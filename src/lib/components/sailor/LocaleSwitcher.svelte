<script lang="ts">
  import { Globe } from '@lucide/svelte';
  import * as Select from '$lib/components/ui/select';
  import { page } from '$app/state';
  import { locales, m, setLocale, type Locale } from '$sailor/i18n';
  import { updateMyPreferences } from '$sailor/remote/users.remote.js';
  import { resolvePreferences } from 'sailorcms/core/utils/user-preferences';

  const items = $derived([
    { value: 'auto', label: m.account_field_language_auto(), short: 'Auto' },
    ...locales.map((code) => ({
      value: code,
      label: code === 'en' ? 'English' : code === 'nb-NO' ? 'Norsk (bokmål)' : code,
      short: code === 'nb-NO' ? 'NB' : code.toUpperCase()
    }))
  ]);

  const current = $derived(
    resolvePreferences(page.data?.user?.preferences as any).language ?? 'auto'
  );
  const display = $derived(items.find((i) => i.value === current)?.short ?? 'Auto');

  async function handleChange(value: string) {
    if (!value) return;
    // Optimistic flip — apply Paraglide's locale immediately so any
    // component-tree `m.*()` call that re-runs picks up the new strings
    // before the reload completes. Sidebar nav and server-rendered chrome
    // stay on the old locale until the reload, but the trigger button and
    // any reactive surface flip instantly so the click feels responsive.
    if (value !== 'auto' && (locales as readonly string[]).includes(value)) {
      setLocale(value as Locale, { reload: false });
    }
    // Persist if the user is logged in (no-op on auth pages).
    if (page.data?.user) {
      try {
        await updateMyPreferences({ patch: { language: value } });
      } catch (err) {
        console.error('Failed to persist language preference:', err);
      }
    }
    // Hard reload — derived-cached strings (e.g. sidebar nav titles built
    // inside a `$derived(() => …)` closure) won't pick up the new locale
    // without a full re-render. `location.assign(href)` forces it;
    // `location.reload()` was firing but not always navigating in dev.
    window.location.assign(window.location.href);
  }
</script>

<Select.Root type="single" value={current} onValueChange={handleChange}>
  <Select.Trigger aria-label={m.locale_switcher_label()} class="w-auto">
    <Globe class="size-4" />
    <span class="text-xs font-medium">{display}</span>
  </Select.Trigger>
  <Select.Content align="end">
    {#each items as item (item.value)}
      <Select.Item value={item.value}>{item.label}</Select.Item>
    {/each}
  </Select.Content>
</Select.Root>
