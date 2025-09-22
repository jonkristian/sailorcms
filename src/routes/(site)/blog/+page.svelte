<script lang="ts">
  import type { PageData } from './$types';
  import AuthWidget from '$lib/components/sailor/AuthWidget.svelte';

  const { data }: { data: PageData } = $props();
</script>

<AuthWidget />

<svelte:head>
  <title>Blog</title>
</svelte:head>

<div class="blog-listing">
  <h1 class="blog-listing-title">Blog</h1>

  {#if data.posts.length === 0}
    <p>No posts found, add some posts to the posts collection to see them here.</p>
  {/if}

  <div class="blog-posts">
    {#each data.posts as post (post.id || post.slug)}
      <article class="blog-post-item">
        <h2 class="blog-post-title">
          <a href="/blog/{post.slug}" class="blog-post-link">
            {post.title}
          </a>
        </h2>

        {#if post.excerpt}
          <p class="blog-post-excerpt">{post.excerpt}</p>
        {/if}

        <div class="blog-post-meta">
          <span class="blog-post-date">Published: {post.created_at}</span>
          <a href="/blog/{post.slug}" class="blog-post-read-more"> Read more → </a>
        </div>
      </article>
    {/each}
  </div>

  <!-- Pagination -->
  {#if data.pagination && data.pagination.totalPages > 1}
    <nav class="pagination">
      {#if data.pagination.hasPreviousPage}
        <a href="?page={data.pagination.page - 1}" class="pagination-link"> Previous </a>
      {/if}

      <span class="pagination-current">
        Page {data.pagination.page} of {data.pagination.totalPages}
      </span>

      {#if data.pagination.hasNextPage}
        <a href="?page={data.pagination.page + 1}" class="pagination-link"> Next </a>
      {/if}
    </nav>
  {/if}
</div>

<style>
  /* Blog listing layout */
  .blog-listing {
    max-width: 64rem;
    margin: 0 auto;
    padding: 2rem 1rem;
    min-height: 100vh;
  }

  .blog-listing-title {
    font-size: 2rem;
    font-weight: 300;
    margin-bottom: 3rem;
    color: var(--color-text);
    letter-spacing: -0.025em;
  }

  .blog-posts {
    margin-bottom: 3rem;
  }

  .blog-posts > * + * {
    margin-top: 2rem;
  }

  /* Blog post items */
  .blog-post-item {
    padding-bottom: 2rem;
    margin-bottom: 2rem;
    border-bottom: 1px solid var(--color-border);
  }

  .blog-post-item:last-child {
    border-bottom: none;
  }

  .blog-post-title {
    font-size: 1.25rem;
    font-weight: 500;
    margin-bottom: 0.5rem;
  }

  .blog-post-link {
    color: var(--color-text);
    text-decoration: none;
    transition: var(--transition);
  }

  .blog-post-link:hover {
    color: var(--color-primary);
  }

  .blog-post-excerpt {
    color: var(--color-text-secondary);
    margin-bottom: 1rem;
    line-height: 1.6;
    font-size: 0.95rem;
  }

  .blog-post-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.8rem;
    color: var(--color-text-muted);
  }

  .blog-post-date {
    color: var(--color-text-muted);
    font-weight: 300;
  }

  .blog-post-read-more {
    color: var(--color-primary);
    text-decoration: none;
    transition: var(--transition);
    font-size: 0.85rem;
    font-weight: 500;
  }

  .blog-post-read-more:hover {
    color: var(--color-primary-hover);
  }

  /* Pagination */
  .pagination {
    display: flex;
    justify-content: center;
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
