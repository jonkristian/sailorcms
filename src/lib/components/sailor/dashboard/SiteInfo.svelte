<script lang="ts">
  import * as Card from 'sailorcms/components/ui/card/index.js';
  import { Badge } from 'sailorcms/components/ui/badge/index.js';
  import { Globe, ExternalLink, Settings } from '@lucide/svelte';
  import { m } from '$sailor/i18n';

  interface Props {
    siteInfo: {
      name?: string;
      url?: string;
      description?: string;
    };
  }

  let { siteInfo }: Props = $props();

  let hasInfo = $derived(siteInfo.name || siteInfo.url || siteInfo.description);
</script>

<Card.Root>
  <Card.Header>
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <Globe class="h-4 w-4" />
        <Card.Title>{m.site_info_title()}</Card.Title>
      </div>
      <a
        href="/sailor/settings"
        class="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm"
      >
        {m.site_info_configure()}
        <Settings class="h-3 w-3" />
      </a>
    </div>
  </Card.Header>
  <Card.Content>
    {#if !hasInfo}
      <div class="text-muted-foreground py-4 text-center">
        <Globe class="mx-auto mb-2 h-8 w-8 opacity-50" />
        <p class="mb-2 text-sm">{m.site_info_no_info()}</p>
        <a
          href="/sailor/settings"
          class="text-primary flex items-center justify-center gap-1 text-xs hover:underline"
        >
          {m.site_info_configure_link()}
          <ExternalLink class="h-3 w-3" />
        </a>
      </div>
    {:else}
      <div class="space-y-3">
        {#if siteInfo.name}
          <div>
            <div class="mb-1 flex items-center gap-2">
              <Badge variant="outline" class="text-xs">{m.site_info_label_name()}</Badge>
            </div>
            <h3 class="text-lg leading-tight font-semibold">{siteInfo.name}</h3>
          </div>
        {/if}

        {#if siteInfo.url}
          <div>
            <div class="mb-1 flex items-center gap-2">
              <Badge variant="outline" class="text-xs">{m.site_info_label_url()}</Badge>
            </div>
            <a
              href={siteInfo.url}
              target="_blank"
              rel="noopener noreferrer"
              class="text-primary flex items-center gap-1 text-sm hover:underline"
            >
              {siteInfo.url}
              <ExternalLink class="h-3 w-3" />
            </a>
          </div>
        {/if}

        {#if siteInfo.description}
          <div>
            <div class="mb-1 flex items-center gap-2">
              <Badge variant="outline" class="text-xs">{m.site_info_label_description()}</Badge>
            </div>
            <p class="text-muted-foreground text-sm leading-relaxed">{siteInfo.description}</p>
          </div>
        {/if}
      </div>
    {/if}
  </Card.Content>
</Card.Root>
