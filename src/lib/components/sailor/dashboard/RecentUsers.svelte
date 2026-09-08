<script lang="ts">
  import * as Card from 'sailorcms/components/ui/card/index.js';
  import { Badge } from 'sailorcms/components/ui/badge/index.js';
  import { Avatar, AvatarFallback, AvatarImage } from 'sailorcms/components/ui/avatar/index.js';
  import { Users, ExternalLink, UserPlus } from '@lucide/svelte';
  import { formatRelativeTime } from 'sailorcms/core/utils/date';
  import { getUserLocale } from 'sailorcms/core/ui/user-locale';
  import type { User } from '$sailor/generated/types';
  import { getRoleColor } from 'sailorcms/core/utils/user';
  import { m } from '$sailor/i18n';

  interface Props {
    users: User[];
    limit?: number;
  }

  let { users = [], limit = 4 }: Props = $props();

  const limitedUsers = $derived(users.slice(0, limit));

  function getUserInitials(name?: string) {
    if (!name) return 'U';
    return name
      .split(' ')
      .map((word) => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  function getUserAvatar(user: User) {
    return (
      user.image ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || user.email)}&size=32`
    );
  }
</script>

<Card.Root>
  <Card.Header>
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <Users class="h-4 w-4" />
        <Card.Title>{m.dashboard_users_title()}</Card.Title>
      </div>
      <a
        href="/sailor/users"
        class="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm"
      >
        {m.common_view_all()}
        <ExternalLink class="h-3 w-3" />
      </a>
    </div>
    <Card.Description>{m.dashboard_users_description()}</Card.Description>
  </Card.Header>
  <Card.Content class="p-0">
    {#if limitedUsers.length === 0}
      <div class="text-muted-foreground py-4 text-center">
        <UserPlus class="mx-auto mb-2 h-8 w-8 opacity-50" />
        <p class="text-sm">{m.dashboard_users_empty()}</p>
      </div>
    {:else}
      <div class="space-y-3 px-4">
        {#each limitedUsers as user}
          <div class="hover:bg-muted/50 flex items-center gap-3 rounded-lg p-2 transition-colors">
            <!-- User Avatar -->
            <Avatar class="h-8 w-8">
              <AvatarImage src={getUserAvatar(user)} alt={user.name} />
              <AvatarFallback class="text-xs">
                {getUserInitials(user.name)}
              </AvatarFallback>
            </Avatar>

            <!-- User Info -->
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <h4 class="truncate text-sm leading-tight font-medium">
                  {user.name}
                </h4>
                {#if user.role}
                  <Badge variant="secondary" class="text-xs {getRoleColor(user.role)}">
                    {user.role}
                  </Badge>
                {/if}
              </div>
              <p class="text-muted-foreground truncate text-xs">
                {user.email}
              </p>
            </div>

            <!-- Registration Time -->
            <div class="flex-shrink-0 text-right">
              <span class="text-muted-foreground text-xs">
                {formatRelativeTime(user.created_at, getUserLocale())}
              </span>
            </div>
          </div>
        {/each}
      </div>

      {#if users.length > limit}
        <div class="border-t p-4">
          <a
            href="/sailor/users"
            class="text-muted-foreground hover:text-foreground text-sm font-medium"
          >
            {m.dashboard_users_view_all({ total: users.length })}
          </a>
        </div>
      {/if}
    {/if}
  </Card.Content>
</Card.Root>
