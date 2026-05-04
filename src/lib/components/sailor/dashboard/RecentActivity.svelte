<script lang="ts">
  import * as Card from '$lib/components/ui/card/index.js';
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
  import { getUserLocale } from '$sailor/core/ui/user-locale';
  import { m } from '$sailor/i18n';

  function getActionLabel(action: string): string {
    switch (action) {
      case 'created':
        return m.dashboard_action_created();
      case 'updated':
        return m.dashboard_action_updated();
      case 'deleted':
        return m.dashboard_action_deleted();
      case 'published':
        return m.dashboard_action_published();
      case 'viewed':
        return m.dashboard_action_viewed();
      default:
        return action;
    }
  }

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
    <Card.Title>{m.dashboard_activity_title()}</Card.Title>
    <Card.Description>{m.dashboard_activity_description()}</Card.Description>
  </Card.Header>
  <Card.Content class="p-0">
    {#if limitedData.length === 0}
      <div class="text-muted-foreground flex h-[300px] items-center justify-center">
        <div class="text-center">
          <Clock class="mx-auto mb-2 h-8 w-8" />
          <p>{m.dashboard_activity_empty()}</p>
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
            <!-- Icon Column — colored circle + icon convey the action; col
                 below still spells it out in words. `aria-label` is the
                 textual fallback for screen readers since the visual badge
                 ("Created"/"Updated"/etc.) was dropped from the row. Sized
                 to match the avatar in RecentUsers so dashboard widgets
                 share visual rhythm. -->
            <div class="flex-shrink-0">
              <div
                class="flex size-8 items-center justify-center rounded-full {getActivityColor(
                  activity.action
                )}"
                aria-label={getActionLabel(activity.action)}
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

            <!-- Author + Time stacked (mirrors the Title + description layout).
                 Avatar sized to match the action icon (size-8) so both ends
                 of the row carry equal visual weight. -->
            <div class="w-44 flex-shrink-0">
              <div class="flex items-center gap-3">
                <Avatar class="size-8 flex-shrink-0">
                  <AvatarImage src={getUserAvatar(activity.user)} alt={activity.user.name} />
                  <AvatarFallback class="text-xs">
                    {getUserInitials(activity.user.name)}
                  </AvatarFallback>
                </Avatar>
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm leading-tight font-medium">
                    {activity.user.name}
                  </p>
                  <p class="text-muted-foreground mt-1 truncate text-xs">
                    {formatRelativeTime(activity.timestamp, getUserLocale())}
                  </p>
                </div>
              </div>
            </div>
          </div>
        {/each}
      </div>

      {#if data.length > limit}
        <div class="border-t p-4">
          <button class="text-muted-foreground hover:text-foreground text-sm font-medium">
            {m.dashboard_activity_view_all({ total: data.length })}
          </button>
        </div>
      {/if}
    {/if}
  </Card.Content>
</Card.Root>
