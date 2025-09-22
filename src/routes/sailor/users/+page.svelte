<script lang="ts">
  import { goto } from '$app/navigation';
  import { generateUUID } from '$sailor/core/utils/common';
  import Header from '$lib/components/sailor/Header.svelte';
  import { DataTable, FilterBar } from '$lib/components/sailor/table';
  import UserBulkDeleteDialog from './(components)/UserBulkDeleteDialog.svelte';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import { useBulkSelection } from '$lib/sailor/composables/useBulkSelection.svelte';
  import { page } from '$app/state';
  import { formatTableDate } from '$sailor/core/utils/date';
  import type { PageData } from './$types';
  import { useTableFilters } from '$lib/sailor/composables/useTableFilters.svelte';

  interface User {
    id: string;
    name: string;
    email: string;
    role: string;
    created_at: string;
    updated_at: string;
  }

  interface Column {
    key: string;
    label: string;
    sortable?: boolean;
  }

  const { data } = $props();

  // Table filters (search-only)
  const tableFilters = useTableFilters({
    baseUrl: '/sailor/users',
    config: { search: true }
  });

  // Use composable for selection functionality - exclude current user
  const selectableUsers = $derived(data.users.filter((user) => user.id !== page.data?.user?.id));
  const selection = useBulkSelection(() => selectableUsers);

  // Custom user delete dialog state
  let userDeleteDialogOpen = $state(false);
  let deleteLoading = $state(false);

  const columns: Column[] = [
    { key: 'title', label: 'Name', sortable: true },
    { key: 'email', label: 'Email', sortable: true },
    { key: 'role', label: 'Role', sortable: true },
    { key: 'created_at', label: 'Created', sortable: true }
  ];

  function formatDate(date: string | Date) {
    const dateObj = date instanceof Date ? date : new Date(date);
    return dateObj.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  function formatRole(role: string) {
    return role.charAt(0).toUpperCase() + role.slice(1);
  }

  // Transform data for display
  const displayUsers = $derived(
    data.users.map((user) => ({
      ...user,
      title: user.name, // Map name to title for DataTable linking
      role: formatRole(user.role),
      created_at: formatDate(user.created_at)
    }))
  );
</script>

<svelte:head>
  <title>Users - Sailor CMS</title>
</svelte:head>

<div class="container mx-auto px-6">
  <Header
    title="Users"
    description="Manage user accounts and permissions"
    itemCount={data.users.length}
    showAddButton={true}
    showCountBadge={true}
    addButtonAction={() => goto(`/sailor/users/${generateUUID()}`)}
  />

  <!-- Bulk Actions and Search Bar -->
  <div class="mb-4 flex items-center justify-between">
    <!-- Left side: Selection Counter and Search -->
    <div class="flex items-center gap-4">
      {#if selection.selectedCount > 0}
        <div class="text-muted-foreground text-sm">
          {selection.selectedCount} of {selection.totalCount} user{selection.totalCount === 1
            ? ''
            : 's'} selected
        </div>
      {:else}
        <!-- Search when no selection -->
        <FilterBar config={{ search: true }} {tableFilters} />
      {/if}
    </div>

    <!-- Right side: Actions -->
    <div class="flex items-center gap-2">
      <Button
        variant="destructive"
        class="h-9"
        onclick={() => {
          userDeleteDialogOpen = true;
        }}
        disabled={selection.selectedCount === 0}
      >
        {selection.selectedCount > 0 ? `Delete (${selection.selectedCount})` : 'Delete'}
      </Button>
    </div>
  </div>

  <div class="space-y-6">
    <DataTable
      {columns}
      items={displayUsers}
      selectable={true}
      selectedItems={selection.selectedItems}
      onSelect={selection.handleSelect}
      onSelectAll={selection.handleSelectAll}
      isDeleteDisabled={(user) => user.id === page.data?.user?.id}
    >
      {#snippet cellRenderer(item: any, column: any)}
        {#if column.key === 'title'}
          <button
            class="cursor-pointer text-left font-medium hover:underline"
            onclick={() => goto(`/sailor/users/${item.id}`)}
          >
            {item.name || item.email || item.id}
          </button>
        {:else if column.key === 'role'}
          <Badge variant="secondary">
            {item.role}
          </Badge>
        {:else if column.key === 'created_at'}
          {formatTableDate(item.created_at)}
        {:else}
          {item[column.key] || '-'}
        {/if}
      {/snippet}
    </DataTable>
  </div>
</div>

<!-- User Bulk Delete Dialog with Adoption -->
<UserBulkDeleteDialog
  bind:open={userDeleteDialogOpen}
  userIds={selection.selectedItems}
  availableUsers={data.users}
  bind:isLoading={deleteLoading}
  onSuccess={() => {
    selection.clearSelection();
    // Refresh page to update user list
    goto(page.url.href, { invalidateAll: true });
  }}
  onCancel={() => {
    userDeleteDialogOpen = false;
  }}
/>
