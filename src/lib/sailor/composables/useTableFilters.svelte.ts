import { goto } from '$app/navigation';
import { browser } from '$app/environment';
import { page } from '$app/state';
import { debounce } from '$sailor/core/utils/debounce';

interface SortOption {
  label: string;
  value: string;
}

interface SelectOption {
  label: string;
  value: string;
}

interface MultiSelectOption {
  label: string;
  value: string;
}

interface SelectFilter {
  key: string;
  label?: string;
  options: SelectOption[];
  default: string;
}

interface MultiSelectFilter {
  key: string;
  label: string;
  loadOptions?: () => Promise<MultiSelectOption[]>;
  options?: MultiSelectOption[];
}

interface FilterConfig {
  search?: boolean;
  sort?: {
    options: SortOption[] | (() => SortOption[]);
    defaultSort: string | (() => string);
    defaultOrder: 'asc' | 'desc' | (() => 'asc' | 'desc');
  };
  select?: SelectFilter[];
  multiSelect?: MultiSelectFilter[];
}

interface FilterOptions {
  baseUrl: string | (() => string);
  config: FilterConfig;
  debounceMs?: number;
}

/**
 * Composable for managing table filters with URL synchronization
 */
export function useTableFilters(options: FilterOptions) {
  const { baseUrl: baseUrlOption, config, debounceMs = 300 } = options;

  // Get baseUrl - either static string or reactive getter
  const getBaseUrl = () => (typeof baseUrlOption === 'function' ? baseUrlOption() : baseUrlOption);

  // Resolve sort defaults — allow either static values or reactive getters so
  // callers can pass defaults that depend on route-scoped data (e.g. a
  // collection's `sortable` flag) without the hook capturing a stale value.
  const getDefaultSort = () =>
    config.sort
      ? typeof config.sort.defaultSort === 'function'
        ? config.sort.defaultSort()
        : config.sort.defaultSort
      : '';
  const getDefaultOrder = (): 'asc' | 'desc' =>
    config.sort
      ? typeof config.sort.defaultOrder === 'function'
        ? config.sort.defaultOrder()
        : config.sort.defaultOrder
      : 'desc';

  // Read params from the current URL. Prefers SvelteKit's reactive `page.url`
  // once it's available so state re-syncs on client-side navigation.
  function readParams(): URLSearchParams {
    try {
      if (page?.url) return new URLSearchParams(page.url.search);
    } catch {}
    return browser ? new URLSearchParams(window.location.search) : new URLSearchParams();
  }

  const initialParams = readParams();

  // Search state
  let searchQuery = $state(config.search ? initialParams.get('search') || '' : '');

  // Sort state
  let sortBy = $state(config.sort ? initialParams.get('sortBy') || getDefaultSort() : '');
  let sortOrder: 'asc' | 'desc' = $state(
    config.sort
      ? (initialParams.get('sortOrder') as 'asc' | 'desc') || getDefaultOrder()
      : 'desc'
  );

  // Select filters state
  const selectFilters: Record<string, string> = $state({});
  if (config.select) {
    for (const filter of config.select) {
      selectFilters[filter.key] = initialParams.get(filter.key) || filter.default;
    }
  }

  // Multi-select filters state
  const multiSelectFilters: Record<string, string[]> = $state({});
  if (config.multiSelect) {
    for (const filter of config.multiSelect) {
      const urlValue = initialParams.get(filter.key);
      multiSelectFilters[filter.key] = urlValue ? urlValue.split(',') : [];
    }
  }

  // Re-sync state from URL when the route changes (e.g. user navigates between
  // collections of differing sortability). Without this, state leaks across
  // pages because the caller's component instance is reused by SvelteKit.
  let lastSyncedPathname = browser ? page?.url?.pathname ?? '' : '';
  $effect(() => {
    const pathname = page?.url?.pathname;
    if (!pathname || pathname === lastSyncedPathname) return;
    lastSyncedPathname = pathname;
    const params = readParams();
    if (config.search) {
      searchQuery = params.get('search') || '';
    }
    if (config.sort) {
      sortBy = params.get('sortBy') || getDefaultSort();
      sortOrder = (params.get('sortOrder') as 'asc' | 'desc') || getDefaultOrder();
    }
    if (config.select) {
      for (const filter of config.select) {
        selectFilters[filter.key] = params.get(filter.key) || filter.default;
      }
    }
    if (config.multiSelect) {
      for (const filter of config.multiSelect) {
        const urlValue = params.get(filter.key);
        multiSelectFilters[filter.key] = urlValue ? urlValue.split(',') : [];
      }
    }
  });

  function buildUrl(): string {
    const params = new URLSearchParams();

    // Add search param
    if (config.search && searchQuery.trim()) {
      params.set('search', searchQuery.trim());
    }

    // Add sort params
    if (config.sort) {
      if (sortBy !== getDefaultSort()) {
        params.set('sortBy', sortBy);
      }
      if (sortOrder !== getDefaultOrder()) {
        params.set('sortOrder', sortOrder);
      }
    }

    // Add select filter params
    if (config.select) {
      for (const filter of config.select) {
        const value = selectFilters[filter.key];
        if (value && value !== filter.default) {
          params.set(filter.key, value);
        }
      }
    }

    // Add multi-select filter params
    if (config.multiSelect) {
      for (const filter of config.multiSelect) {
        const values = multiSelectFilters[filter.key];
        if (values && values.length > 0) {
          params.set(filter.key, values.join(','));
        }
      }
    }

    const queryString = params.toString();
    const currentBaseUrl = getBaseUrl();
    return queryString ? `${currentBaseUrl}?${queryString}` : currentBaseUrl;
  }

  function applyFilters() {
    const url = buildUrl();
    goto(url, { replaceState: true, keepFocus: true, noScroll: true });
  }

  // Debounced search
  const debouncedApplyFilters = debounce(applyFilters, debounceMs);

  function handleSearchInput() {
    debouncedApplyFilters();
  }

  function handleSelectFilter(key: string, value: string) {
    selectFilters[key] = value;
    applyFilters();
  }

  function handleMultiSelectFilter(key: string, values: string[]) {
    multiSelectFilters[key] = values;
    applyFilters();
  }

  function handleSort(newSortBy?: string, newSortOrder?: 'asc' | 'desc') {
    if (newSortBy !== undefined) sortBy = newSortBy;
    if (newSortOrder !== undefined) sortOrder = newSortOrder;
    applyFilters();
  }

  function toggleSortOrder() {
    sortOrder = sortOrder === 'desc' ? 'asc' : 'desc';
    applyFilters();
  }

  function handleColumnSort(columnKey: string) {
    if (sortBy === columnKey) {
      // Same column, toggle order
      toggleSortOrder();
    } else {
      // New column, default to desc
      sortBy = columnKey;
      sortOrder = 'desc';
      applyFilters();
    }
  }

  function clearSearch() {
    searchQuery = '';
    applyFilters();
  }

  function clearAllFilters() {
    // Reset all filters to defaults
    searchQuery = '';

    if (config.sort) {
      sortBy = getDefaultSort();
      sortOrder = getDefaultOrder();
    }

    if (config.select) {
      for (const filter of config.select) {
        selectFilters[filter.key] = filter.default;
      }
    }

    if (config.multiSelect) {
      for (const filter of config.multiSelect) {
        multiSelectFilters[filter.key] = [];
      }
    }

    goto(getBaseUrl(), { replaceState: true, keepFocus: true, noScroll: true });
  }

  // Derived state for UI
  let hasActive = $state(false);
  $effect(() => {
    let active = false;

    if (config.select) {
      for (const filter of config.select) {
        if (selectFilters[filter.key] !== filter.default) active = true;
      }
    }

    if (config.multiSelect) {
      for (const filter of config.multiSelect) {
        if (multiSelectFilters[filter.key].length > 0) active = true;
      }
    }

    if (!active && config.search && searchQuery.trim()) active = true;
    hasActive = active;
  });

  return {
    // Search
    get searchQuery() {
      return searchQuery;
    },
    set searchQuery(value: string) {
      searchQuery = value;
    },
    handleSearchInput,
    clearSearch,

    // Sort
    get sortBy() {
      return sortBy;
    },
    get sortOrder() {
      return sortOrder;
    },
    handleSort,
    toggleSortOrder,
    handleColumnSort,

    // Select filters
    get selectFilters() {
      return selectFilters;
    },
    handleSelectFilter,

    // Multi-select filters
    get multiSelectFilters() {
      return multiSelectFilters;
    },
    handleMultiSelectFilter,

    // General
    clearAllFilters,
    get hasActiveFilters() {
      return hasActive;
    },
    applyFilters
  };
}
