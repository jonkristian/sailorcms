<script lang="ts">
  import { Button } from 'sailorcms/components/ui/button/index.js';
  import * as Popover from 'sailorcms/components/ui/popover/index.js';
  import FieldRenderer from 'sailorcms/components/sailor/fields/FieldRenderer.svelte';
  import { GripVertical, Settings2, Trash2, Boxes } from '@lucide/svelte';
  import { m } from '$sailor/i18n';
  import { blockGroupFields } from '$sailor/generated/block-groups';

  let {
    group,
    dragAttributes = {},
    isDragging = false,
    childCount = 0,
    onConfigChange,
    onRemove
  }: {
    group: Record<string, any>;
    dragAttributes?: Record<string, any>;
    isDragging?: boolean;
    childCount?: number;
    onConfigChange: (patch: Record<string, any>) => void;
    onRemove: () => void;
  } = $props();

  // Settings fields are config-defined (settings.ts blocks.groups → generated).
  // The popover renders whatever the developer declared via FieldRenderer.
  const fieldEntries = $derived(Object.entries(blockGroupFields));

  function patch(key: string, value: any) {
    onConfigChange({ [key]: value });
  }
</script>

<div class="flex items-center gap-2" class:opacity-60={isDragging}>
  <button
    type="button"
    class="text-muted-foreground hover:text-foreground shrink-0 cursor-grab"
    aria-label={m.block_group_drag_aria()}
    {...dragAttributes}
  >
    <GripVertical class="h-4 w-4" />
  </button>

  <Boxes class="text-muted-foreground h-4 w-4 shrink-0" />
  <span class="text-sm font-medium">{m.block_group_label()}</span>
  <span class="text-muted-foreground/70 text-xs">
    {m.block_group_child_count({ count: childCount })}
  </span>

  <div class="ml-auto flex items-center gap-1">
    {#if fieldEntries.length > 0}
      <Popover.Root>
        <Popover.Trigger>
          {#snippet child({ props })}
            <Button
              {...props}
              type="button"
              variant="ghost"
              size="sm"
              aria-label={m.block_group_settings_aria()}
            >
              <Settings2 class="h-4 w-4" />
            </Button>
          {/snippet}
        </Popover.Trigger>
        <Popover.Content class="w-80 p-3" align="end">
          <div class="space-y-3">
            <p class="text-sm font-medium">{m.block_group_settings_title()}</p>
            {#each fieldEntries as [key, field] (key)}
              <div class="space-y-1.5">
                <span class="text-muted-foreground text-xs">{field.label || key}</span>
                <FieldRenderer
                  field={{ ...field, showLabel: false }}
                  fieldKey={key}
                  value={group[key]}
                  onChange={(v) => patch(key, v)}
                />
              </div>
            {/each}
          </div>
        </Popover.Content>
      </Popover.Root>
    {/if}

    <Button
      type="button"
      variant="ghost"
      size="sm"
      class="text-muted-foreground hover:text-destructive"
      aria-label={m.block_group_delete_aria()}
      onclick={onRemove}
    >
      <Trash2 class="h-4 w-4" />
    </Button>
  </div>
</div>

{#if childCount === 0}
  <div class="text-muted-foreground/70 py-4 text-center text-xs">
    {m.block_group_empty_hint()}
  </div>
{/if}
