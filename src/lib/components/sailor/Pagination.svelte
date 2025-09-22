<script lang="ts">
  import { goto } from '$app/navigation';
  import { Button } from '$lib/components/ui/button';
  import { Label } from '$lib/components/ui/label';
  import * as Select from '$lib/components/ui/select';
  import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from '@lucide/svelte';

  const {
    page,
    pageSize,
    totalItems,
    totalPages,
    hasNextPage,
    hasPreviousPage,
    onPageChange,
    onPageSizeChange,
    pageSizeOptions = [20, 50, 100],
    showTotalItems = true,
    showPageSizeSelector = true,
    useUrlNavigation = false
  } = $props<{
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    onPageChange?: (page: number) => Promise<void>;
    onPageSizeChange?: (pageSize: number) => Promise<void>;
    pageSizeOptions?: number[];
    showTotalItems?: boolean;
    showPageSizeSelector?: boolean;
    useUrlNavigation?: boolean;
  }>();

  async function goToPage(newPage: number) {
    if (useUrlNavigation) {
      const url = new URL(window.location.href);
      url.searchParams.set('page', newPage.toString());
      await goto(url.pathname + url.search);
    } else if (onPageChange) {
      await onPageChange(newPage);
    }
  }

  async function changePageSize(newPageSize: string) {
    const size = Number(newPageSize);
    if (useUrlNavigation) {
      const url = new URL(window.location.href);
      url.searchParams.set('pageSize', newPageSize);
      url.searchParams.set('page', '1'); // Reset to first page
      await goto(url.pathname + url.search);
    } else if (onPageSizeChange) {
      await onPageSizeChange(size);
    }
  }

  async function goToFirstPage() {
    await goToPage(1);
  }

  async function goToLastPage() {
    await goToPage(totalPages);
  }

  async function goToNextPage() {
    if (hasNextPage) {
      await goToPage(page + 1);
    }
  }

  async function goToPreviousPage() {
    if (hasPreviousPage) {
      await goToPage(page - 1);
    }
  }
</script>

<div class="py-4">
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-6">
      {#if showPageSizeSelector}
        <div class="flex items-center gap-2">
          <Select.Root
            type="single"
            value={pageSize.toString()}
            onValueChange={(value: string) => changePageSize(value)}
          >
            <Select.Trigger size="sm" class="h-8 w-20" id="rows-per-page">
              {pageSize}
            </Select.Trigger>
            <Select.Content side="top">
              {#each pageSizeOptions as size (size)}
                <Select.Item value={size.toString()}>
                  {size}
                </Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
          <Label for="rows-per-page" class="text-sm font-medium">Rows per page</Label>
        </div>
      {/if}

      {#if showTotalItems}
        <div class="text-muted-foreground text-sm">
          Showing {Math.min((page - 1) * pageSize + 1, totalItems)}
          to {Math.min(page * pageSize, totalItems)}
          of {totalItems} results
        </div>
      {/if}
    </div>

    <div class="flex items-center gap-2">
      <span class="text-sm">
        Page {page} of {totalPages}
      </span>
      <Button
        variant="outline"
        class="h-8 w-8 p-0"
        onclick={goToFirstPage}
        disabled={!hasPreviousPage}
      >
        <ChevronsLeft class="h-4 w-4" />
      </Button>
      <Button
        variant="outline"
        class="h-8 w-8 p-0"
        onclick={goToPreviousPage}
        disabled={!hasPreviousPage}
      >
        <ChevronLeft class="h-4 w-4" />
      </Button>
      <Button variant="outline" class="h-8 w-8 p-0" onclick={goToNextPage} disabled={!hasNextPage}>
        <ChevronRight class="h-4 w-4" />
      </Button>
      <Button variant="outline" class="h-8 w-8 p-0" onclick={goToLastPage} disabled={!hasNextPage}>
        <ChevronsRight class="h-4 w-4" />
      </Button>
    </div>
  </div>
</div>
