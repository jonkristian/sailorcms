<script lang="ts">
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { Button, type ButtonProps } from '$lib/components/ui/button';
  import type { Snippet } from 'svelte';

  const {
    tooltip,
    side = 'top',
    children,
    ...rest
  }: ButtonProps & {
    tooltip: string;
    side?: 'top' | 'right' | 'bottom' | 'left';
    children: Snippet;
  } = $props();
</script>

<Tooltip.Root>
  <Tooltip.Trigger>
    {#snippet child({ props: triggerProps })}
      <Button {...triggerProps} {...rest}>
        {@render children()}
      </Button>
    {/snippet}
  </Tooltip.Trigger>
  <Tooltip.Content {side}>{tooltip}</Tooltip.Content>
</Tooltip.Root>
