<script lang="ts">
  import * as Select from 'sailorcms/components/ui/select/index.js';
  import { getStatusBadge } from 'sailorcms/core/ui/status-badge';

  const {
    value,
    options,
    placeholder,
    required,
    onChange
  }: {
    value: string;
    options: (string | { label: string; value: string })[];
    placeholder?: string;
    required?: boolean;
    onChange: (value: string) => void;
  } = $props();

  // CORE_FIELDS status labels (`Draft` / `Published` / `Private` / `Archived`,
  // plus the legacy `Active` from the older default) are sailor-system text and
  // should follow the admin locale. User-defined select options stay verbatim.
  const KNOWN_STATUS_VALUES = new Set(['draft', 'published', 'private', 'archived', 'active']);
  const localizedLabel = (opt: string | { label: string; value: string }): string => {
    if (typeof opt === 'string') return opt;
    return KNOWN_STATUS_VALUES.has(opt.value) ? getStatusBadge(opt.value).label : opt.label;
  };

  // Find the label for the current value - reactive
  const triggerLabel = $derived.by(() => {
    const match = options.find((opt) =>
      typeof opt === 'string' ? opt === value : opt.value === value
    );
    if (!match) return value;
    return localizedLabel(match);
  });
</script>

<Select.Root type="single" {value} onValueChange={onChange}>
  <Select.Trigger class="w-full justify-between text-left font-normal">
    {triggerLabel || placeholder || 'Select an option'}
  </Select.Trigger>
  <Select.Content>
    {#each options as option}
      {#if typeof option === 'string'}
        <Select.Item value={option}>{option}</Select.Item>
      {:else}
        <Select.Item value={option.value}>{localizedLabel(option)}</Select.Item>
      {/if}
    {/each}
  </Select.Content>
</Select.Root>
