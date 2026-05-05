<script lang="ts">
  import * as Breadcrumb from 'sailorcms/components/ui/breadcrumb/index.js';
  import { page } from '$app/state';

  let { title }: { title?: string } = $props();

  type Breadcrumb = { label: string; href: string };

  let breadcrumbs: Breadcrumb[] = $derived(
    page.url.pathname
      .split('/')
      .filter(Boolean)
      .filter((segment) => !['collections', 'globals'].includes(segment))
      .map((segment) => {
        const segments = page.url.pathname.split('/').filter(Boolean);
        const index = segments.indexOf(segment);
        return {
          label: segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' '),
          href: '/' + segments.slice(0, index + 1).join('/')
        };
      })
  );

  let displayBreadcrumbs: Breadcrumb[] = $derived(
    !title || breadcrumbs.length === 0
      ? breadcrumbs
      : [...breadcrumbs.slice(0, -1), { ...breadcrumbs[breadcrumbs.length - 1], label: title }]
  );
</script>

<Breadcrumb.Root>
  <Breadcrumb.List>
    {#each displayBreadcrumbs as item, index (index)}
      <Breadcrumb.Item>
        {#if item === displayBreadcrumbs[displayBreadcrumbs.length - 1]}
          <Breadcrumb.Page>{item.label}</Breadcrumb.Page>
        {:else}
          <Breadcrumb.Link href={item.href}>{item.label}</Breadcrumb.Link>
        {/if}
      </Breadcrumb.Item>
      {#if item !== displayBreadcrumbs[displayBreadcrumbs.length - 1]}
        <Breadcrumb.Separator />
      {/if}
    {/each}
  </Breadcrumb.List>
</Breadcrumb.Root>
