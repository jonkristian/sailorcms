<script lang="ts">
  import type { PageData } from './$types';
  import AuthWidget from '$lib/components/sailor/AuthWidget.svelte';
  const { data }: { data: PageData } = $props();
</script>

<AuthWidget />

<svelte:head>
  <title>Pages</title>
</svelte:head>

<div class="pages-listing">
  <h1 class="pages-listing-title">Pages</h1>

  {#if data.pages.length === 0}
    <p>No pages found, add some pages to the pages collection to see them here.</p>
  {/if}

  <div class="pages-grid">
    {#each data.pages as page (page.id || page.slug)}
      <article class="page-item">
        <h2 class="page-item-title">
          <a href="/pages/{page.slug}" class="page-item-link">
            {page.title}
          </a>
        </h2>

        {#if page.excerpt}
          <p class="page-item-excerpt">{page.excerpt}</p>
        {/if}

        <div class="page-item-meta">
          <span class="page-item-info"
            >Status: {page.status} • Created: {new Date(page.created_at).toLocaleDateString()}</span
          >
          <a href="/pages/{page.slug}" class="page-item-read-more"> Read more → </a>
        </div>
      </article>
    {/each}
  </div>
</div>

<style>
  /* Pages listing layout */
  .pages-listing {
    max-width: 64rem;
    margin: 0 auto;
    padding: 2rem 1rem;
    min-height: 100vh;
  }

  .pages-listing-title {
    font-size: 2rem;
    font-weight: 300;
    margin-bottom: 3rem;
    color: var(--color-text);
    letter-spacing: -0.025em;
  }

  .pages-grid {
    margin-bottom: 3rem;
  }

  .pages-grid > * + * {
    margin-top: 2rem;
  }

  /* Page items */
  .page-item {
    padding-bottom: 2rem;
    margin-bottom: 2rem;
    border-bottom: 1px solid var(--color-border);
  }

  .page-item:last-child {
    border-bottom: none;
  }

  .page-item-title {
    font-size: 1.25rem;
    font-weight: 500;
    margin-bottom: 0.5rem;
  }

  .page-item-link {
    color: var(--color-text);
    text-decoration: none;
    transition: var(--transition);
  }

  .page-item-link:hover {
    color: var(--color-primary);
  }

  .page-item-excerpt {
    color: var(--color-text-secondary);
    margin-bottom: 1rem;
    line-height: 1.6;
    font-size: 0.95rem;
  }

  .page-item-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.8rem;
    color: var(--color-text-muted);
  }

  .page-item-info {
    color: var(--color-text-muted);
    font-weight: 300;
  }

  .page-item-read-more {
    color: var(--color-primary);
    text-decoration: none;
    transition: var(--transition);
    font-size: 0.85rem;
    font-weight: 500;
  }

  .page-item-read-more:hover {
    color: var(--color-primary-hover);
  }
</style>
