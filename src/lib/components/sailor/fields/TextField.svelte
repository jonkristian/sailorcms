<script lang="ts">
  import { Input } from '$lib/components/ui/input';

  const { value, placeholder, required, onChange } = $props<{
    value: string;
    placeholder?: string;
    required?: boolean;
    onChange: (value: string) => void;
  }>();
</script>

<Input
  type="text"
  {value}
  {placeholder}
  {required}
  oninput={(e) => onChange((e.target as HTMLInputElement).value)}
/>
