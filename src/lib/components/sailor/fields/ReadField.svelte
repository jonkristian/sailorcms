<script lang="ts">
  import { formatDetailedDate } from '$sailor/core/utils/date';

  const {
    field,
    value,
    fieldKey
  }: {
    field: Record<string, any>;
    value: any;
    fieldKey: string;
  } = $props();

  const label = $derived(field.label || fieldKey.charAt(0).toUpperCase() + fieldKey.slice(1));

  const isEmpty = $derived(
    value === null ||
      value === undefined ||
      value === '' ||
      (Array.isArray(value) && value.length === 0)
  );

  const isLongForm = $derived(field.type === 'wysiwyg' || field.type === 'textarea');

  function isEmail(v: string) {
    return typeof v === 'string' && v.includes('@');
  }

  function isPhone(v: string) {
    return typeof v === 'string' && (v.startsWith('tel:') || /^[+]?[1-9][\d]{0,15}$/.test(v));
  }

  function isUrl(v: string) {
    return typeof v === 'string' && (v.startsWith('http') || v.startsWith('www.'));
  }
</script>

{#if isLongForm}
  <div class="grid grid-cols-[minmax(8rem,12rem)_1fr] items-baseline gap-x-6 py-3">
    <div class="text-muted-foreground text-sm">{label}</div>
    <div class="text-sm">
      {#if isEmpty}
        <span class="text-muted-foreground">—</span>
      {:else if field.type === 'wysiwyg'}
        <div class="prose prose-sm dark:prose-invert max-w-none">
          {@html value}
        </div>
      {:else}
        <div class="leading-relaxed whitespace-pre-wrap">{value}</div>
      {/if}
    </div>
  </div>
{:else}
  <div class="grid grid-cols-[minmax(8rem,12rem)_1fr] items-baseline gap-x-6 py-3">
    <dt class="text-muted-foreground text-sm">{label}</dt>
    <dd class="text-sm">
      {#if isEmpty}
        <span class="text-muted-foreground">—</span>
      {:else if field.type === 'boolean'}
        {value ? 'Yes' : 'No'}
      {:else if field.type === 'date'}
        {formatDetailedDate(value)}
      {:else if field.type === 'select'}
        {field.options?.find((o: any) => o.value === value)?.label || value}
      {:else if field.type === 'email' || (field.type === 'link' && isEmail(value))}
        <a href="mailto:{value}" class="hover:text-primary underline-offset-4 hover:underline">
          {value}
        </a>
      {:else if field.type === 'link' && isPhone(value)}
        <a
          href="tel:{String(value).replace('tel:', '')}"
          class="hover:text-primary underline-offset-4 hover:underline"
        >
          {value}
        </a>
      {:else if field.type === 'link' && isUrl(value)}
        <a
          href={value.startsWith('http') ? value : `https://${value}`}
          target="_blank"
          rel="noopener noreferrer"
          class="hover:text-primary underline-offset-4 hover:underline"
        >
          {value}
        </a>
      {:else if field.type === 'tags'}
        <div class="flex flex-wrap gap-1">
          {#each value as tag}
            <span class="rounded-full border px-2 py-0.5 text-xs">{tag.name || tag}</span>
          {/each}
        </div>
      {:else if field.type === 'file'}
        {Array.isArray(value) ? `${value.length} file${value.length === 1 ? '' : 's'}` : '1 file'}
      {:else if field.type === 'relation'}
        {Array.isArray(value) ? value.join(', ') : value}
      {:else if field.type === 'array'}
        {value.length} item{value.length === 1 ? '' : 's'}
      {:else}
        {value}
      {/if}
    </dd>
  </div>
{/if}
