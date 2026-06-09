<script lang="ts">
  import { Switch } from 'sailorcms/components/ui/switch/index.js';
  import { m } from '$sailor/i18n';

  const {
    value,
    onChange
  }: {
    value: boolean | string | number;
    description?: string;
    required?: boolean;
    onChange: (value: boolean) => void;
  } = $props();

  // Accept SQLite's integer booleans (1/0) too — rows read via raw SQL (e.g.
  // block_groups config) skip Drizzle's boolean coercion and arrive as 1/0.
  const checked = $derived(value === true || value === 'true' || value === 1 || value === '1');
</script>

<div class="flex items-center gap-3">
  <Switch {checked} onCheckedChange={onChange} />
  <span class="text-muted-foreground text-sm">{checked ? m.common_yes() : m.common_no()}</span>
</div>
