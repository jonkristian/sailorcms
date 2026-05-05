<script lang="ts">
  import { Input } from 'sailorcms/components/ui/input/index.js';

  const {
    value,
    placeholder,
    required,
    onChange
  }: {
    value: string;
    placeholder?: string;
    required?: boolean;
    onChange: (value: string) => void;
  } = $props();
</script>

<Input
  type="text"
  {value}
  {placeholder}
  {required}
  oninput={(e) => onChange((e.target as HTMLInputElement).value)}
/>
