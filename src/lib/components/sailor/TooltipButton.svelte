<script lang="ts">
  import * as Tooltip from 'sailorcms/components/ui/tooltip/index.js';
  import { Button, type ButtonProps } from 'sailorcms/components/ui/button/index.js';
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
