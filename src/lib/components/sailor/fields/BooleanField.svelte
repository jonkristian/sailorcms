<script lang="ts">
  import { Switch } from '$lib/components/ui/switch';
  import { m } from '$sailor/i18n';

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
  <span class="text-muted-foreground text-sm">{checked ? m.common_yes() : m.common_no()}</span>
</div>
