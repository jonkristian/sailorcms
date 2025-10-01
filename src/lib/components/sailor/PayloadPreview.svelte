<script lang="ts">
  import { Sheet, SheetContent, SheetHeader, SheetTrigger } from '$lib/components/ui/sheet';
  import { Button } from '$lib/components/ui/button';
  import { Code, Copy } from '@lucide/svelte';
  import { toast } from '$sailor/core/ui/toast';
  import { htmlToTiptapJson } from '$lib/sailor/core/content/content';
  import { formatJson } from '$lib/sailor/core/ui/syntax-highlighting';
  import CategoryTree from './CategoryTree.svelte';

  let {
    type = 'collection',
    id,
    slug,
    title = 'JSON Preview',
    expandedCategory,
    open = $bindable(false),
    initialPayload = $bindable<unknown | null>(null),
    fields = $bindable<Record<string, any>>({})
  } = $props<{
    type?: 'collection' | 'global' | 'settings';
    id: string;
    slug?: string;
    title?: string;
    expandedCategory?: string;
    open?: boolean;
    initialPayload?: unknown | null;
    fields?: Record<string, any>;
  }>();

  let highlightedPayload = $state<string>('');
  let rawPayload = $state<string>('');
  let parsedData = $state<any>(null);
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
    if (!fieldKey || !fields[fieldKey]) {
      return null;
    }
    return fields[fieldKey].type || null;
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

      // For settings, pass data directly to CategoryTree; for others, use direct highlight.js
      if (type === 'settings') {
        parsedData = convertedData; // Use already converted data, no need to parse JSON
        highlightedPayload = ''; // CategoryTree will handle highlighting
      } else {
        highlightedPayload = await formatJson(jsonString);
        parsedData = null; // Not needed for non-settings
      }

      error = null;
    } catch (e) {
      console.error('Error highlighting payload:', e);
      error = e instanceof Error ? e.message : 'Unknown error occurred';
      // Let highlight.js handle the fallback
      highlightedPayload = '';
      parsedData = null;
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
      const result = await getCollectionItem({ collection: slug || '', id });

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
        <span class="text-sm font-medium">{title}</span>
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
      {:else if type === 'settings' && parsedData}
        <div class="p-4">
          <CategoryTree data={parsedData || {}} {expandedCategory} />
        </div>
      {:else if highlightedPayload}
        <div class="p-4">
          {@html highlightedPayload}
        </div>
      {:else}
        <div class="text-muted-foreground">No payload available</div>
      {/if}
    </div>
  </SheetContent>
</Sheet>

<style>
  /* Hide the default close button */
  :global([data-slot='sheet-content'] > button) {
    display: none !important;
  }
</style>
