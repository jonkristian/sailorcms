<script lang="ts">
  import { Switch } from '$lib/components/ui/switch';

  const {
    value,
    onChange
  }: {
    value: boolean | string;
    description?: string;
    required?: boolean;
    onChange: (value: boolean) => void;
  } = $props();

  const checked = $derived(value === true || value === 'true');
</script>

<div class="flex items-center gap-3">
  <Switch {checked} onCheckedChange={onChange} />
  <span class="text-muted-foreground text-sm">{checked ? 'Yes' : 'No'}</span>
</div>
