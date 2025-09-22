<script lang="ts">
  import { Sheet, SheetContent, SheetHeader, SheetTrigger } from '$lib/components/ui/sheet';
  import { Button } from '$lib/components/ui/button';
  import { Code, Copy } from '@lucide/svelte';
  import { toast } from '$sailor/core/ui/toast';
  import { htmlToTiptapJson } from '$lib/sailor/core/content/content';
  import { formatJson, rehighlightCode } from '$lib/sailor/core/ui/syntax-highlighting';

  let {
    pageId,
    collectionSlug,
    open = $bindable(false),
    initialPayload = $bindable<unknown | null>(null),
    collectionFields = $bindable<Record<string, any>>({}),
    siteUrl = ''
  } = $props<{
    pageId: string;
    collectionSlug: string;
    open?: boolean;
    initialPayload?: unknown | null;
    collectionFields?: Record<string, any>;
    siteUrl?: string;
  }>();

  let highlightedPayload = $state<string>('');
  let rawPayload = $state<string>('');
  let error = $state<string | null>(null);
  let loading = $state(false);

  /**
   * Recursively convert HTML content in wysiwyg fields to JSON
   * Only process fields that are actually wysiwyg type
   */
  function convertWysiwygFieldsToJson(data: any, parentKey?: string, parentContext?: string): any {
    if (typeof data === 'string') {
      // Only convert to TipTap JSON if this field is wysiwyg type
      if (isWysiwygField(parentKey, parentContext) && data.includes('<') && data.includes('>')) {
        return htmlToTiptapJson(data);
      }
      return data;
    }

    if (Array.isArray(data)) {
      return data.map((item, index) =>
        convertWysiwygFieldsToJson(item, `${parentKey}[${index}]`, parentContext)
      );
    }

    if (typeof data === 'object' && data !== null) {
      const result: any = {};
      for (const [key, value] of Object.entries(data)) {
        // Determine context for nested processing
        let currentContext = parentContext;
        if (key === 'blocks') {
          currentContext = 'blocks';
        } else if (parentContext === 'blocks' && key === 'content') {
          currentContext = 'block-content';
        }

        // Only process wysiwyg fields, preserve everything else
        if (isWysiwygField(key, currentContext)) {
          result[key] = convertWysiwygFieldsToJson(value, key, currentContext);
        } else {
          result[key] = value;
        }
      }
      return result;
    }

    return data;
  }

  /**
   * Get field type for a given field key
   */
  function getFieldType(fieldKey?: string): string | null {
    if (!fieldKey || !collectionFields[fieldKey]) {
      return null;
    }
    return collectionFields[fieldKey].type || null;
  }

  /**
   * Check if a field is wysiwyg type, including nested block fields
   */
  function isWysiwygField(fieldKey?: string, parentContext?: string): boolean {
    if (!fieldKey) return false;

    // Check main collection fields
    const fieldType = getFieldType(fieldKey);
    if (fieldType === 'wysiwyg') return true;

    // Check if this is a block content field (blocks often have wysiwyg content)
    if (parentContext === 'blocks' && fieldKey === 'content') {
      return true; // Assume block content is wysiwyg if it contains HTML
    }

    return false;
  }

  async function highlightPayload(data: unknown) {
    try {
      // Convert HTML content to JSON for better preview
      const convertedData = convertWysiwygFieldsToJson(data);
      const jsonString = JSON.stringify(convertedData, null, 2);
      rawPayload = jsonString;

      // Validate that the data is actually JSON before highlighting
      JSON.parse(jsonString); // This will throw if invalid
      highlightedPayload = await formatJson(jsonString, '0.875rem');
      error = null;
    } catch (e) {
      console.error('Error highlighting payload:', e);
      error = e instanceof Error ? e.message : 'Unknown error occurred';
      // Fallback to plain text if JSON is invalid
      highlightedPayload = '';
    }
  }

  async function fetchPayload() {
    loading = true;
    error = null;
    try {
      if (initialPayload) {
        await highlightPayload(initialPayload);
        return;
      }

      const { getCollectionItem } = await import('$sailor/remote/collections.remote.js');
      const result = await getCollectionItem({ collection: collectionSlug, id: pageId });

      if (!result.success) {
        throw new Error(`Failed to fetch payload: ${result.error}`);
      }

      await highlightPayload(result.item);
    } catch (e) {
      console.error('Error fetching payload:', e);
      error = e instanceof Error ? e.message : 'Unknown error occurred';
    } finally {
      loading = false;
    }
  }

  function copyPayload() {
    if (!rawPayload) return;
    navigator.clipboard.writeText(rawPayload);
    toast.success('Payload copied to clipboard');
  }

  $effect(() => {
    if (open) {
      fetchPayload();
    }
  });

  // Re-highlight when theme changes
  $effect(() => {
    if (rawPayload) {
      rehighlightCode(rawPayload, 'json', '0.875rem').then((formatted) => {
        highlightedPayload = formatted;
      });
    }
  });
