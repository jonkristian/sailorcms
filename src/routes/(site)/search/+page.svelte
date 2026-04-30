<script lang="ts">
  import type { PageData } from './$types';

  const { data }: { data: PageData } = $props();

  function resultHref(r: NonNullable<PageData['results']>['items'][number]): string {
    if (r.entityType === 'collection' && r.item?.url) return r.item.url;
    return `/${r.entityName}/${r.item?.slug ?? ''}`;
  }

  function pageHref(p: number, q: string): string {
    const params = new URLSearchParams();
    params.set('q', q);
    if (p > 1) params.set('page', String(p));
    return `/search?${params.toString()}`;
  }
</script>

<svelte:head>
  <title>{data.query ? `Search: ${data.query}` : 'Search'}</title>
</svelte:head>

<div class="search-page">
  <h1 class="search-title">Search</h1>

  <form method="GET" class="search-form">
    <input
      type="search"
      name="q"
      value={data.query}
      placeholder="Search posts, pages, FAQs…"
      class="search-input"
      aria-label="Search"
    />
    <button type="submit" class="search-submit">Search</button>
  </form>

  {#if !data.query}
    <p class="search-hint">Enter a query above to search across posts, pages, and FAQs.</p>
  {:else if !data.results || data.results.items.length === 0}
    <p class="search-hint">No results for "{data.query}".</p>
  {:else}
    <p class="search-meta">
      {data.results.total} result{data.results.total === 1 ? '' : 's'} for "{data.query}"
    </p>

    <ul class="search-results">
      {#each data.results.items as r (`${r.entityType}:${r.entityName}:${r.item.id}`)}
        <li class="search-result">
          <div class="search-result-kind">{r.entityName}</div>
          <h2 class="search-result-title">
            <a href={resultHref(r)} class="search-result-link">
              {r.item.title ?? r.item.slug ?? '(untitled)'}
            </a>
          </h2>
          {#if r.snippet}
            <p class="search-result-snippet">{r.snippet}</p>
          {/if}
          {#if r.matchedFields.length}
            <div class="search-result-fields">
              Matched: {r.matchedFields.join(', ')}
            </div>
          {/if}
        </li>
      {/each}
    </ul>

    {#if data.results.pagination && data.results.pagination.totalPages > 1}
      <nav class="pagination" aria-label="Search results pages">
        {#if data.results.pagination.hasPreviousPage}
          <a href={pageHref(data.results.pagination.page - 1, data.query)} class="pagination-link">
            Previous
          </a>
        {/if}

        <span class="pagination-current">
          Page {data.results.pagination.page} of {data.results.pagination.totalPages}
        </span>

        {#if data.results.pagination.hasNextPage}
          <a href={pageHref(data.results.pagination.page + 1, data.query)} class="pagination-link">
            Next
          </a>
        {/if}
      </nav>
    {/if}
  {/if}
</div>

<style>
  .search-page {
    max-width: 64rem;
    margin: 0 auto;
    padding: 2rem 1rem;
    min-height: 100vh;
  }

  .search-title {
    font-size: 2rem;
    font-weight: 300;
    margin-bottom: 2rem;
    color: var(--color-text);
    letter-spacing: -0.025em;
  }

  .search-form {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 2rem;
  }

  .search-input {
    flex: 1;
    padding: 0.75rem 1rem;
    border: 1px solid var(--color-border);
    background: var(--color-bg-secondary);
    color: var(--color-text);
    border-radius: var(--border-radius-sm);
    font-size: 1rem;
    transition: var(--transition);
  }

  .search-input:focus {
    outline: none;
    border-color: var(--color-primary);
  }

  .search-submit {
    padding: 0.75rem 1.25rem;
    background: var(--gradient-primary);
    color: white;
    border: none;
    border-radius: var(--border-radius-sm);
    font-weight: 500;
    cursor: pointer;
    transition: var(--transition);
  }

  .search-submit:hover {
    box-shadow: var(--shadow);
  }

  .search-hint {
    color: var(--color-text-muted);
    font-size: 0.95rem;
  }

  .search-meta {
    color: var(--color-text-muted);
    font-size: 0.85rem;
    margin-bottom: 1.5rem;
  }

  .search-results {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .search-result {
    padding-bottom: 1.5rem;
    margin-bottom: 1.5rem;
    border-bottom: 1px solid var(--color-border);
  }

  .search-result:last-child {
    border-bottom: none;
  }

  .search-result-kind {
    display: inline-block;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-primary);
    margin-bottom: 0.35rem;
    font-weight: 500;
  }

  .search-result-title {
    font-size: 1.15rem;
    font-weight: 500;
    margin-bottom: 0.5rem;
  }

  .search-result-link {
    color: var(--color-text);
    text-decoration: none;
    transition: var(--transition);
  }

  .search-result-link:hover {
    color: var(--color-primary);
  }

  .search-result-snippet {
    color: var(--color-text-secondary);
    line-height: 1.6;
    font-size: 0.95rem;
    margin-bottom: 0.5rem;
  }

  .search-result-fields {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .pagination {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 1rem;
    margin-top: 3rem;
  }

  .pagination-link {
    color: var(--color-text-muted);
    text-decoration: none;
    transition: var(--transition);
    font-size: 0.9rem;
    font-weight: 400;
  }

  .pagination-link:hover {
    color: var(--color-text);
  }

  .pagination-current {
    color: var(--color-primary);
    font-size: 0.9rem;
    font-weight: 500;
  }
</style>
