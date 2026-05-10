<script lang="ts">
  import { goto } from '$app/navigation';
  import { generateUUID } from 'sailorcms/core/utils/common';
  import Header from 'sailorcms/components/sailor/Header.svelte';
  import DataTable from 'sailorcms/components/sailor/table/DataTable.svelte';
  import Pagination from 'sailorcms/components/sailor/Pagination.svelte';
  import FilterBar from 'sailorcms/components/sailor/table/FilterBar.svelte';
  import UserBulkDeleteDialog from './(components)/UserBulkDeleteDialog.svelte';
  import { Badge } from 'sailorcms/components/ui/badge/index.js';
  import { Button } from 'sailorcms/components/ui/button/index.js';
  import { useBulkSelection } from 'sailorcms/composables/useBulkSelection.svelte';
  import { page } from '$app/state';
  import { formatTableDate } from 'sailorcms/core/utils/date';
  import { getUserLocale } from 'sailorcms/core/ui/user-locale';
  import type { PageData } from './$types';
  import { useTableFilters } from 'sailorcms/composables/useTableFilters.svelte';
  import { m } from '$sailor/i18n';
  import { pluralize } from 'sailorcms/utils/ui/text';

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
    { key: 'title', label: m.users_col_name(), sortable: true },
    { key: 'email', label: m.users_col_email(), sortable: true },
    { key: 'role', label: m.users_col_role(), sortable: true },
    { key: 'created_at', label: m.users_col_created(), sortable: true }
  ];

  function formatDate(date: string | Date) {
    return formatTableDate(date, getUserLocale());
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
  <title>{m.users_page_title()} - Sailor CMS</title>
</svelte:head>

<div class="container mx-auto px-6">
  <Header
    title={m.users_page_title()}
    description={m.users_page_description()}
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
          {m.bulk_selection_count({
            selected: selection.selectedCount,
            total: selection.totalCount,
            items: pluralize(selection.totalCount, m.common_user_singular(), m.common_user_plural())
          })}
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
        {selection.selectedCount > 0
          ? `${m.common_delete()} (${selection.selectedCount})`
          : m.common_delete()}
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
          {formatDate(item.created_at)}
        {:else}
          {item[column.key] || '-'}
        {/if}
      {/snippet}
    </DataTable>

    {#if data.pagination}
      <Pagination
        page={data.pagination.page}
        pageSize={data.pagination.pageSize}
        totalItems={data.pagination.totalItems}
        totalPages={data.pagination.totalPages}
        hasNextPage={data.pagination.hasNextPage}
        hasPreviousPage={data.pagination.hasPreviousPage}
        useUrlNavigation={true}
        showTotalItems={true}
        showPageSizeSelector={true}
      />
    {/if}
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
