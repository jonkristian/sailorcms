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
    readonly = false
  } = $props<{
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
  }>();

  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Button } from '$lib/components/ui/button';
  import { RefreshCw } from '@lucide/svelte';
  import { slugify } from '$sailor/core/utils/common';
  import { toast } from '$sailor/core/ui/toast';
  import ArrayField from './ArrayField.svelte';
  import BooleanField from './BooleanField.svelte';
  import SelectField from './SelectField.svelte';
  import TextField from './TextField.svelte';
  import TextareaField from './TextareaField.svelte';
  import RelationField from './RelationField.svelte';
  import FileField from './FileField.svelte';
  import TagsInput from './TagsInput.svelte';

  // Dynamic import for WysiwygField to prevent bundling when not needed
  let WysiwygFieldComponent = $state<any>(null);
  let loadingWysiwyg = $state(false);

  async function loadWysiwygField() {
    if (WysiwygFieldComponent || loadingWysiwyg) return;

    loadingWysiwyg = true;
    try {
      const module = await import('./WysiwygField.svelte');
      WysiwygFieldComponent = module.default;
    } catch (error) {
      console.error('Failed to load WysiwygField:', error);
      toast.error('Failed to load rich text editor');
    } finally {
      loadingWysiwyg = false;
    }
  }

  function updateValue(newValue: any) {
    if (!readonly) {
      onChange(newValue);
    }
  }

  // Check if this is a slug field
  const isSlugField = fieldKey === 'slug' || field.title?.toLowerCase().includes('slug');

  // Function to generate slug from title
  function generateSlugFromTitle() {
    if (titleValue) {
      const generatedSlug = slugify(titleValue, {
        lowercase: true,
        removeStopWords: false,
        maxLength: 60
      });
      updateValue(generatedSlug);
      toast.success('Slug generated from title');
    } else if (onGenerateSlug) {
      onGenerateSlug(titleValue || '');
    } else {
      toast.info('Please enter a title first, then generate the slug');
    }
  }

  // Load WysiwygField when needed
  $effect(() => {
    if (field.type === 'wysiwyg' && !WysiwygFieldComponent) {
      loadWysiwygField();
    }
  });
</script>

