<script lang="ts">
  import * as Select from '$lib/components/ui/select';

  const { value, options, placeholder, required, onChange } = $props<{
    value: string;
    options: (string | { label: string; value: string })[];
    placeholder?: string;
    required?: boolean;
    onChange: (value: string) => void;
  }>();

  // Find the label for the current value - reactive
  const triggerLabel = $derived(
    options.find((opt: any) => (typeof opt === 'string' ? opt === value : opt.value === value))
      ?.label || value
  );
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
        <Select.Item value={option.value}>{option.label}</Select.Item>
      {/if}
    {/each}
  </Select.Content>
</Select.Root>
