<script lang="ts">
  import type { PageData } from './$types';
  import AuthWidget from '$lib/components/sailor/AuthWidget.svelte';
  import { resolve } from '$app/paths';
  const { data }: { data: PageData } = $props();
</script>

<AuthWidget />

<svelte:head>
  {@html data.metaTags}
</svelte:head>

<article class="blog-content">
  <header class="blog-header">
    <h1 class="blog-title">{data.post.title}</h1>

    <div class="blog-meta">
      Published: {new Date(data.post.created_at).toLocaleDateString()}
      {#if data.post.updated_at !== data.post.created_at}
        • Updated: {new Date(data.post.updated_at).toLocaleDateString()}
      {/if}
    </div>

    {#if data.post.excerpt}
      <p class="blog-excerpt">{data.post.excerpt}</p>
    {/if}
  </header>

  <!-- Main Content -->
  {#if data.post.content}
    <div class="blog-content-body">
      {@html data.post.content}
    </div>
  {/if}

  <!-- Related Posts -->
  {#if data.relatedPosts.length > 0}
    <section class="related-posts">
      <h2 class="related-posts-title">Related Posts</h2>
      <div class="related-posts-grid">
        {#each data.relatedPosts as relatedPost (relatedPost.id || relatedPost.slug)}
          <article class="related-post-card">
            <h3 class="related-post-title">
              <a href={resolve(`/blog/${relatedPost.slug}`)} class="related-post-link">
                {relatedPost.title}
              </a>
            </h3>
            {#if relatedPost.excerpt}
              <p class="related-post-excerpt">{relatedPost.excerpt}</p>
            {/if}
          </article>
        {/each}
      </div>
    </section>
  {/if}

  <footer class="blog-footer">
    <a href={resolve('/blog')} class="back-link">← Back to Blog</a>
  </footer>
</article>

<style>
  /* Blog layout */
  .blog-content {
    max-width: 64rem;
    margin: 0 auto;
    padding: 2rem 1rem;
  }

  .blog-header {
    margin-bottom: 2rem;
  }

  .blog-title {
    font-size: 2.5rem;
    font-weight: bold;
    margin-bottom: 1rem;
    color: #1f2937;
  }

  .blog-meta {
    font-size: 0.875rem;
    color: #6b7280;
    margin-bottom: 1.5rem;
  }

  .blog-excerpt {
    font-size: 1.125rem;
    color: #374151;
    font-style: italic;
    border-left: 4px solid #dbeafe;
    padding-left: 1rem;
  }

  /* Main content body */
  .blog-content-body {
    line-height: 1.7;
    font-size: 1.125rem;
    color: #374151;
    margin: 2rem 0;
  }

  /* Content typography */
  .blog-content-body :global(h1),
  .blog-content-body :global(h2),
  .blog-content-body :global(h3),
  .blog-content-body :global(h4),
  .blog-content-body :global(h5),
  .blog-content-body :global(h6) {
    color: #1f2937;
    margin-top: 2rem;
    margin-bottom: 1rem;
    font-weight: 600;
  }

  .blog-content-body :global(h1) {
    font-size: 2rem;
  }
  .blog-content-body :global(h2) {
    font-size: 1.5rem;
  }
  .blog-content-body :global(h3) {
    font-size: 1.25rem;
  }

  .blog-content-body :global(p) {
    margin-bottom: 1.5rem;
  }

  .blog-content-body :global(ul),
  .blog-content-body :global(ol) {
    margin: 1.5rem 0;
    padding-left: 2rem;
  }

  .blog-content-body :global(li) {
    margin-bottom: 0.5rem;
  }

  .blog-content-body :global(blockquote) {
    border-left: 4px solid #e5e7eb;
    margin: 1.5rem 0;
    padding-left: 1rem;
    font-style: italic;
    color: #6b7280;
  }

  .blog-content-body :global(code) {
    background-color: #f3f4f6;
    padding: 0.2rem 0.4rem;
    border-radius: 0.25rem;
    font-family: ui-monospace, monospace;
    font-size: 0.875rem;
  }

  .blog-content-body :global(pre) {
    background-color: #1f2937;
    color: #f9fafb;
    padding: 1rem;
    border-radius: 0.5rem;
    overflow-x: auto;
    margin: 1.5rem 0;
  }

  .blog-content-body :global(pre code) {
    background-color: transparent;
    padding: 0;
  }

  .blog-content-body :global(img) {
    max-width: 100%;
    height: auto;
    border-radius: 0.5rem;
    margin: 1.5rem 0;
  }

  /* TipTap image alignment support - works with actual HTML output */
  .blog-content-body :global(.tiptap-image) {
    border-radius: 0.5rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    max-width: 100%;
    height: auto;
    display: block;
  }

  /* Left aligned images with text wrapping */
  .blog-content-body :global(.tiptap-image.image-left) {
    float: left !important;
    margin: 0.5rem 1rem 0.5rem 0 !important;
    clear: left;
  }

  /* Right aligned images with text wrapping */
  .blog-content-body :global(.tiptap-image.image-right) {
    float: right !important;
    margin: 0.5rem 0 0.5rem 1rem !important;
    clear: right;
  }

  /* Center aligned images */
  .blog-content-body :global(.tiptap-image.image-center) {
    display: block !important;
    margin: 1rem auto !important;
    float: none !important;
    clear: both;
  }

  /* Default images (no alignment class) */
  .blog-content-body :global(.tiptap-image:not(.image-left):not(.image-right):not(.image-center)) {
    margin: 1.5rem 0;
    float: none;
  }

  /* Alternative: Support data-alignment attribute for more robust targeting */
  .blog-content-body :global(img[data-alignment='left']) {
    float: left !important;
    margin: 0.5rem 1rem 0.5rem 0 !important;
    clear: left;
  }

  .blog-content-body :global(img[data-alignment='right']) {
    float: right !important;
    margin: 0.5rem 0 0.5rem 1rem !important;
    clear: right;
  }

  .blog-content-body :global(img[data-alignment='center']) {
    display: block !important;
    margin: 1rem auto !important;
    float: none !important;
    clear: both;
  }

  /* Clear floats after content sections */
  .blog-content-body::after {
    content: '';
    display: table;
    clear: both;
  }

  .blog-content-body :global(a) {
    color: #2563eb;
    text-decoration: underline;
    transition: color 0.2s ease;
  }

  .blog-content-body :global(a:hover) {
    color: #1d4ed8;
  }

  /* Related posts */
  .related-posts {
    border-top: 1px solid #e5e7eb;
    padding-top: 2rem;
  }

  .related-posts-title {
    font-size: 1.5rem;
    font-weight: bold;
    margin-bottom: 1.5rem;
    color: #1f2937;
  }

  .related-posts-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1.5rem;
  }

  .related-post-card {
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    padding: 1rem;
    transition: box-shadow 0.2s ease;
  }

  .related-post-card:hover {
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  }

  .related-post-title {
    font-weight: 600;
    margin-bottom: 0.5rem;
  }

  .related-post-link {
    color: #2563eb;
    text-decoration: none;
    transition: color 0.2s ease;
  }

  .related-post-link:hover {
    color: #1d4ed8;
  }

  .related-post-excerpt {
    font-size: 0.875rem;
    color: #6b7280;
  }

  /* Footer */
  .blog-footer {
    margin-top: 3rem;
    padding-top: 2rem;
    border-top: 1px solid #e5e7eb;
  }

  .back-link {
    color: #2563eb;
    text-decoration: none;
    transition: color 0.2s ease;
  }

  .back-link:hover {
    color: #1d4ed8;
  }
</style>
