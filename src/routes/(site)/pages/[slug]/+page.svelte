<script lang="ts">
  import type { PageData } from './$types';
  import AuthWidget from '$lib/components/sailor/AuthWidget.svelte';
  import { getImage } from '$lib/sailor/utils/files';
  const { data }: { data: PageData } = $props();
</script>

<AuthWidget />

<svelte:head>
  <!-- SEO Meta Tags - Generated from Sailor CMS SEO utilities -->
  {@html data.metaTags}
</svelte:head>

<article class="page-content">
  <header class="page-header">
    <h1 class="page-title">{data.page.title}</h1>

    <div class="page-meta">
      Status: {data.page.status} • Created: {new Date(data.page.created_at).toLocaleDateString()} • Updated:
      {new Date(data.page.updated_at).toLocaleDateString()}
    </div>

    {#if data.page.excerpt}
      <p class="page-excerpt">{data.page.excerpt}</p>
    {/if}
  </header>

  <!-- Render blocks from seed data -->
  {#if data.blocks && data.blocks.length > 0}
    <div class="blocks-container">
      {#each data.blocks as block}
        {@const blockData = block as any}
        {#if blockData.blockType === 'hero'}
          {@const heroImageUrl = blockData.background_image?.id
            ? getImage(blockData.background_image.id, {
                width: 1920,
                height: 1080,
                quality: 95,
                format: 'webp'
              })
            : ''}
          <section
            class="hero-block"
            style={heroImageUrl
              ? `background-image: url('${heroImageUrl}'); background-size: cover; background-position: center;`
              : ''}
          >
            <div class="hero-overlay">
              <div class="hero-content-wrapper">
                <h2 class="hero-title">{blockData.title}</h2>
                {#if blockData.subtitle}
                  <p class="hero-subtitle">{blockData.subtitle}</p>
                {/if}
                {#if blockData.content}
                  <div class="hero-content">
                    {@html blockData.content}
                  </div>
                {/if}
              </div>
            </div>
          </section>
        {:else if blockData.blockType === 'rich_text'}
          <section class="rich-text-block">
            {@html blockData.content}
          </section>
        {:else if blockData.blockType === 'gallery'}
          <section class="gallery-block">
            {#if blockData.title}
              <div class="gallery-header">
                <h2 class="gallery-title">{blockData.title}</h2>
                <div class="gallery-underline"></div>
              </div>
            {/if}
            {#if blockData.images && blockData.images.length > 0}
              <div class="gallery-grid">
                {#each blockData.images as image}
                  {#if image}
                    {@const galleryImage = getImage(image.id, {
                      widths: [400, 800],
                      aspectRatio: 4 / 3,
                      quality: 85,
                      format: 'webp',
                      sizes: '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw'
                    })}
                    <div class="gallery-item">
                      <img
                        src={galleryImage.src}
                        srcset={galleryImage.srcset}
                        sizes={galleryImage.sizes}
                        alt={image.alt || image.title || 'Gallery image'}
                        loading="lazy"
                      />
                      {#if image.title}
                        <div class="gallery-overlay">
                          <div class="gallery-caption">
                            <p class="gallery-caption-title">{image.title}</p>
                            {#if image.alt && image.alt !== image.title}
                              <p class="gallery-caption-alt">{image.alt}</p>
                            {/if}
                          </div>
                        </div>
                      {/if}
                    </div>
                  {/if}
                {/each}
              </div>
            {:else}
              <div class="gallery-empty">
                <div class="gallery-empty-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    ></path>
                  </svg>
                </div>
                <p>No images in this gallery.</p>
              </div>
            {/if}
          </section>
        {:else if blockData.blockType === 'media_text'}
          <section class="media-text-block">
            <div class="media-text-container">
              {#if blockData.images && blockData.images.length > 0}
                <div class="media-text-image">
                  {#each blockData.images as image}
                    {#if image}
                      {@const mediaImage = getImage(image.id, {
                        widths: [600, 1200],
                        aspectRatio: 3 / 2,
                        quality: 90,
                        format: 'webp',
                        sizes: '(max-width: 1024px) 100vw, 50vw'
                      })}
                      <div class="media-image-wrapper">
                        <img
                          src={mediaImage.src}
                          srcset={mediaImage.srcset}
                          sizes={mediaImage.sizes}
                          alt={image.alt || image.title || 'Media image'}
                          loading="lazy"
                        />
                      </div>
                    {/if}
                  {/each}
                </div>
              {/if}
              <div class="media-text-content">
                {#if blockData.title}
                  <h2 class="media-text-title">{blockData.title}</h2>
                {/if}
                {#if blockData.subtitle}
                  <p class="media-text-subtitle">{blockData.subtitle}</p>
                {/if}
                {#if blockData.content}
                  <div class="media-text-body">
                    {@html blockData.content}
                  </div>
                {/if}
              </div>
            </div>
          </section>
        {/if}
      {/each}
    </div>
  {:else}
    <!-- No blocks available -->
    <div class="no-content">
      <p>No content blocks found for this page.</p>
    </div>
  {/if}

  <footer class="page-footer">
    <a href="/pages" class="back-link">← Back to Pages</a>
  </footer>
</article>

<style>
  /* Base page layout */
  .page-content {
    max-width: 64rem;
    margin: 0 auto;
    padding: 2rem 1rem;
    min-height: 100vh;
  }

  .page-header {
    margin-bottom: 3rem;
    text-align: center;
  }

  .page-title {
    font-size: 3rem;
    font-weight: 700;
    margin-bottom: 1rem;
    background: linear-gradient(135deg, var(--color-text) 0%, var(--color-primary) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .page-meta {
    font-size: 0.875rem;
    color: var(--color-text-muted);
    margin-bottom: 1.5rem;
  }

  .page-excerpt {
    font-size: 1.125rem;
    color: var(--color-text-secondary);
    font-style: italic;
    border-left: 4px solid var(--color-primary);
    padding-left: 1rem;
    background: var(--color-bg-secondary);
    padding: 1rem 1rem 1rem 2rem;
    border-radius: var(--border-radius-sm);
    margin: 2rem 0;
  }

  .blocks-container {
    margin-bottom: 3rem;
  }

  .blocks-container > * + * {
    margin-top: 3rem;
  }

  /* Hero block */
  .hero-block {
    position: relative;
    min-height: 70vh;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--border-radius-lg);
    overflow: hidden;
    margin: 0 0 4rem 0;
    box-shadow: var(--shadow-xl);
  }

  .hero-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, rgba(0, 0, 0, 0.4) 0%, rgba(0, 0, 0, 0.6) 100%);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .hero-content-wrapper {
    text-align: center;
    z-index: 10;
    max-width: 800px;
    padding: 2rem;
  }

  .hero-title {
    font-size: 3.5rem;
    font-weight: 700;
    margin-bottom: 1.5rem;
    color: white;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
  }

  .hero-subtitle {
    font-size: 1.5rem;
    margin-bottom: 2rem;
    color: rgba(255, 255, 255, 0.9);
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  }

  .hero-content {
    font-size: 1.125rem;
    max-width: none;
  }

  .hero-content :global(p) {
    color: rgba(255, 255, 255, 0.85);
    margin-bottom: 1rem;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  }

  /* Rich text block */
  .rich-text-block {
    background: var(--color-bg-secondary);
    padding: 3rem;
    border-radius: var(--border-radius-lg);
    border: 1px solid var(--color-border);
    box-shadow: var(--shadow);
  }

  .rich-text-block :global(p) {
    color: var(--color-text-secondary);
    margin-bottom: 1rem;
    line-height: 1.7;
  }

  .rich-text-block :global(h1),
  .rich-text-block :global(h2),
  .rich-text-block :global(h3),
  .rich-text-block :global(h4),
  .rich-text-block :global(h5),
  .rich-text-block :global(h6) {
    color: var(--color-text);
    margin-top: 2rem;
    margin-bottom: 1rem;
    font-weight: 600;
  }

  .rich-text-block :global(ul),
  .rich-text-block :global(ol) {
    margin-bottom: 1rem;
    padding-left: 1.5rem;
  }

  .rich-text-block :global(li) {
    margin-bottom: 0.5rem;
    color: var(--color-text-secondary);
  }

  /* Gallery block */
  .gallery-block {
    padding: 4rem 3rem;
    background: var(--color-bg-secondary);
    border-radius: var(--border-radius-lg);
    border: 1px solid var(--color-border);
    box-shadow: var(--shadow);
  }

  .gallery-header {
    margin-bottom: 3rem;
    text-align: center;
  }

  .gallery-title {
    font-size: 2.5rem;
    font-weight: 700;
    color: var(--color-text);
    margin-bottom: 1rem;
    background: linear-gradient(135deg, var(--color-text) 0%, var(--color-primary) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .gallery-underline {
    width: 4rem;
    height: 0.25rem;
    background: var(--gradient-primary);
    margin: 0 auto;
    border-radius: 2px;
  }

  .gallery-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 2rem;
  }

  .gallery-item {
    position: relative;
    overflow: hidden;
    border-radius: 0.75rem;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    transition: all 0.3s ease;
  }

  .gallery-item:hover {
    box-shadow: var(--shadow-xl);
    transform: translateY(-4px);
  }

  .gallery-item img {
    width: 100%;
    height: 18rem;
    object-fit: cover;
    transition: transform 0.5s ease;
  }

  .gallery-item:hover img {
    transform: scale(1.05);
  }

  .gallery-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.8), rgba(0, 0, 0, 0.2));
    opacity: 0;
    transition: opacity 0.3s ease;
  }

  .gallery-item:hover .gallery-overlay {
    opacity: 1;
  }

  .gallery-caption {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 1.5rem;
    color: white;
  }

  .gallery-caption-title {
    font-size: 1.125rem;
    font-weight: 600;
    margin-bottom: 0.25rem;
  }

  .gallery-caption-alt {
    font-size: 0.875rem;
    opacity: 0.9;
  }

  .gallery-empty {
    padding: 3rem 0;
    text-align: center;
  }

  .gallery-empty-icon {
    width: 4rem;
    height: 4rem;
    margin: 0 auto 1rem;
    background: var(--color-bg-tertiary);
    border: 2px solid var(--color-border);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .gallery-empty-icon svg {
    width: 2rem;
    height: 2rem;
    color: var(--color-text-muted);
  }

  .gallery-empty p {
    color: var(--color-text-muted);
  }

  /* Media text block */
  .media-text-block {
    padding: 4rem 3rem;
    background: var(--color-bg-secondary);
    border-radius: var(--border-radius-lg);
    border: 1px solid var(--color-border);
    box-shadow: var(--shadow);
  }

  .media-text-container {
    display: grid;
    grid-template-columns: 1fr;
    gap: 4rem;
    align-items: center;
  }

  @media (min-width: 1024px) {
    .media-text-container {
      grid-template-columns: 1fr 1fr;
    }
  }

  .media-text-image {
    order: 2;
  }

  @media (min-width: 1024px) {
    .media-text-image {
      order: 1;
    }
  }

  .media-image-wrapper {
    position: relative;
    overflow: hidden;
    border-radius: 0.75rem;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  }

  .media-image-wrapper img {
    width: 100%;
    height: 20rem;
    object-fit: cover;
    transition: transform 0.5s ease;
  }

  .media-image-wrapper:hover img {
    transform: scale(1.05);
  }

  .media-text-content {
    order: 1;
  }

  @media (min-width: 1024px) {
    .media-text-content {
      order: 2;
    }
  }

  .media-text-title {
    font-size: 2.25rem;
    font-weight: 700;
    color: var(--color-text);
    margin-bottom: 1rem;
    background: linear-gradient(135deg, var(--color-text) 0%, var(--color-primary) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .media-text-subtitle {
    font-size: 1.25rem;
    color: var(--color-text-muted);
    margin-bottom: 1.5rem;
    line-height: 1.6;
  }

  .media-text-body {
    max-width: none;
  }

  .media-text-body :global(p) {
    color: var(--color-text-secondary);
    margin-bottom: 1rem;
    line-height: 1.7;
    font-size: 1.125rem;
  }

  /* No content */
  .no-content {
    padding: 4rem 0;
    text-align: center;
    background: var(--color-bg-secondary);
    border-radius: var(--border-radius-lg);
    border: 1px solid var(--color-border);
    box-shadow: var(--shadow);
  }

  .no-content p {
    color: var(--color-text-muted);
    font-size: 1.125rem;
  }

  /* Footer */
  .page-footer {
    margin-top: 4rem;
    padding: 2rem 0;
    text-align: center;
    border-top: 1px solid var(--color-border);
  }

  .back-link {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--color-primary);
    text-decoration: none;
    transition: var(--transition);
    padding: 0.5rem 1.125rem;
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius-sm);
    font-weight: 500;
  }

  .back-link:hover {
    color: var(--color-primary-hover);
    background: var(--color-bg-tertiary);
    border-color: var(--color-border-light);
  }
</style>
