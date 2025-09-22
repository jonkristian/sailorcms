<script lang="ts">
  import * as Select from '$lib/components/ui/select';

  const { value, description, required, onChange } = $props<{
    value: boolean;
    description?: string;
    required?: boolean;
    onChange: (value: boolean) => void;
  }>();
</script>

<Select.Root
  type="single"
  value={value === true || value === 'true' ? 'true' : 'false'}
  onValueChange={(newValue) => onChange(newValue === 'true')}
>
  <Select.Trigger class="w-full justify-between text-left font-normal">
    {value === true || value === 'true' ? 'True' : 'False'}
  </Select.Trigger>
  <Select.Content>
    <Select.Item value="true">True</Select.Item>
    <Select.Item value="false">False</Select.Item>
  </Select.Content>
</Select.Root>
