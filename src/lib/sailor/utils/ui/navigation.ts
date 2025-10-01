/**
 * Simple navigation utilities for Sailor CMS
 */

import type { NavigationItem, BreadcrumbItem, PaginationInfo } from '../types';

type MenuInputItem = {
  id?: string;
  label?: string;
  title?: string;
  name?: string;
  url?: string;
  href?: string;
  link?: string;
  icon?: string;
  description?: string;
  newTab?: boolean;
  target?: string;
  order?: number;
  sort?: number;
  children?: MenuInputItem[];
};

/**
 * Build a simple navigation tree from menu data
 *
 * @example
 * ```typescript
 * // Load menu global and build navigation
 * const menu = await getGlobal('main-menu');
 * const navigation = buildNavigationTree(menu.items, '/current-path');
 *
 * // Custom menu structure
 * const customNav = buildNavigationTree([
 *   { label: 'Home', url: '/' },
 *   { label: 'About', url: '/about', children: [
 *     { label: 'Team', url: '/about/team' }
 *   ]}
 * ], '/about');
 * ```
 */
export function buildNavigationTree(
  menuItems: MenuInputItem[] = [],
  currentPath: string = '',
  options: {
    maxDepth?: number;
    includeActive?: boolean;
  } = {}
): NavigationItem[] {
  const { maxDepth = 3, includeActive = true } = options;

  function buildTree(items: MenuInputItem[], depth = 0): NavigationItem[] {
    if (depth >= maxDepth) return [];

    return items
      .map((item) => {
        const url = item.url || item.href || item.link || '';
        const isActive = includeActive && isPathActive(url, currentPath);
        const isCurrent = includeActive && url === currentPath;

        const navItem: NavigationItem = {
          id: item.id,
          label: item.label || item.title || item.name || '',
          url,
          isActive,
          isCurrent,
          icon: item.icon,
          description: item.description,
          target: item.newTab || item.target === '_blank' ? '_blank' : '_self',
          order: item.order || item.sort || 0
        };

        // Build children if they exist
        if (item.children && Array.isArray(item.children)) {
          navItem.children = buildTree(item.children, depth + 1);
        }

        return navItem;
      })
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  }

  return buildTree(menuItems);
}

/**
 * Generate breadcrumbs for a given path
 *
 * @example
 * ```typescript
 * const breadcrumbs = generateBreadcrumbs('/blog/my-post', {
 *   homeLabel: 'Home',
 *   homeUrl: '/',
 *   collections: { 'posts': 'Blog' }
 * });
 * ```
 */
export function generateBreadcrumbs(
  currentPath: string,
  options: {
    homeLabel?: string;
    homeUrl?: string;
    collections?: Record<string, string>;
    customLabels?: Record<string, string>;
    excludePaths?: string[];
    includeHome?: boolean;
  } = {}
): BreadcrumbItem[] {
  const {
    homeLabel = 'Home',
    homeUrl = '/',
    collections = {},
    customLabels = {},
    excludePaths = [],
    includeHome = true
  } = options;

  const breadcrumbs: BreadcrumbItem[] = [];

  // Add home breadcrumb
  if (includeHome) {
    breadcrumbs.push({
      label: homeLabel,
      url: homeUrl,
      isActive: currentPath === homeUrl,
      isCurrent: currentPath === homeUrl
    });
  }

  // Skip home path
  if (currentPath === homeUrl || currentPath === '/') {
    return breadcrumbs;
  }

  // Split path and build breadcrumbs
  const pathParts = currentPath.split('/').filter(Boolean);
  let currentUrl = '';

  for (let i = 0; i < pathParts.length; i++) {
    const part = pathParts[i];
    currentUrl += `/${part}`;

    // Skip excluded paths
    if (excludePaths.includes(currentUrl)) {
      continue;
    }

    // Get label for this part
    let label = customLabels[part] || formatPathPart(part);

    // Check if this is a collection
    if (i === 0 && collections[part]) {
      label = collections[part];
    }

    const isCurrent = currentUrl === currentPath;

    breadcrumbs.push({
      label,
      url: currentUrl,
      isActive: isCurrent,
      isCurrent
    });
  }

  return breadcrumbs;
}

/**
 * Create pagination info for a collection
 *
 * @example
 * ```typescript
 * const pagination = createPagination(1, 100, '/blog', { itemsPerPage: 10 });
 *
 * // Use in template
 * {#if pagination.hasPrevious}
 *   <a href={pagination.previousUrl}>Previous</a>
 * {/if}
 * ```
 */
export function createPagination(
  currentPage: number,
  totalItems: number,
  baseUrl: string,
  options: {
    itemsPerPage?: number;
    maxPages?: number;
    pageParam?: string;
  } = {}
): PaginationInfo {
  const { itemsPerPage = 10, maxPages = 5, pageParam = 'page' } = options;

  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const hasNext = currentPage < totalPages;
  const hasPrevious = currentPage > 1;

  const buildUrl = (page: number) => {
    if (page === 1) {
      return baseUrl;
    }
    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}${pageParam}=${page}`;
  };

  // Generate page numbers to show
  const pages: Array<{ number: number; url: string; isActive: boolean; isCurrent: boolean }> = [];

  let startPage = Math.max(1, currentPage - Math.floor(maxPages / 2));
  const endPage = Math.min(totalPages, startPage + maxPages - 1);

  if (endPage - startPage + 1 < maxPages) {
    startPage = Math.max(1, endPage - maxPages + 1);
  }

  for (let i = startPage; i <= endPage; i++) {
    pages.push({
      number: i,
      url: buildUrl(i),
      isActive: i !== currentPage,
      isCurrent: i === currentPage
    });
  }

  return {
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage,
    hasNext,
    hasPrevious,
    nextUrl: hasNext ? buildUrl(currentPage + 1) : undefined,
    previousUrl: hasPrevious ? buildUrl(currentPage - 1) : undefined,
    pages
  };
}

/**
 * Check if a path is active relative to current path
 */
function isPathActive(path: string, currentPath: string): boolean {
  if (path === currentPath) return true;
  if (path === '/') return currentPath === '/';

  // Check if current path starts with this path (for nested pages)
  return currentPath.startsWith(path + '/');
}

/**
 * Format a path part into a readable label
 */
function formatPathPart(part: string): string {
  return part.replace(/[-_]/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}
