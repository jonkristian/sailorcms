<script lang="ts">
  import * as Breadcrumb from 'sailorcms/components/ui/breadcrumb/index.js';
  import { page } from '$app/state';
  import { m } from '$sailor/i18n';

  let { title }: { title?: string } = $props();

  type Breadcrumb = { label: string; href: string };

  // Map known admin URL segments to their localized labels. Unknown segments
  // (e.g. collection slugs like `posts`, item IDs) fall through to title-cased
  // URL text. Keyed by the slug exactly as it appears in the URL — `media` →
  // `m.nav_media_library`. Each value is a paraglide message function called
  // inside the $derived so locale changes re-render.
  const SEGMENT_LABELS: Record<string, () => string> = {
    media: m.nav_media_library,
    users: m.nav_users,
    recovery: m.nav_recovery,
    settings: m.nav_settings,
    account: m.nav_user_account,
    help: m.nav_get_help,
    roles: m.settings_nav_roles_label,
    database: m.settings_nav_database_label,
    storage: m.settings_nav_storage_label,
    mail: m.settings_nav_mail_label,
    tags: m.settings_nav_tags_label,
    search: m.settings_nav_search_label,
    import: m.settings_nav_import_label
  };

  function labelFor(segment: string): string {
    const fn = SEGMENT_LABELS[segment];
    if (fn) return fn();
    return segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ');
  }

  let breadcrumbs: Breadcrumb[] = $derived(
    page.url.pathname
      .split('/')
      .filter(Boolean)
      .filter((segment) => !['collections', 'globals'].includes(segment))
      .map((segment) => {
        const segments = page.url.pathname.split('/').filter(Boolean);
        const index = segments.indexOf(segment);
        return {
          label: labelFor(segment),
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
