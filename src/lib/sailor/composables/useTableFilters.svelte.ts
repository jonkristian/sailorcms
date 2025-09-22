import { goto } from '$app/navigation';
import { browser } from '$app/environment';
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
    options: SortOption[];
    defaultSort: string;
    defaultOrder: 'asc' | 'desc';
  };
  select?: SelectFilter[];
  multiSelect?: MultiSelectFilter[];
}

interface FilterOptions {
  baseUrl: string;
  config: FilterConfig;
  debounceMs?: number;
}

/**
 * Composable for managing table filters with URL synchronization
 */
export function useTableFilters(options: FilterOptions) {
  const { baseUrl, config, debounceMs = 300 } = options;

  // Initialize filter state from URL or defaults
  const urlParams = browser ? new URLSearchParams(window.location.search) : new URLSearchParams();

  // Search state
  let searchQuery = $state(config.search ? urlParams.get('search') || '' : '');

  // Sort state
  let sortBy = $state(config.sort ? urlParams.get('sortBy') || config.sort.defaultSort : '');
  let sortOrder: 'asc' | 'desc' = $state(
    config.sort
      ? (urlParams.get('sortOrder') as 'asc' | 'desc') || config.sort.defaultOrder
      : 'desc'
  );

  // Select filters state
  const selectFilters = $state<Record<string, string>>({});
  if (config.select) {
    for (const filter of config.select) {
      selectFilters[filter.key] = urlParams.get(filter.key) || filter.default;
    }
  }

  // Multi-select filters state
  const multiSelectFilters = $state<Record<string, string[]>>({});
  if (config.multiSelect) {
    for (const filter of config.multiSelect) {
      const urlValue = urlParams.get(filter.key);
      multiSelectFilters[filter.key] = urlValue ? urlValue.split(',') : [];
    }
  }

  function buildUrl(): string {
    const params = new URLSearchParams();

    // Add search param
    if (config.search && searchQuery.trim()) {
      params.set('search', searchQuery.trim());
    }

    // Add sort params
    if (config.sort) {
      if (sortBy !== config.sort.defaultSort) {
        params.set('sortBy', sortBy);
      }
      if (sortOrder !== config.sort.defaultOrder) {
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
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
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
      sortBy = config.sort.defaultSort;
      sortOrder = config.sort.defaultOrder;
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

    goto(baseUrl, { replaceState: true, keepFocus: true, noScroll: true });
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
