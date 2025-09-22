<script lang="ts">
  import * as Card from '$lib/components/ui/card/index.js';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Avatar, AvatarFallback, AvatarImage } from '$lib/components/ui/avatar/index.js';
  import {
    FileText,
    Edit,
    Plus,
    Trash2,
    Eye,
    Users,
    Settings,
    Clock,
    ExternalLink
  } from '@lucide/svelte';
  import { goto } from '$app/navigation';
  import { formatRelativeTime } from '$sailor/core/utils/date';

  interface ActivityItem {
    id: string;
    type: 'content' | 'user' | 'settings';
    action: 'created' | 'updated' | 'deleted' | 'published' | 'viewed';
    title: string;
    description?: string;
    user: {
      name: string;
      email: string;
      image?: string;
    };
    timestamp: Date;
    contentType?: string;
    link?: string;
    collectionSlug?: string;
    globalSlug?: string;
    itemId?: string;
  }

  interface Props {
    data: ActivityItem[];
    limit?: number;
  }

  let { data = [], limit = 20 }: Props = $props();

  const limitedData = $derived(data.slice(0, limit));

  function getActivityColor(action: string) {
    switch (action) {
      case 'created':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'updated':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'deleted':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      case 'published':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
    }
  }

  function getUserInitials(name: string) {
    return name
      .split(' ')
      .map((word) => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  function handleItemClick(activity: ActivityItem) {
    if (activity.link) {
      goto(activity.link);
    }
  }

  function getUserAvatar(user: ActivityItem['user']) {
    return (
      user.image || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&size=24`
    );
  }
</script>

<Card.Root class="@container/activity">
  <Card.Header>
    <Card.Title>Recent Activity</Card.Title>
    <Card.Description>Latest changes and updates in your CMS</Card.Description>
  </Card.Header>
  <Card.Content class="p-0">
    {#if limitedData.length === 0}
      <div class="text-muted-foreground flex h-[300px] items-center justify-center">
        <div class="text-center">
          <Clock class="mx-auto mb-2 h-8 w-8" />
          <p>No recent activity</p>
        </div>
      </div>
    {:else}
      <!-- Scrollable container - shows ~5 items initially -->
      <div class="max-h-[400px] space-y-0 overflow-y-auto px-4">
        {#each limitedData as activity, index (activity.id || index)}
          <div
            class="hover:bg-muted/50 flex items-center gap-3 rounded-lg p-2 transition-colors {activity.link
              ? 'cursor-pointer'
              : ''}"
            onclick={() => activity.link && handleItemClick(activity)}
            onkeydown={(e) => activity.link && e.key === 'Enter' && handleItemClick(activity)}
            role={activity.link ? 'button' : undefined}
            {...activity.link ? { tabindex: 0 } : {}}
          >
            <!-- Icon Column -->
            <div class="flex-shrink-0">
              <div
                class="flex size-6 items-center justify-center rounded-full {getActivityColor(
                  activity.action
                )}"
              >
                {#if activity.action === 'created'}
                  <Plus class="size-4" />
                {:else if activity.action === 'updated'}
                  <Edit class="size-4" />
                {:else if activity.action === 'deleted'}
                  <Trash2 class="size-4" />
                {:else if activity.action === 'published'}
                  <Eye class="size-4" />
                {:else if activity.type === 'content'}
                  <FileText class="size-4" />
                {:else if activity.type === 'user'}
                  <Users class="size-4" />
                {:else if activity.type === 'settings'}
                  <Settings class="size-4" />
                {:else}
                  <Clock class="size-4" />
                {/if}
              </div>
            </div>

            <!-- Action Column -->
            <div class="w-24 flex-shrink-0">
              <Badge variant="outline" class="text-xs capitalize">
                {activity.action}
              </Badge>
            </div>

            <!-- Content Type Column -->
            <div class="w-28 flex-shrink-0">
              {#if activity.contentType}
                <Badge variant="secondary" class="text-xs">
                  {activity.contentType}
                </Badge>
              {:else}
                <span class="text-muted-foreground text-xs">-</span>
              {/if}
            </div>

            <!-- Title Column -->
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <h4
                  class="truncate text-sm leading-tight font-medium {activity.link
                    ? 'hover:text-primary'
                    : ''}"
                >
                  {activity.title}
                </h4>
                {#if activity.link}
                  <ExternalLink class="text-muted-foreground h-3 w-3" />
                {/if}
              </div>
              {#if activity.description}
                <p class="text-muted-foreground mt-1 truncate text-xs">
                  {activity.description}
                </p>
              {/if}
            </div>

            <!-- User Column -->
            <div class="w-36 flex-shrink-0">
              <div class="flex items-center gap-2">
                <Avatar class="h-6 w-6">
                  <AvatarImage src={getUserAvatar(activity.user)} alt={activity.user.name} />
                  <AvatarFallback class="text-xs">
                    {getUserInitials(activity.user.name)}
                  </AvatarFallback>
                </Avatar>
                <span class="text-muted-foreground truncate text-xs">
                  {activity.user.name}
                </span>
              </div>
            </div>

            <!-- Time Column -->
            <div class="w-28 flex-shrink-0 text-right">
              <span class="text-muted-foreground text-xs">
                {formatRelativeTime(activity.timestamp)}
              </span>
            </div>
          </div>
        {/each}
      </div>

      {#if data.length > limit}
        <div class="border-t p-4">
          <button class="text-muted-foreground hover:text-foreground text-sm font-medium">
            View all activity ({data.length} total)
          </button>
        </div>
      {/if}
    {/if}
  </Card.Content>
</Card.Root>
