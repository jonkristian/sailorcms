<script lang="ts">
  import { Badge } from '$lib/components/ui/badge';
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
  } from '$lib/components/ui/card';
  import * as Collapsible from '$lib/components/ui/collapsible/index';
  import { Check, X, Shield, User, Users, ChevronDown } from '@lucide/svelte';
  import Header from '$lib/components/sailor/Header.svelte';

  const { data } = $props();
  const { roleSettings } = data;

  const resources = ['collection', 'global', 'block', 'file', 'user', 'settings'];
  const permissions = ['view', 'create', 'update', 'delete'];

  function formatValue(value: string | boolean): string {
    if (typeof value === 'boolean') return value ? 'check' : 'x';
    // Shorten longer values for better display
    if (value === 'own_private') return 'own';
    if (value === 'own_profile') return 'prof';
    if (value === 'published') return 'pub';
    if (value === 'archived') return 'arch';
    if (value === 'draft') return 'draft';
    return value;
  }

  function getValueClass(value: string | boolean): string {
    if (typeof value === 'boolean') {
      return value ? 'text-green-600' : 'text-red-500';
    }
    if (value === 'all') return 'text-blue-600';
    if (value === 'public') return 'text-green-600';
    if (value === 'own_private') return 'text-orange-600';
    if (value === 'own_profile') return 'text-purple-600';
    if (value === 'published') return 'text-blue-600';
    if (value === 'draft') return 'text-yellow-600';
    if (value === 'archived') return 'text-gray-600';
    return 'text-gray-600';
  }

  // Get role statistics
  const roleCount = Object.keys(roleSettings.definitions).length;
  const adminRoleCount = roleSettings.adminRoles.length;
  const resourceCount = resources.length;
  const permissionCount = permissions.length;
</script>

<svelte:head>
  <title>Role Permissions - Sailor CMS</title>
</svelte:head>

<div class="container mx-auto px-6">
  <Header
    title="Role Permissions"
    description="User roles and their access permissions throughout the CMS"
  />

  <div class="flex flex-col gap-6">
    <!-- Summary Statistics -->
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardContent class="p-4">
          <div class="flex items-center gap-4">
            <Shield class="h-6 w-6 text-blue-600" />
            <div>
              <p class="text-muted-foreground text-sm font-medium">Total Roles</p>
              <p class="text-2xl font-bold">{roleCount}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="p-4">
          <div class="flex items-center gap-4">
            <Users class="h-6 w-6 text-red-600" />
            <div>
              <p class="text-muted-foreground text-sm font-medium">Admin Roles</p>
              <p class="text-2xl font-bold">{adminRoleCount}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="p-4">
          <div class="flex items-center gap-4">
            <User class="h-6 w-6 text-green-600" />
            <div>
              <p class="text-muted-foreground text-sm font-medium">Resources</p>
              <p class="text-2xl font-bold">{resourceCount}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="p-4">
          <div class="flex items-center gap-4">
            <Shield class="h-6 w-6 text-purple-600" />
            <div>
              <p class="text-muted-foreground text-sm font-medium">Permissions</p>
              <p class="text-2xl font-bold">{permissionCount}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Roles Section -->
    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <Shield class="h-5 w-5" />
          User Roles
        </CardTitle>
        <CardDescription>
          Role definitions and their resource permissions configured in
          src/lib/sailor/templates/settings.ts
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div class="space-y-3">
          {#each Object.entries(roleSettings.definitions) as [roleKey, role]}
            <Collapsible.Root>
              <Collapsible.Trigger class="w-full">
                <div
                  class="bg-surface hover:bg-surface/80 flex items-center justify-between rounded-lg px-4 py-3"
                >
                  <div class="flex items-center gap-3">
                    <span class="font-medium">{role.name}</span>
                    {#if roleSettings.adminRoles.includes(roleKey)}
                      <Badge
                        variant="default"
                        class="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                      >
                        Admin
                      </Badge>
                    {/if}
                    {#if roleKey === roleSettings.defaultRole}
                      <Badge
                        variant="secondary"
                        class="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                      >
                        Default
                      </Badge>
                    {/if}
                  </div>
                  <ChevronDown class="h-4 w-4" />
                </div>
              </Collapsible.Trigger>
              <Collapsible.Content>
                <div class="bg-surface/50 mt-2 rounded-lg p-4">
                  <div class="space-y-3">
                    {#each resources as resource}
                      <div class="rounded-lg border p-3">
                        <div class="mb-2 font-medium capitalize">{resource}</div>
                        <div class="flex flex-wrap gap-4">
                          {#each permissions as perm}
                            <div class="flex min-w-0 items-center gap-2">
                              <span class="text-muted-foreground text-sm whitespace-nowrap"
                                >{perm}:</span
                              >
                              <span
                                class="bg-muted/50 rounded px-2 py-1 text-center font-mono text-xs {getValueClass(
                                  (role.permissions as any)[resource][perm]
                                )}"
                              >
                                {#if typeof (role.permissions as any)[resource][perm] === 'boolean'}
                                  {#if (role.permissions as any)[resource][perm]}
                                    <Check class="h-4 w-4" />
                                  {:else}
                                    <X class="h-4 w-4" />
                                  {/if}
                                {:else}
                                  {formatValue((role.permissions as any)[resource][perm])}
                                {/if}
                              </span>
                            </div>
                          {/each}
                        </div>
                      </div>
                    {/each}
                  </div>
                </div>
              </Collapsible.Content>
            </Collapsible.Root>
          {/each}
        </div>
      </CardContent>
    </Card>
  </div>
</div>