<div class="space-y-2">
  {#if field.type !== 'file' && field.showLabel !== false}
    <Label class={variant === 'main' ? 'mb-3 text-lg font-semibold' : ''}>
      {field.label || fieldKey.charAt(0).toUpperCase() + fieldKey.slice(1)}
    </Label>
  {/if}

  {#if field.readonly === false ? false : readonly || field.readonly}
    <!-- Read-only display mode -->
    <div class="space-y-1 text-sm">
      {#if field.type === 'boolean'}
        <div class="inline-flex items-center gap-2 rounded-md bg-black/30 px-3 py-2">
          <span class="h-3 w-3 rounded-full {value ? 'bg-green-500' : 'bg-black/30-foreground'}"
          ></span>
          <span class="font-medium">{value ? 'Yes' : 'No'}</span>
        </div>
      {:else if field.type === 'select'}
        <div class="rounded-md bg-black/30 px-3 py-2 font-medium">
          {field.options?.find((opt: any) => opt.value === value)?.label || value || '-'}
        </div>
      {:else if field.type === 'tags'}
        {#if Array.isArray(value) && value.length > 0}
          <div class="rounded-md bg-black/30 px-3 py-2">
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
          <div class="text-muted-foreground rounded-md bg-black/30 px-3 py-2 italic">No tags</div>
        {/if}
      {:else if field.type === 'email'}
        {#if value}
          <div class="rounded-md bg-black/30 px-3 py-2">
            <a
              href="mailto:{value}"
              class="text-foreground hover:text-primary font-medium underline-offset-4 transition-colors hover:underline"
              >{value}</a
            >
          </div>
        {:else}
          <div class="text-muted-foreground rounded-md bg-black/30 px-3 py-2 italic">No email</div>
        {/if}
      {:else if field.type === 'link'}
        {#if value}
          <div class="rounded-md bg-black/30 px-3 py-2">
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
          <div class="text-muted-foreground rounded-md bg-black/30 px-3 py-2 italic">No link</div>
        {/if}
      {:else if field.type === 'relation'}
        {#if Array.isArray(value) && value.length > 0}
          <div class="space-y-1 rounded-md bg-black/30 px-3 py-2">
            {#each value as item}
              <div class="bg-background rounded border px-2 py-1 text-sm">{item}</div>
            {/each}
          </div>
        {:else if value}
          <div class="rounded-md bg-black/30 px-3 py-2">
            <div class="bg-background rounded border px-2 py-1 text-sm">{value}</div>
          </div>
        {:else}
          <div class="text-muted-foreground rounded-md bg-black/30 px-3 py-2 italic">
            No selection
          </div>
        {/if}
      {:else if field.type === 'file'}
        {#if Array.isArray(value) && value.length > 0}
          <div class="text-muted-foreground rounded-md bg-black/30 px-3 py-2 font-medium">
            {value.length} files selected
          </div>
        {:else if value}
          <div class="text-muted-foreground rounded-md bg-black/30 px-3 py-2 font-medium">
            1 file selected
          </div>
        {:else}
          <div class="text-muted-foreground rounded-md bg-black/30 px-3 py-2 italic">No files</div>
        {/if}
      {:else if field.type === 'array'}
        {#if Array.isArray(value) && value.length > 0}
          <div class="text-muted-foreground rounded-md bg-black/30 px-3 py-2 font-medium">
            {value.length} items
          </div>
        {:else}
          <div class="text-muted-foreground rounded-md bg-black/30 px-3 py-2 italic">No items</div>
        {/if}
      {:else if field.type === 'textarea' || field.type === 'wysiwyg' || field.type === 'text'}
        <div
          class="min-h-[80px] rounded-md bg-black/30 px-3 py-3 text-sm leading-relaxed whitespace-pre-wrap"
        >
          {value || '-'}
        </div>
      {:else}
        <div class="rounded-md bg-black/30 px-3 py-2 font-medium">{value || '-'}</div>
      {/if}
    </div>
  {:else if field.type === 'string' || field.type === 'text' || field.type === 'textarea' || field.type === 'wysiwyg' || field.type === 'email' || field.type === 'link'}
    {#if isSlugField}
      <div class="flex gap-2">
        <div class="flex-1">
          <TextField
            value={value || ''}
            placeholder={field.placeholder}
            required={field.required}
            onChange={updateValue}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onclick={generateSlugFromTitle}
          title="Generate slug from title"
          disabled={!titleValue || readonly}
        >
          <RefreshCw class="h-4 w-4" />
        </Button>
      </div>
    {:else if field.type === 'wysiwyg'}
      {#if loadingWysiwyg}
        <div class="flex items-center justify-center rounded-lg border p-8">
          <div class="flex items-center gap-2">
            <div
              class="border-primary h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"
            ></div>
            Loading rich text editor...
          </div>
        </div>
      {:else if WysiwygFieldComponent}
        <WysiwygFieldComponent
          value={value || ''}
          placeholder={field.placeholder}
          required={field.required}
          onChange={updateValue}
        />
      {:else}
        <div class="bg-black/30/30 rounded-lg border p-4 text-center">
          <p class="text-muted-foreground">Click to load rich text editor</p>
          <Button variant="outline" size="sm" onclick={loadWysiwygField} class="mt-2">
            Load Editor
          </Button>
        </div>
      {/if}
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
    <BooleanField value={value || false} onChange={updateValue} />
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
    <FileField value={value || ''} {field} onChange={updateValue} />
  {:else if field.type === 'tags'}
    <TagsInput value={value || []} onChange={updateValue} />
  {:else}
    <TextField
      value={value || ''}
      placeholder={field.placeholder}
      required={field.required}
      onChange={updateValue}
    />
  {/if}
</div>
