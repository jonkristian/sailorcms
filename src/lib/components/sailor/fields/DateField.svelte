<script lang="ts">
  import { Calendar } from '$lib/components/ui/calendar';
  import * as Popover from '$lib/components/ui/popover';
  import { Button } from '$lib/components/ui/button';
  import { Calendar as CalendarIcon, X } from '@lucide/svelte';
  import {
    CalendarDate,
    type DateValue,
    parseDate,
    getLocalTimeZone
  } from '@internationalized/date';
  import { formatTableDate } from '$sailor/core/utils/date';
  import { getUserLocale } from '$sailor/core/ui/user-locale';

  const {
    value,
    placeholder = 'Pick a date',
    required = false,
    onChange
  }: {
    value: string | null | undefined;
    placeholder?: string;
    required?: boolean;
    onChange: (value: string | null) => void;
  } = $props();

  let open = $state(false);

  function toDateValue(v: string | null | undefined): DateValue | undefined {
    if (!v) return undefined;
    try {
      // Accept ISO (YYYY-MM-DD) directly; tolerate timestamps
      const iso = v.length > 10 ? new Date(v).toISOString().slice(0, 10) : v;
      return parseDate(iso);
    } catch {
      return undefined;
    }
  }

  const calendarValue = $derived(toDateValue(value));

  const displayLabel = $derived.by(() => {
    const dv = calendarValue;
    if (!dv) return placeholder;
    return formatTableDate(dv.toDate(getLocalTimeZone()), getUserLocale());
  });

  function handleChange(next: DateValue | undefined) {
    if (!next) {
      onChange(null);
      return;
    }
    const d = next as CalendarDate;
    const iso = `${d.year.toString().padStart(4, '0')}-${d.month
      .toString()
      .padStart(2, '0')}-${d.day.toString().padStart(2, '0')}`;
    onChange(iso);
    open = false;
  }

  function clear(e: MouseEvent) {
    e.stopPropagation();
    onChange(null);
  }
</script>

<Popover.Root bind:open>
  <Popover.Trigger
    class="border-input bg-input-bg placeholder:text-muted-foreground hover:bg-input-bg/80 focus-visible:border-ring focus-visible:ring-ring/50 flex h-9 w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50"
    aria-required={required}
  >
    <span class="flex min-w-0 flex-1 items-center gap-2">
      <CalendarIcon class="h-4 w-4 shrink-0 opacity-60" />
      <span class="truncate {calendarValue ? '' : 'text-muted-foreground'}">{displayLabel}</span>
    </span>
    {#if calendarValue}
      <button
        type="button"
        onclick={clear}
        class="rounded transition-colors hover:text-red-500 focus:outline-none"
        title="Clear date"
        aria-label="Clear date"
      >
        <X class="h-3.5 w-3.5" />
      </button>
    {/if}
  </Popover.Trigger>
  <Popover.Content class="w-auto p-0" align="start">
    <Calendar
      type="single"
      value={calendarValue}
      onValueChange={handleChange}
      captionLayout="dropdown"
    />
  </Popover.Content>
</Popover.Root>