</script>

<Sheet bind:open>
  <SheetTrigger type="button" class="h-8 w-8">
    <Button variant="ghost" size="icon" title="Show Payload" class="hover:bg-muted h-8 w-8">
      <Code class="h-4 w-4" />
    </Button>
  </SheetTrigger>
  <SheetContent class="!w-[50vw] !max-w-[50vw]">
    <SheetHeader class="flex flex-row items-center justify-between space-y-0 pb-4">
      <div class="flex items-center gap-2">
        <Code class="h-4 w-4" />
        <span class="text-sm font-medium">JSON Preview</span>
      </div>
      <Button type="button" variant="outline" size="sm" onclick={copyPayload} class="h-8">
        <Copy class="mr-2 h-4 w-4" />
        Copy
      </Button>
    </SheetHeader>
    <div class="overflow-x-auto rounded">
      {#if error}
        <div class="text-destructive">Error: {error}</div>
      {:else if loading}
        <div class="text-muted-foreground">Loading payload...</div>
      {:else if highlightedPayload}
        <div class="sugar-high-wrapper p-4">
          {@html highlightedPayload}
        </div>
      {:else}
        <div class="text-muted-foreground">No payload available</div>
      {/if}
    </div>
  </SheetContent>
</Sheet>

<style>
  /* Default (light) theme - Catppuccin Latte colors */
  .sugar-high-wrapper {
    --sh-sign: #dc8a78; /* Rosewater - for brackets, commas */
    --sh-string: #40a02b; /* Green - for string values */
    --sh-keyword: #8839ef; /* Mauve - for keywords */
    --sh-class: #fe640b; /* Orange - for numbers */
    --sh-identifier: #7c7f93; /* Subtext1 - for identifiers */
    --sh-comment: #9ca0b0; /* Subtext0 - for comments */
    --sh-jsxliterals: #40a02b; /* Green - for JSX literals */
    --sh-property: #1e66f5; /* Blue - for property names */
    --sh-entity: #8839ef; /* Mauve - for entities */
    --sh-break: transparent;
    --sh-space: transparent;
  }

  /* Dark theme - Catppuccin Macchiato colors */
  :global(.dark) .sugar-high-wrapper {
    --sh-sign: #f4dbd6; /* Rosewater - for brackets, commas */
    --sh-string: #a6da95; /* Green - for string values */
    --sh-keyword: #c6a0f6; /* Mauve - for keywords */
    --sh-class: #f5a97f; /* Peach - for numbers */
    --sh-identifier: #b8c0e0; /* Subtext1 - for identifiers */
    --sh-comment: #a5adcb; /* Subtext0 - for comments */
    --sh-jsxliterals: #a6da95; /* Green - for JSX literals */
    --sh-property: #8aadf4; /* Blue - for property names */
    --sh-entity: #c6a0f6; /* Mauve - for entities */
  }

  /* Hide the default close button */
  :global([data-slot='sheet-content'] > button) {
    display: none !important;
  }
</style>
