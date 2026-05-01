<script lang="ts">
  const {
    field,
    value,
    onChange,
    fieldKey,
    titleValue = null,
    onGenerateSlug = null,
    variant = 'default',
    currentItemId = null,
    entityType = null,
    readonly = false,
    mode = 'edit'
  }: {
    field: Record<string, any>;
    value: any;
    onChange: (value: any) => void;
    fieldKey: string;
    titleValue?: string | null;
    onGenerateSlug?: ((title: string) => void) | null;
    variant?: 'default' | 'main';
    currentItemId?: string | null;
    entityType?: string | null; // e.g., 'collection_posts', 'global_faq'
    readonly?: boolean;
    mode?: 'edit' | 'read';
  } = $props();

  import { Input } from '$lib/components/ui/input';
  import * as InputGroup from '$lib/components/ui/input-group';
  import { Label } from '$lib/components/ui/label';
  import { RefreshCw } from '@lucide/svelte';
  import { slugify } from '$sailor/core/utils/common';
  import { toast } from '$sailor/core/ui/toast';
  import { getUniqueSlug } from '$sailor/remote/collections.remote.js';
  import ArrayField from './ArrayField.svelte';
  import ReadField from './ReadField.svelte';
  import BooleanField from './BooleanField.svelte';
  import DateField from './DateField.svelte';
  import SelectField from './SelectField.svelte';
  import TextField from './TextField.svelte';
  import TextareaField from './TextareaField.svelte';
  import RelationField from './RelationField.svelte';
  import FileField from './FileField.svelte';
  import TagsInput from './TagsInput.svelte';
  import { formatDetailedDate } from '$sailor/core/utils/date';
  import { getUserLocale } from '$sailor/core/ui/user-locale';

  const wysiwygModule = $derived(field.type === 'wysiwyg' ? import('./WysiwygField.svelte') : null);

  function updateValue(newValue: any) {
    if (!readonly) {
      onChange(newValue);
    }
  }

  // Check if this is a slug field
  let isSlugField = $derived(fieldKey === 'slug' || field.title?.toLowerCase().includes('slug'));

  // Function to generate slug from title
  async function generateSlugFromTitle() {
    if (!titleValue) {
      if (onGenerateSlug) {
        onGenerateSlug('');
      } else {
        toast.info('Please enter a title first, then generate the slug');
      }
      return;
    }

    const base = slugify(titleValue, {
      lowercase: true,
      removeStopWords: false,
      maxLength: 60
    });

    let finalSlug = base;
    if (entityType) {
      try {
        const result = await getUniqueSlug({
          entityType,
          slug: base,
          excludeId: currentItemId
        }).run();
        if (result.success && result.slug) finalSlug = result.slug;
      } catch (err) {
        console.warn('Slug uniqueness check failed, using base slug', err);
      }
    }

    updateValue(finalSlug);
    toast.success(
      finalSlug === base
        ? 'Slug generated from title'
        : `Slug generated from title (suffixed to avoid a conflict)`
    );
  }

  async function normalizeSlugOnBlur(e: FocusEvent) {
    const raw = (e.target as HTMLInputElement).value;
    if (!raw) return;
    const base = slugify(raw);
    if (!base) return;

    let finalSlug = base;
    if (entityType) {
      try {
        const result = await getUniqueSlug({
          entityType,
          slug: base,
          excludeId: currentItemId
        }).run();
        if (result.success && result.slug) finalSlug = result.slug;
      } catch (err) {
        console.warn('Slug uniqueness check failed, using base slug', err);
      }
    }

    if (finalSlug !== raw) updateValue(finalSlug);
  }
</script>

