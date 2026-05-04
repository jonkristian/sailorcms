<script lang="ts">
  import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger
  } from '$lib/components/ui/collapsible';
  import { Button } from '$lib/components/ui/button';
  import { ChevronDown, RefreshCw } from '@lucide/svelte';
  import FieldRenderer from '$lib/components/sailor/fields/FieldRenderer.svelte';
  import { m } from '$sailor/i18n';

  interface Props {
    formData: Record<string, any>;
    entityType: string;
    onChange: (field: string, value: any) => void;
    titleValue?: string;
  }

  let { formData, entityType, onChange, titleValue }: Props = $props();

  let isOpen = $state(false);

  // Fields that mirror page content when left empty. canonical_url is intentionally
  // excluded — it's an override-only field; the runtime resolves the default from
  // slug + basePath in `seo.ts`, keeping a single source of truth.
  function getEffectiveValue(fieldKey: string) {
    const pageTitle = formData.title || titleValue || '';

    const autoValues = {
      meta_title: pageTitle,
      meta_description: formData.excerpt || '',
      og_title: pageTitle,
      og_description: formData.excerpt || ''
    };

    const userValue = formData[fieldKey];
    const autoValue = autoValues[fieldKey as keyof typeof autoValues];

    return userValue !== null && userValue !== undefined && userValue !== ''
      ? userValue
      : autoValue;
  }

  function refreshFromContent() {
    const pageTitle = formData.title || titleValue || '';

    const autoValues = {
      meta_title: pageTitle,
      meta_description: formData.excerpt || '',
      og_title: pageTitle,
      og_description: formData.excerpt || '',
      og_image: '',
      noindex: false
    };

    Object.entries(autoValues).forEach(([key, value]) => {
      onChange(key, value);
    });
  }

  // SEO field definitions — labels/descriptions/placeholders are translated.
  const seoFields = $derived([
    {
      key: 'meta_title',
      field: {
        type: 'string',
        label: m.seo_meta_title_label(),
        description: m.seo_meta_title_description(),
        placeholder: m.seo_meta_title_placeholder()
      }
    },
    {
      key: 'meta_description',
      field: {
        type: 'textarea',
        label: m.seo_meta_description_label(),
        description: m.seo_meta_description_description(),
        placeholder: m.seo_meta_description_placeholder()
      }
    },
    {
      key: 'og_title',
      field: {
        type: 'string',
        label: m.seo_og_title_label(),
        description: m.seo_og_title_description(),
        placeholder: m.seo_og_title_placeholder()
      }
    },
    {
      key: 'og_description',
      field: {
        type: 'textarea',
        label: m.seo_og_description_label(),
        description: m.seo_og_description_description(),
        placeholder: m.seo_og_description_placeholder()
      }
    },
    {
      key: 'og_image',
      field: {
        type: 'file',
        label: m.seo_og_image_label(),
        description: m.seo_og_image_description(),
        file: {
          fileType: 'image',
          accept: 'image/*'
        }
      }
    },
    {
      key: 'canonical_url',
      field: {
        type: 'string',
        label: m.seo_canonical_url_label(),
        description: m.seo_canonical_url_description(),
        placeholder: m.seo_canonical_url_placeholder()
      }
    },
    {
      key: 'noindex',
      field: {
        type: 'boolean',
        label: m.seo_noindex_label(),
        description: m.seo_noindex_description()
      }
    }
  ]);
</script>

<div class="space-y-2">
  <Collapsible bind:open={isOpen} class="w-full space-y-1">
    <div class="flex items-center justify-between">
      <span class="text-muted-foreground text-sm leading-none font-medium tracking-wide uppercase"
        >{m.seo_heading()}</span
      >
      <div class="flex items-center gap-2">
        <Button variant="ghost" size="sm" class="h-7 px-2 text-xs" onclick={refreshFromContent}>
          <RefreshCw class="mr-1 h-3 w-3" />
          {m.seo_refresh()}
        </Button>
        <CollapsibleTrigger class="flex items-center justify-center">
          <Button variant="ghost" size="sm" class="flex h-7 w-7 items-center justify-center p-0">
            <ChevronDown class="h-3.5 w-3.5" />
            <span class="sr-only">{m.seo_toggle()}</span>
          </Button>
        </CollapsibleTrigger>
      </div>
    </div>
    <CollapsibleContent class="space-y-2">
      <div class="space-y-4 pt-3">
        {#each seoFields as { key, field } (key)}
          <div class="space-y-2">
            <FieldRenderer
              {field}
              value={getEffectiveValue(key)}
              fieldKey={key}
              {titleValue}
              {entityType}
              onChange={(value) => onChange(key, value)}
            />
          </div>
        {/each}
      </div>
    </CollapsibleContent>
  </Collapsible>
</div>
