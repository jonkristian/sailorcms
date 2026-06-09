<script lang="ts">
  import { Input } from 'sailorcms/components/ui/input/index.js';

  // Minimal color field: a native swatch picker paired with a hex text input so
  // a value can be typed or cleared. Stored as a hex string (e.g. "#1d4ed8").
  // A richer popover picker can swap in later behind the same value contract.
  let {
    value = '',
    placeholder = '#000000',
    required = false,
    onChange
  }: {
    value?: string;
    placeholder?: string;
    required?: boolean;
    onChange: (value: string) => void;
  } = $props();

  // <input type="color"> requires a valid hex; fall back to black for the swatch
  // while leaving the stored value empty until the user picks/types.
  const swatch = $derived(/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000');
</script>

<div class="flex items-center gap-2">
  <input
    type="color"
    value={swatch}
    aria-label={placeholder}
    class="border-input h-9 w-10 shrink-0 cursor-pointer rounded-md border bg-transparent p-1"
    oninput={(e) => onChange(e.currentTarget.value)}
  />
  <Input
    value={value ?? ''}
    {placeholder}
    {required}
    class="font-mono"
    oninput={(e) => onChange(e.currentTarget.value)}
  />
</div>
