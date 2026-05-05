<script lang="ts">
  import { Textarea } from 'sailorcms/components/ui/textarea/index.js';

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

<Textarea
  {value}
  {placeholder}
  {required}
  class="min-h-[120px]"
  oninput={(e) => onChange((e.target as HTMLTextAreaElement).value)}
/>
