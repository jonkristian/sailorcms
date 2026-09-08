<script lang="ts">
  import * as Popover from 'sailorcms/components/ui/popover/index.js';
  import * as Command from 'sailorcms/components/ui/command/index.js';
  import { Button } from 'sailorcms/components/ui/button/index.js';
  import { ChevronsUpDown, Check } from '@lucide/svelte';
  import { m } from '$sailor/i18n';

  interface Props {
    value: string;
    onChange: (value: string) => void;
    id?: string;
    /**
     * Locales this project actually has content for, from `content.i18n.locales`.
     * Offered first, since anything else is a tag the site has no content in.
     */
    contentLocales?: string[];
    placeholder?: string;
  }

  let { value = $bindable(), onChange, id, contentLocales = [], placeholder }: Props = $props();

  /**
   * Deliberately a combobox and not a select. BCP-47 is open-ended — `de-AT`,
   * `pt-BR`, `zh-Hans` and private subtags are all legal — so a fixed list would
   * put a ceiling on a field that does not have one. This makes the common
   * cases discoverable without making the uncommon ones impossible.
   */
  const COMMON = [
    'en',
    'en-US',
    'en-GB',
    'nb-NO',
    'nn-NO',
    'da-DK',
    'sv-SE',
    'fi-FI',
    'is-IS',
    'de-DE',
    'de-AT',
    'de-CH',
    'fr-FR',
    'nl-NL',
    'es-ES',
    'it-IT',
    'pt-PT',
    'pt-BR',
    'pl-PL',
    'cs-CZ',
    'ru-RU',
    'uk-UA',
    'tr-TR',
    'ar',
    'he-IL',
    'hi-IN',
    'zh-Hans',
    'zh-Hant',
    'ja-JP',
    'ko-KR'
  ];

  let open = $state(false);
  let search = $state('');

  /**
   * `Intl.DisplayNames` renders the name in the admin's own language, so a
   * Norwegian admin reads "Nederlandsk" rather than "Dutch". Unknown or
   * malformed tags throw — fall back to the raw code rather than losing the row.
   */
  function displayName(code: string): string {
    try {
      const names = new Intl.DisplayNames([m.locale_display_language()], { type: 'language' });
      return names.of(code) ?? code;
    } catch {
      return code;
    }
  }

  // Configured locales first, then the common set, then whatever is already
  // saved — so an existing value is always visible even if it is in neither.
  const options = $derived([
    ...new Set([...contentLocales, ...COMMON, ...(value ? [value] : [])].filter(Boolean))
  ]);

  const matches = $derived(
    options.filter((code) => {
      const term = search.trim().toLowerCase();
      if (!term) return true;
      return code.toLowerCase().includes(term) || displayName(code).toLowerCase().includes(term);
    })
  );

  function choose(code: string) {
    value = code;
    onChange(code);
    open = false;
    search = '';
  }
</script>

<Popover.Root bind:open>
  <Popover.Trigger {id} class="w-full">
    {#snippet child({ props }: { props: Record<string, any> })}
      <Button
        {...props}
        variant="outline"
        class="w-full justify-between font-normal"
        role="combobox"
        aria-expanded={open}
      >
        {#if value}
          <span class="truncate">
            {displayName(value)}
            <span class="text-muted-foreground ml-1 font-mono text-xs">{value}</span>
          </span>
        {:else}
          <span class="text-muted-foreground">{placeholder ?? m.locale_field_none()}</span>
        {/if}
        <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content class="w-(--bits-popover-anchor-width) p-0" align="start">
    <Command.Root shouldFilter={false}>
      <Command.Input
        value={search}
        oninput={(e) => (search = (e.currentTarget as HTMLInputElement).value)}
        placeholder={m.locale_field_search()}
      />
      <Command.List>
        <!-- A typed tag that matches nothing is still offered. That is the
             escape hatch the list needs in order not to be a ceiling. -->
        {#if search.trim() && !options.some((code) => code.toLowerCase() === search
                .trim()
                .toLowerCase())}
          <Command.Group>
            <Command.Item value={`custom:${search}`} onSelect={() => choose(search.trim())}>
              <span class="truncate">
                {m.locale_field_use_custom({ code: search.trim() })}
              </span>
            </Command.Item>
          </Command.Group>
        {:else if matches.length === 0}
          <Command.Empty>{m.locale_field_empty()}</Command.Empty>
        {/if}

        {#if matches.length > 0}
          <Command.Group>
            {#each matches as code (code)}
              <Command.Item value={code} onSelect={() => choose(code)}>
                <Check
                  class="mr-2 h-4 w-4 shrink-0 {value === code ? 'opacity-100' : 'opacity-0'}"
                />
                <!-- Each row is its own flex box, so `ml-auto` cannot line the
                     codes up with each other — only within one row. A fixed
                     column does. `min-w-0` lets the name truncate instead of
                     pushing the code out of alignment. -->
                <span class="min-w-0 flex-1 truncate">{displayName(code)}</span>
                <span class="text-muted-foreground w-20 shrink-0 text-right font-mono text-xs">
                  {code}
                </span>
              </Command.Item>
            {/each}
          </Command.Group>
        {/if}
      </Command.List>
    </Command.Root>
  </Popover.Content>
</Popover.Root>
