<script lang="ts">
  import * as Card from '$lib/components/ui/card/index.js';
  import { FileText, Users, Folder, Globe } from '@lucide/svelte';

  interface Props {
    stats: {
      collections: number;
      users: number;
      files: number;
      globals: number;
    };
  }

  let { stats }: Props = $props();

  const statCards = $derived([
    {
      title: 'Collections',
      value: stats.collections,
      icon: FileText,
      description: 'Content types'
    },
    // Only show users if count > 0 (means user has permission)
    ...(stats.users > 0
      ? [
          {
            title: 'Users',
            value: stats.users,
            icon: Users,
            description: 'Registered users'
          }
        ]
      : []),
    {
      title: 'Media Files',
      value: stats.files,
      icon: Folder,
      description: 'Uploaded files'
    },
    {
      title: 'Globals',
      value: stats.globals,
      icon: Globe,
      description: 'Global settings'
    }
  ]);
</script>

<div
  class="grid gap-4 md:grid-cols-2"
  class:lg:grid-cols-3={statCards.length === 3}
  class:lg:grid-cols-4={statCards.length === 4}
>
  {#each statCards as stat}
    {@const IconComponent = stat.icon}
    <Card.Root>
      <Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
        <Card.Title class="text-sm font-medium">{stat.title}</Card.Title>
        <IconComponent class="text-muted-foreground h-4 w-4" />
      </Card.Header>
      <Card.Content>
        <div class="text-2xl font-bold">{stat.value}</div>
        <p class="text-muted-foreground text-xs">{stat.description}</p>
      </Card.Content>
    </Card.Root>
  {/each}
</div>
