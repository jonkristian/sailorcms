<script lang="ts">
  import { goto } from '$app/navigation';
  import { page as pageState } from '$app/state';
  import { Button } from 'sailorcms/components/ui/button/index.js';
  import { Label } from 'sailorcms/components/ui/label/index.js';
  import * as Select from 'sailorcms/components/ui/select/index.js';
  import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from '@lucide/svelte';
  import { m } from '$sailor/i18n';

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
  }: {
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
  } = $props();

  async function goToPage(newPage: number) {
    if (useUrlNavigation) {
      const url = new URL(pageState.url);
      url.searchParams.set('page', newPage.toString());
      await goto(url.pathname + url.search);
    } else if (onPageChange) {
      await onPageChange(newPage);
    }
  }

  async function changePageSize(newPageSize: string) {
    const size = Number(newPageSize);
    if (useUrlNavigation) {
      const url = new URL(pageState.url);
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
  <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-0">
    <div class="flex flex-wrap items-center gap-x-6 gap-y-2">
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
          <Label for="rows-per-page" class="text-sm font-medium"
            >{m.pagination_rows_per_page()}</Label
          >
        </div>
      {/if}

      {#if showTotalItems}
        <!-- Hidden below sm: the results-summary string is the longest cell on the row.
             The page-position chip on the right covers the same need at narrow widths. -->
        <div class="text-muted-foreground hidden text-sm sm:block">
          {m.pagination_showing_results({
            from: Math.min((page - 1) * pageSize + 1, totalItems),
            to: Math.min(page * pageSize, totalItems),
            total: totalItems
          })}
        </div>
      {/if}
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <span class="text-sm">
        {m.pagination_page_position({ current: page, total: totalPages })}
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
