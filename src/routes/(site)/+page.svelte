<script lang="ts">
  let { data } = $props();

  // Extract site settings with fallbacks
  const siteName = data.siteSettings?.siteName || 'Sailor CMS';
  const siteDescription =
    data.siteSettings?.siteDescription || 'Your modern content management system.';
  const contactEmail: string | undefined = data.siteSettings?.contactEmail;
  const socialMedia: Array<{ title: string; url: string }> = data.siteSettings?.socialMedia || [];

  // Helper function to get social media icon
  function getSocialIcon(title: string) {
    const lowerTitle = title.toLowerCase();
    if (lowerTitle.includes('twitter') || lowerTitle.includes('x')) return '🐦';
    if (lowerTitle.includes('github')) return '🐙';
    if (lowerTitle.includes('linkedin')) return '💼';
    if (lowerTitle.includes('facebook')) return '📘';
    return '🔗';
  }
</script>

<div class="hero">
  <div class="container">
    <!-- Main Content -->
    <h1 class="title">{siteName}</h1>
    <p class="subtitle">{siteDescription}</p>

    <!-- CTA Buttons -->
    <div class="buttons">
      <a href="/sailor/auth/signup" class="btn btn-primary" data-sveltekit-reload>
        Get Started
        <span>→</span>
      </a>
      <a href="/pages" class="btn btn-secondary"> View Demo </a>
    </div>

    <!-- Contact & Social -->
    {#if contactEmail || socialMedia.length > 0}
      <div class="contact-section">
        <div class="contact-content">
          {#if contactEmail}
            <a href="mailto:{contactEmail}" class="contact-email">
              📧 {contactEmail}
            </a>
          {/if}

          {#if socialMedia.length > 0}
            <div class="social-links">
              {#each socialMedia as social (social.url || social.title)}
                <a
                  href={social.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="social-link"
                  title={social.title}
                >
                  {getSocialIcon(social.title)}
                </a>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .hero {
    min-height: 80vh;
    background: var(--gradient-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem 1rem;
    position: relative;
    overflow: hidden;
  }

  .container {
    max-width: 1200px;
    margin: 0 auto;
    text-align: center;
    position: relative;
    z-index: 2;
  }

  .title {
    font-size: 3.5rem;
    font-weight: 700;
    color: var(--color-text);
    margin-bottom: 1.5rem;
    line-height: 1.1;
    background: linear-gradient(135deg, var(--color-text) 0%, var(--color-primary) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .subtitle {
    font-size: 1.5rem;
    color: var(--color-text-secondary);
    max-width: 600px;
    margin: 0 auto 3rem;
    line-height: 1.6;
  }

  .buttons {
    display: flex;
    gap: 1rem;
    justify-content: center;
    margin-bottom: 4rem;
    flex-wrap: wrap;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1.125rem;
    border-radius: var(--border-radius-sm);
    font-weight: 500;
    text-decoration: none;
    transition: var(--transition);
    border: none;
    cursor: pointer;
    font-size: 1rem;
  }

  .btn-primary {
    background: var(--gradient-primary);
    color: white;
    box-shadow: var(--shadow);
  }

  .btn-primary:hover {
    box-shadow: var(--shadow-lg);
  }

  .btn-secondary {
    background: var(--color-bg-secondary);
    color: var(--color-text-secondary);
    border: 2px solid var(--color-border);
    backdrop-filter: blur(10px);
  }

  .btn-secondary:hover {
    background: var(--color-bg-tertiary);
    border-color: var(--color-border-light);
    color: var(--color-text);
  }

  .contact-section {
    border-top: 1px solid var(--color-border);
    padding-top: 2rem;
    margin-top: 2rem;
  }

  .contact-content {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    justify-content: center;
    align-items: center;
  }

  .contact-email {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--color-text-secondary);
    text-decoration: none;
    transition: var(--transition);
    padding: 0.5rem 1rem;
    border-radius: var(--border-radius-sm);
    border: 1px solid var(--color-border);
    background: var(--color-bg-secondary);
  }

  .contact-email:hover {
    color: var(--color-text);
    border-color: var(--color-border-light);
    background: var(--color-bg-tertiary);
  }

  .social-links {
    display: flex;
    gap: 1rem;
    align-items: center;
  }

  .social-link {
    color: var(--color-text-secondary);
    text-decoration: none;
    font-size: 1.25rem;
    transition: var(--transition);
    padding: 0.75rem;
    border-radius: var(--border-radius-sm);
    border: 1px solid var(--color-border);
    background: var(--color-bg-secondary);
  }

  .social-link:hover {
    color: var(--color-text);
    border-color: var(--color-border-light);
    background: var(--color-bg-tertiary);
  }

  @media (max-width: 768px) {
    .title {
      font-size: 2.5rem;
    }

    .subtitle {
      font-size: 1.25rem;
    }

    .buttons {
      flex-direction: column;
      align-items: center;
    }

    .btn {
      width: 100%;
      max-width: 300px;
      justify-content: center;
    }

    .contact-content {
      flex-direction: column;
      gap: 1rem;
    }
  }
</style>