{#if mode === 'read'}
  <ReadField {field} {value} {fieldKey} />
{:else}
  <div class="space-y-2">
    {#if field.type !== 'file' && field.showLabel !== false}
      <Label class={variant === 'main' ? 'mb-3 text-lg font-semibold' : ''}>
        {field.label || fieldKey.charAt(0).toUpperCase() + fieldKey.slice(1)}
        {#if field.required}
          <span class="ml-1 text-red-500">*</span>
        {/if}
      </Label>
    {/if}

    {#if field.readonly === false ? false : readonly || field.readonly}
      <!-- Read-only display mode -->
      <div class="space-y-1 text-sm">
        {#if field.type === 'boolean'}
          <div class="bg-input-bg inline-flex items-center gap-2 rounded-lg px-3 py-2">
            <span class="h-3 w-3 rounded-full {value ? 'bg-green-500' : 'bg-muted-foreground/40'}"
            ></span>
            <span class="font-medium">{value ? 'Yes' : 'No'}</span>
          </div>
        {:else if field.type === 'select'}
          <div class="bg-input-bg rounded-lg px-3 py-2 font-medium">
            {field.options?.find((opt: any) => opt.value === value)?.label || value || '-'}
          </div>
        {:else if field.type === 'tags'}
          {#if Array.isArray(value) && value.length > 0}
            <div class="bg-input-bg rounded-lg px-3 py-2">
              <div class="flex flex-wrap gap-1">
                {#each value as tag}
                  <span
                    class="bg-background text-foreground rounded-full border px-2 py-1 text-xs shadow-sm"
                    >{tag.name || tag}</span
                  >
                {/each}
              </div>
            </div>
          {:else}
            <div class="text-muted-foreground bg-input-bg rounded-lg px-3 py-2 italic">No tags</div>
          {/if}
        {:else if field.type === 'email'}
          {#if value}
            <div class="bg-input-bg rounded-lg px-3 py-2">
              <a
                href="mailto:{value}"
                class="text-foreground hover:text-primary font-medium underline-offset-4 transition-colors hover:underline"
                >{value}</a
              >
            </div>
          {:else}
            <div class="text-muted-foreground bg-input-bg rounded-lg px-3 py-2 italic">
              No email
            </div>
          {/if}
        {:else if field.type === 'link'}
          {#if value}
            <div class="bg-input-bg rounded-lg px-3 py-2">
              {#if value.includes('@')}
                <a
                  href="mailto:{value}"
                  class="text-foreground hover:text-primary font-medium underline-offset-4 transition-colors hover:underline"
                  >{value}</a
                >
              {:else if value.startsWith('tel:') || value.match(/^[\+]?[1-9][\d]{0,15}$/)}
                <a
                  href="tel:{value.replace('tel:', '')}"
                  class="text-foreground hover:text-primary font-medium underline-offset-4 transition-colors hover:underline"
                  >{value}</a
                >
              {:else if value.startsWith('http') || value.startsWith('www.')}
                <a
                  href={value.startsWith('http') ? value : `https://${value}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-foreground hover:text-primary font-medium underline-offset-4 transition-colors hover:underline"
                  >{value}</a
                >
              {:else}
                <span class="font-medium">{value}</span>
              {/if}
            </div>
          {:else}
            <div class="text-muted-foreground bg-input-bg rounded-lg px-3 py-2 italic">No link</div>
          {/if}
        {:else if field.type === 'relation'}
          {#if Array.isArray(value) && value.length > 0}
            <div class="bg-input-bg space-y-1 rounded-lg px-3 py-2">
              {#each value as item}
                <div class="bg-background rounded border px-2 py-1 text-sm">{item}</div>
              {/each}
            </div>
          {:else if value}
            <div class="bg-input-bg rounded-lg px-3 py-2">
              <div class="bg-background rounded border px-2 py-1 text-sm">{value}</div>
            </div>
          {:else}
            <div class="text-muted-foreground bg-input-bg rounded-lg px-3 py-2 italic">
              No selection
            </div>
          {/if}
        {:else if field.type === 'file'}
          {#if Array.isArray(value) && value.length > 0}
            <div class="text-muted-foreground bg-input-bg rounded-lg px-3 py-2 font-medium">
              {value.length} files selected
            </div>
          {:else if value}
            <div class="text-muted-foreground bg-input-bg rounded-lg px-3 py-2 font-medium">
              1 file selected
            </div>
          {:else}
            <div class="text-muted-foreground bg-input-bg rounded-lg px-3 py-2 italic">
              No files
            </div>
          {/if}
        {:else if field.type === 'array'}
          {#if Array.isArray(value) && value.length > 0}
            <div class="text-muted-foreground bg-input-bg rounded-lg px-3 py-2 font-medium">
              {value.length} items
            </div>
          {:else}
            <div class="text-muted-foreground bg-input-bg rounded-lg px-3 py-2 italic">
              No items
            </div>
          {/if}
        {:else if field.type === 'textarea' || field.type === 'wysiwyg' || field.type === 'text'}
          <div
            class="bg-input-bg min-h-[80px] rounded-lg px-3 py-3 text-sm leading-relaxed whitespace-pre-wrap"
          >
            {value || '-'}
          </div>
        {:else if field.type === 'date'}
          <div class="bg-input-bg rounded-lg px-3 py-2 font-medium">
            {value ? formatDetailedDate(value, getUserLocale()) : '-'}
          </div>
        {:else}
          <div class="bg-input-bg rounded-lg px-3 py-2 font-medium">{value || '-'}</div>
        {/if}
      </div>
    {:else if field.type === 'string' || field.type === 'text' || field.type === 'textarea' || field.type === 'wysiwyg' || field.type === 'email' || field.type === 'link'}
      {#if isSlugField}
        <InputGroup.Root>
          <InputGroup.Input
            type="text"
            value={value || ''}
            placeholder={field.placeholder}
            required={field.required}
            oninput={(e) => updateValue((e.target as HTMLInputElement).value)}
            onblur={normalizeSlugOnBlur}
          />
          <InputGroup.Addon align="inline-end">
            <InputGroup.Button
              size="icon-xs"
              onclick={generateSlugFromTitle}
              title="Generate slug from title"
              disabled={!titleValue || readonly}
            >
              <RefreshCw class="h-3.5 w-3.5" />
            </InputGroup.Button>
          </InputGroup.Addon>
        </InputGroup.Root>
      {:else if field.type === 'wysiwyg' && wysiwygModule}
        {#await wysiwygModule}
          <div class="flex items-center justify-center rounded-lg border p-8">
            <div class="flex items-center gap-2">
              <div
                class="border-primary h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"
              ></div>
              Loading rich text editor...
            </div>
          </div>
        {:then m}
          <m.default
            value={value || ''}
            mode={field.mode}
            placeholder={field.placeholder}
            required={field.required}
            onChange={updateValue}
          />
        {:catch}
          <div class="bg-input-bg rounded-lg border p-4 text-center">
            <p class="text-muted-foreground">Failed to load rich text editor</p>
          </div>
        {/await}
      {:else if field.type === 'textarea'}
        <TextareaField
          value={value || ''}
          placeholder={field.placeholder}
          required={field.required}
          onChange={updateValue}
        />
      {:else}
        <TextField
          value={value || ''}
          placeholder={field.placeholder}
          required={field.required}
          onChange={updateValue}
        />
      {/if}
    {:else if field.type === 'array' && field.items?.type === 'object'}
      <ArrayField
        label={field.showLabel !== false
          ? field.label || fieldKey.charAt(0).toUpperCase() + fieldKey.slice(1)
          : ''}
        items={value || []}
        itemSchema={field.items.properties || {}}
        required={field.required}
        onChange={updateValue}
      />
    {:else if field.type === 'date'}
      <DateField
        value={value || ''}
        placeholder={field.placeholder}
        required={field.required}
        onChange={updateValue}
      />
    {:else if field.type === 'number'}
      <Input
        type="number"
        value={value || ''}
        placeholder={field.placeholder}
        required={field.required}
        disabled={readonly}
        oninput={(e) => updateValue(Number(e.currentTarget.value))}
      />
    {:else if field.type === 'boolean'}
      <BooleanField value={value || false} required={field.required} onChange={updateValue} />
    {:else if field.type === 'select'}
      <SelectField
        value={value || ''}
        options={field.options || []}
        placeholder={field.placeholder}
        required={field.required}
        onChange={updateValue}
      />
    {:else if field.type === 'relation'}
      <RelationField
        value={value || (field.relation?.type === 'many-to-many' ? [] : '')}
        {field}
        required={field.required}
        onChange={updateValue}
        {currentItemId}
      />
    {:else if field.type === 'file'}
      <FileField value={value || ''} {field} required={field.required} onChange={updateValue} />
    {:else if field.type === 'tags'}
      <TagsInput value={value || []} required={field.required} onChange={updateValue} />
    {:else}
      <TextField
        value={value || ''}
        placeholder={field.placeholder}
        required={field.required}
        onChange={updateValue}
      />
    {/if}
  </div>
{/if}
