<script lang="ts">
  import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger
  } from '$lib/components/ui/collapsible';
  import { Button } from '$lib/components/ui/button';
  import { ChevronDown, RefreshCw } from '@lucide/svelte';
  import FieldRenderer from '$lib/components/sailor/fields/FieldRenderer.svelte';

  interface Props {
    formData: Record<string, any>;
    entityType: string;
    onChange: (field: string, value: any) => void;
    titleValue?: string;
    siteUrl?: string;
  }

  let { formData, entityType, onChange, titleValue, siteUrl }: Props = $props();

  let isOpen = $state(false);

  // Get effective value (user input or auto-populated fallback)
  function getEffectiveValue(fieldKey: string) {
    const pageTitle = formData.title || titleValue || '';
    const pageSlug = formData.slug || '';
    const canonicalUrl = siteUrl && pageSlug ? `${siteUrl}/${pageSlug}` : '';

    const autoValues = {
      meta_title: pageTitle,
      meta_description: formData.excerpt || '',
      og_title: pageTitle,
      og_description: formData.excerpt || '',
      canonical_url: canonicalUrl
    };

    const userValue = formData[fieldKey];
    const autoValue = autoValues[fieldKey as keyof typeof autoValues];

    // Return user value if it exists and is not empty/null, otherwise return auto value
    return userValue !== null && userValue !== undefined && userValue !== ''
      ? userValue
      : autoValue;
  }

  // Refresh SEO fields from content
  function refreshFromContent() {
    const pageTitle = formData.title || titleValue || '';
    const pageSlug = formData.slug || '';
    const canonicalUrl = siteUrl && pageSlug ? `${siteUrl}/${pageSlug}` : '';

    const autoValues = {
      meta_title: pageTitle,
      meta_description: formData.excerpt || '',
      og_title: pageTitle,
      og_description: formData.excerpt || '',
      canonical_url: canonicalUrl,
      og_image: '',
      noindex: false
    };

    // Update all SEO fields with auto-generated values
    Object.entries(autoValues).forEach(([key, value]) => {
      onChange(key, value);
    });
  }

  // SEO field definitions - simplified without derived
  const seoFields = [
    {
      key: 'meta_title',
      field: {
        type: 'string',
        label: 'Meta Title',
        description: 'Custom title for search engines (overrides page title)',
        placeholder: 'Enter meta title...'
      }
    },
    {
      key: 'meta_description',
      field: {
        type: 'textarea',
        label: 'Meta Description',
        description: 'Description shown in search results (150-160 characters recommended)',
        placeholder: 'Enter meta description...'
      }
    },
    {
      key: 'og_title',
      field: {
        type: 'string',
        label: 'Open Graph Title',
        description: 'Title for social media sharing (leave empty to use meta title)',
        placeholder: 'Enter Open Graph title...'
      }
    },
    {
      key: 'og_description',
      field: {
        type: 'textarea',
        label: 'Open Graph Description',
        description: 'Description for social media sharing (leave empty to use meta description)',
        placeholder: 'Enter Open Graph description...'
      }
    },
    {
      key: 'og_image',
      field: {
        type: 'file',
        label: 'Open Graph Image',
        description: 'Image for social media sharing (1200x630px recommended)',
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
        label: 'Canonical URL',
        description: 'Preferred URL for this content (helps prevent duplicate content issues)',
        placeholder: 'https://yoursite.com/page-slug'
      }
    },
    {
      key: 'noindex',
      field: {
        type: 'boolean',
        label: 'Discourage Search Engine Indexing',
        description: 'Request that search engines do not index this page (not guaranteed)'
      }
    }
  ];
</script>

<div class="space-y-2">
  <Collapsible bind:open={isOpen} class="w-full space-y-1">
    <div class="flex items-center justify-between">
      <span class="text-muted-foreground text-sm leading-none font-medium tracking-wide uppercase"
        >SEO Settings</span
      >
      <div class="flex items-center gap-2">
        <Button variant="ghost" size="sm" class="h-7 px-2 text-xs" onclick={refreshFromContent}>
          <RefreshCw class="mr-1 h-3 w-3" />
          Refresh from Content
        </Button>
        <CollapsibleTrigger class="flex items-center justify-center">
          <Button variant="ghost" size="sm" class="flex h-7 w-7 items-center justify-center p-0">
            <ChevronDown class="h-3.5 w-3.5" />
            <span class="sr-only">Toggle SEO settings</span>
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
