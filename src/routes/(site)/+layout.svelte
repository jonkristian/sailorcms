<script lang="ts">
  import '../../app.css';
  import AuthWidget from '$lib/components/sailor/AuthWidget.svelte';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { resolve } from '$app/paths';

  let { children, data } = $props();
  let isScrolled = $state(false);

  // Computed values for active navigation states
  let isHomeActive = $derived(page.url.pathname === '/');
  let isPagesActive = $derived(page.url.pathname.includes('/pages'));
  let isBlogActive = $derived(page.url.pathname.includes('/blog'));

  onMount(() => {
    const handleScroll = () => {
      isScrolled = window.scrollY > 10;
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  });
</script>

<div class="site-layout">
  {#if data.hasDemoContent && page.url.pathname !== '/'}
    <header class="site-header" class:scrolled={isScrolled}>
      <div class="header-container">
        <div class="header-brand">
          <a href={resolve('/')} class="brand-link">
            <span class="brand-text">Sailor CMS</span>
          </a>
        </div>

        <nav class="header-nav">
          <a href={resolve('/')} class="nav-link" class:active={isHomeActive}>Home</a>
          <a href={resolve('/pages')} class="nav-link" class:active={isPagesActive}>Pages</a>
          <a href={resolve('/blog')} class="nav-link" class:active={isBlogActive}>Blog</a>
        </nav>
      </div>
    </header>
  {/if}

  <main class="site-main">
    {@render children()}
  </main>

  <footer class="site-footer">
    <div class="footer-container">
      <div class="footer-content">
        <p class="footer-text">
          Built with <span class="gradient-text">Sailor CMS</span> • A smooth sailin' template-driven
          CMS for SvelteKit
        </p>
        <a
          href="https://github.com/jonkristian/sailorcms"
          target="_blank"
          rel="noopener noreferrer"
          class="github-link"
        >
          <svg class="github-icon" viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"
            />
          </svg>
          GitHub
        </a>
      </div>
    </div>
  </footer>
</div>

<!-- AuthWidget - shows for all users by default -->
<AuthWidget />

<!-- Alternative: Only show when logged in -->
<!-- <AuthWidget loggedInOnly={true} /> -->

<style>
  * {
    margin: 0;
    padding: 0;
  }

  /* Site layout */
  .site-layout {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  .site-main {
    flex: 1;
  }

  /* Header */
  .site-header {
    position: sticky;
    top: 0;
    z-index: 100;
    padding: 1rem 0;
    transition: all 0.3s ease;
  }

  .site-header.scrolled {
    background: rgba(15, 23, 42, 0.85);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  }

  .header-container {
    max-width: 64rem;
    margin: 0 auto;
    padding: 0 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .header-brand {
    display: flex;
    align-items: center;
  }

  .brand-link {
    text-decoration: none;
    color: inherit;
    transition: var(--transition);
  }

  .brand-text {
    font-size: 1.25rem;
    font-weight: 300;
    color: var(--color-text);
    letter-spacing: -0.025em;
  }

  .brand-link:hover .brand-text {
    color: var(--color-primary);
  }

  /* Navigation */
  .header-nav {
    display: flex;
    gap: 2rem;
    align-items: center;
  }

  .nav-link {
    color: var(--color-text-muted);
    text-decoration: none;
    font-weight: 400;
    transition: var(--transition);
    font-size: 0.9rem;
    letter-spacing: 0.01em;
  }

  .nav-link:hover {
    color: var(--color-text);
  }

  .nav-link.active {
    color: var(--color-primary);
    font-weight: 500;
  }

  /* Responsive design */
  @media (max-width: 640px) {
    .header-container {
      flex-direction: column;
      height: auto;
      padding: 1rem;
      gap: 1rem;
    }

    .header-nav {
      gap: 1rem;
    }

    .nav-link {
      font-size: 0.875rem;
    }
  }

  /* Footer */
  .site-footer {
    padding: 3rem 0 2rem;
    margin-top: auto;
  }

  .footer-container {
    max-width: 64rem;
    margin: 0 auto;
    padding: 0 2rem;
  }

  .footer-content {
    text-align: center;
  }

  .footer-text {
    color: var(--color-text-muted);
    font-size: 0.8rem;
    font-weight: 300;
    letter-spacing: 0.025em;
    margin-bottom: 1rem;
  }

  .github-link {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--color-text-muted);
    text-decoration: none;
    font-size: 0.875rem;
    font-weight: 400;
    transition: var(--transition);
  }

  .github-link:hover {
    color: var(--color-primary);
  }

  .github-icon {
    width: 1.25rem;
    height: 1.25rem;
  }

  .gradient-text {
    color: var(--color-primary);
    font-weight: 400;
  }
</style>
