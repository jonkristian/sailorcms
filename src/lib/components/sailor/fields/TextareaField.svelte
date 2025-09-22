<script lang="ts">
  import { Textarea } from '$lib/components/ui/textarea';

  const { value, placeholder, required, onChange } = $props<{
    value: string;
    placeholder?: string;
    required?: boolean;
    onChange: (value: string) => void;
  }>();
</script>

<Textarea
  {value}
  {placeholder}
  {required}
  class="min-h-[120px]"
  oninput={(e) => onChange((e.target as HTMLTextAreaElement).value)}
/>
