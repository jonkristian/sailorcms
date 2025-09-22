# Utilities

Simple helper functions for loading content in your SvelteKit app.

## Collections

```typescript
import { getCollectionItems, getCollectionItem, getCollection } from '$lib/sailor/utils';

// Multiple items - always returns { items: TypedItem[] }
const posts = await getCollectionItems('posts');

// Get children of a parent item
const subpages = await getCollectionItems('pages', {
  query: 'children',
  value: 'parent-page-id'
});

// Get siblings of an item
const relatedPosts = await getCollectionItems('posts', {
  query: 'siblings',
  value: 'current-post-id',
  excludeCurrent: true
});

// Single items - returns TypedItem | null
const post = await getCollectionItem('posts', {
  query: 'slug',
  value: 'my-post'
});

const postById = await getCollectionItem('posts', {
  query: 'id',
  value: 'some-uuid'
});

// Items automatically include hierarchical URL property
const pages = await getCollectionItems('pages');
pages.items.forEach((page) => {
  console.log(page.url); // "/parent-page/child-page" (hierarchical)
  console.log(page.title); // "Child Page Title"
  console.log(page.slug); // "child-page"
});

// Optional: include breadcrumb navigation
const pagesWithBreadcrumbs = await getCollectionItems('pages', {
  includeBreadcrumbs: true
});
pagesWithBreadcrumbs.items.forEach((page) => {
  console.log(page.url); // "/parent-page/child-page"
  console.log(page.breadcrumbs); // [{ title: "Parent Page", url: "/parent-page", slug: "parent-page" }]
});

// Pagination support in clean API
const paginatedPosts = await getCollectionItems('posts', {
  limit: 10,
  currentPage: 2,
  baseUrl: '/blog'
});
console.log(paginatedPosts.items); // Array of posts
console.log(paginatedPosts.total); // Total count
console.log(paginatedPosts.hasMore); // Has more pages?
console.log(paginatedPosts.pagination); // Full pagination info

// Complex queries with pagination, filtering, grouping
const posts = await getCollection('posts', {
  limit: 10,
  currentPage: 2,
  baseUrl: '/blog',
  status: 'published',
  includeBlocks: false,
  groupBy: 'tags',
  whereRelated: { field: 'categories', value: 'tech' }
});
```

## Globals

```typescript
import { getGlobalItems, getGlobalItem, getGlobal } from '$lib/sailor/utils';

// Multiple items from repeatable globals - includes metadata
const menus = await getGlobalItems('menus');
const faqs = await getGlobalItems('faq');
console.log(faqs.items); // Array of FAQ items
console.log(faqs.total); // Total count
console.log(faqs.grouped); // Grouped by field (if requested)

// Filter by slug in repeatable global
const faqsInCategory = await getGlobalItems('faq', {
  query: 'slug',
  value: 'category-slug'
});

// Single item from repeatable global
const mainMenu = await getGlobalItem('menus', {
  query: 'slug',
  value: 'main'
});

const menuById = await getGlobalItem('menus', {
  query: 'id',
  value: 'some-uuid'
});

// Singleton global (settings, site config) - returns the object directly
const settings = await getGlobal('configuration');

// Complex queries with grouping, tags, ordering
const faqsByTags = await getGlobal('faq', {
  withTags: true,
  groupBy: 'tags',
  orderBy: 'title',
  order: 'asc'
});
```

## Files & Images

### Client-side (Browser Components)

```typescript
import { getFile, getImage } from '$lib/sailor/utils/files';

// Get any file URL (works with UUIDs or file paths)
const fileUrl = getFile('file-id-123');
const docUrl = getFile('/uploads/document.pdf');

// Single image with transformations
const imageUrl = getImage('file-id-123', {
  width: 800,
  height: 600,
  quality: 90,
  format: 'webp'
});

// Responsive images with srcset
const responsive = getImage('file-id-123', {
  responsive: true,
  widths: [400, 800, 1200],
  aspectRatio: 16 / 9,
  quality: 90
});
// Returns: { src: string, srcset: string, sizes: string }

// CMS provides default breakpoints: [375, 768, 1200, 1600]
// Override if needed for your project:
import { setDefaultBreakpoints } from '$lib/sailor/utils/files';
setDefaultBreakpoints([375, 768, 1024, 1400]);

// getImage() is responsive by default (modern web best practice)
const responsive = getImage('file-id-123', { aspectRatio: 4 / 3 });
// Returns: { src: string, srcset: string, sizes: string }

// Generate complete HTML with fallback support
const html = getImage('file-id-123', {
  html: true,
  alt: 'Product image',
  fallback: '/images/placeholder.jpg',
  class: 'product-image',
  aspectRatio: 4 / 3
});
// Returns: '<img src="..." srcset="..." sizes="..." alt="Product image" class="product-image">'
```

### Server-side (Page Load Functions)

```typescript
import { getFile, getImage, getImagesByTags } from '$lib/sailor/utils/files.server';

// Get file URL by database ID (for SEO meta tags, etc.)
const fileUrl = await getFile('file-id-123');

// Get image with transformations (for og:image, etc.)
const ogImage = await getImage('file-id-123', {
  width: 1200,
  height: 630,
  quality: 90
});

// Get images by tags with pagination
const galleryImages = await getImagesByTags(['gallery', 'featured']);
// Returns: { images: ImageWithTags[], total: number, hasMore: boolean }

// Get images with pagination options
const result = await getImagesByTags(['nature'], {
  limit: 20,
  offset: 0,
  matchAll: false // false = match ANY tag, true = match ALL tags
});

// Get images that have ALL specified tags
const specificImages = await getImagesByTags(['nature', 'sunset'], {
  matchAll: true,
  limit: 10,
  offset: 20
});
```

## Content Utilities

```typescript
import { renderContent, getExcerpt } from '$lib/sailor/utils/content';

// Convert TipTap JSON content to HTML
const html = renderContent(post.content);
const html = renderContent(page.content);

// Get excerpt from content with custom length
const excerpt = getExcerpt(post.content, 160); // 160 characters
const excerpt = getExcerpt(page.content, 300); // 300 characters

// Custom suffix
const excerpt = getExcerpt(post.content, 160, ' [read more]');
```

**Content Utilities Features:**

- **`renderContent()`** - Handles both TipTap JSON and HTML strings, automatically converts TipTap to HTML
- **`getExcerpt()`** - Extracts clean text excerpts, respects word boundaries, supports custom length and suffix
- **Smart content detection** - Automatically detects content type and processes accordingly
- **HTML stripping** - Removes HTML tags when extracting plain text for excerpts

## Settings

```typescript
import { getSiteSettings } from '$lib/sailor/utils';

// Site-specific settings (contact email, social media, etc.)
const config = await getSiteSettings();
```

## SEO

```typescript
import { extractSEO, generateMetaTags } from '$lib/sailor/utils/seo';

// Get post with SEO fields (automatically included with seo: true)
const post = await getCollection('posts', { slug: 'my-post' });

// Extract SEO data with smart fallbacks
const seo = extractSEO(post, {
  siteName: 'My Blog',
  baseUrl: 'https://myblog.com',
  basePath: '/articles/' // Use collection's basePath option
});

// Generate HTML meta tags
const metaTags = generateMetaTags(seo);

// Use in Svelte
// <svelte:head>{@html metaTags}</svelte:head>
```

## Image Transformations & Responsive Images

Images are transformed on-the-fly with caching for performance:

```typescript
// Single images - exact dimensions for your design
const heroImage = getImage('file-id', { width: 1400, height: 800, quality: 90 });
const cardImage = getImage('file-id', { width: 400, height: 250, quality: 85 });
const avatar = getImage('file-id', { width: 100, height: 100, quality: 90 });

// Different formats and resize modes
const webpImage = getImage('file-id', { width: 800, format: 'webp' });
const coverImage = getImage('file-id', { width: 400, height: 300, resize: 'cover' });
const containImage = getImage('file-id', { width: 400, height: 300, resize: 'contain' });

// Responsive images with automatic srcset generation
const responsive = getImage('file-id', {
  responsive: true,
  widths: [400, 800, 1200],
  aspectRatio: 16 / 9,
  quality: 85,
  sizes: '(max-width: 768px) 100vw, 50vw'
});

// Advanced responsive with custom descriptors
const retina = getImage('logo.png', {
  responsive: true,
  variants: [
    { width: 200, descriptor: '1x' },
    { width: 400, descriptor: '2x' }
  ]
});
```

### Using Responsive Images in Svelte

```svelte
<!-- Option 1: Responsive object destructuring (explicit control) -->
{#if post.featured_image}
  {@const { src, srcset, sizes } = getImage(post.featured_image, {
    aspectRatio: 16 / 9
  })}
  <img {src} {srcset} {sizes} alt={post.title} />
{/if}

<!-- Option 2: Complete HTML generation (super clean!) -->
{@html getImage(post.featured_image, {
  html: true,
  alt: post.title,
  fallback: 'https://example.com/placeholder.jpg',
  class: 'featured-image',
  aspectRatio: 16 / 9
})}

<!-- Perfect for loops with fallback -->
{#each posts as post}
  {@html getImage(post.featured_image, {
    html: true,
    alt: post.title,
    fallback: '/images/post-placeholder.jpg',
    class: 'post-thumbnail',
    aspectRatio: 4 / 3
  })}
{/each}

<!-- Hero with custom breakpoints -->
{@html getImage(hero.background_image, {
  html: true,
  alt: 'Hero banner',
  class: 'hero-bg',
  widths: [800, 1200, 1600],
  aspectRatio: 21 / 9
})}

<!-- Smaller images (avatars work great with responsive too!) -->
{@html getImage(post.avatar, {
  html: true,
  alt: 'Author avatar',
  class: 'avatar',
  widths: [50, 100, 150],
  aspectRatio: 1
})}
```

## Working with Blocks

Collections load blocks by default. File fields contain complete file objects:

```svelte
<script>
  // In +page.server.ts
  // const page = await getCollection('pages', { slug: 'home' });

  let { data } = $props();
</script>

{#each data.page.blocks as block}
  {#if block.blockType === 'hero'}
    <section class="hero">
      <h1>{block.headline}</h1>
      {#if block.background_image}
        <img src={block.background_image.url} alt={block.background_image.alt} />
      {/if}
    </section>
  {/if}
{/each}
```

## Working with Content

Use content utilities to handle TipTap JSON content and create excerpts:

```svelte
<script>
  import { renderContent, getExcerpt } from '$lib/sailor/utils/content';

  let { data } = $props();
  const excerpt = getExcerpt(data.post.content, 160);
</script>

<article>
  <h1>{data.post.title}</h1>
  <p class="excerpt">{excerpt}</p>

  <!-- Render TipTap content as HTML -->
  <div class="content">
    {@html renderContent(data.post.content)}
  </div>
</article>
```

## Common Patterns

### Blog List

```typescript
// +page.server.ts
import { getCollectionItems } from '$lib/sailor/utils';

export async function load() {
  const posts = await getCollectionItems('posts');
  return { posts }; // posts.items contains typed array with .url property
}
```

### Blog with Pagination

```typescript
// +page.server.ts
import { getCollection } from '$lib/sailor/utils';

export async function load({ url }) {
  const page = Number(url.searchParams.get('page')) || 1;

  const posts = await getCollection('posts', {
    limit: 10,
    currentPage: page,
    baseUrl: '/blog'
  });

  return { posts };
}
```

### Navigation Menu

```typescript
// +layout.server.ts
import { getGlobalItems, getSiteSettings } from '$lib/sailor/utils';

export async function load() {
  const navigation = await getGlobalItems('menus');
  const config = await getSiteSettings();

  return { navigation, config };
}
```

### Single Post Page

```typescript
// +page.server.ts
import { getCollectionItem, getSiteSettings } from '$lib/sailor/utils';

export async function load({ params }) {
  const post = await getCollectionItem('posts', {
    query: 'slug',
    value: params.slug
  });

  const config = await getSiteSettings();

  const seo = extractSEO(post, {
    siteName: config.siteName,
    baseUrl: 'https://yoursite.com',
    basePath: '/articles/'
  });

  return { post, seo };
}
```

## Error Handling

All functions return safe defaults on errors:

```typescript
// Safe defaults - no try/catch needed
const posts = await getCollectionItems('nonexistent'); // { items: [] }
const post = await getCollectionItem('posts', { query: 'slug', value: 'missing' }); // null
const menus = await getGlobalItems('missing'); // { items: [] }
const menu = await getGlobalItem('menus', { query: 'slug', value: 'missing' }); // null
const posts = await getCollection('nonexistent'); // { items: [], total: 0 }
const settings = await getGlobal('missing'); // null
```

## Options Reference

### Collection Options

- `slug`: `string` - Get specific item by slug
- `status`: `'published' | 'draft' | 'all'` (default: `'published'`)
- `includeBlocks`: `boolean` (default: `true`)
- `limit`: `number`
- `currentPage`: `number` - For pagination
- `baseUrl`: `string` - For pagination URLs
- `orderBy`: `string` (default: `'created_at'`)
- `order`: `'asc' | 'desc'` (default: `'desc'`)
- `groupBy`: `string` - Group results by field

### Global Options

- `withTags`: `boolean` - Load tags
- `groupBy`: `string` - Group items by field
- `orderBy`: `string` (default: `'sort'`)
- `order`: `'asc' | 'desc'` (default: `'asc'`)

### Image Options

**Basic Transform Options:**

- `width`: `number` - Desired width in pixels
- `height`: `number` - Desired height in pixels
- `quality`: `number` - Image quality (1-100, default: 85)
- `format`: `'jpg' | 'png' | 'webp'` - Output format
- `resize`: `'cover' | 'contain' | 'fill' | 'inside' | 'outside'` - How to fit image in dimensions (default: 'cover')

**HTML Generation Options:**

- `html`: `true` - Return complete HTML `<img>` tag instead of URL/object
- `alt`: `string` - Alt text for the image
- `fallback`: `string` - Fallback image URL when main image is missing
- `class`: `string` - CSS class name(s) to add to the image

**Responsive Image Options (always enabled):**

- `widths`: `number[]` - Array of widths for srcset (uses CMS defaults: [375, 768, 1200, 1600])
- `aspectRatio`: `number` - Aspect ratio for calculating heights (e.g., 16/9, 4/3)
- `sizes`: `string` - HTML sizes attribute (auto-generated if not provided)

**Customizing Defaults:**

- Use `setDefaultBreakpoints([375, 768, 1024])` to override CMS defaults
- Use `getDefaultBreakpoints()` to get current defaults

### Content Options

- **`renderContent(content)`** - `content: any` - TipTap JSON or HTML string
- **`getExcerpt(content, length?, suffix?)`** - `content: any`, `length: number` (default: 160), `suffix: string` (default: '...')

### Server-side File Options

**`getImagesByTags(tags, options?)`** - Get images by tags with pagination

- `tags`: `string[]` - Array of tag names to filter by
- `options.limit`: `number` (default: 50) - Number of images to return
- `options.offset`: `number` (default: 0) - Number of images to skip
- `options.matchAll`: `boolean` (default: false) - Match ALL tags (true) or ANY tag (false)

**Returns:** `{ images: ImageWithTags[], total: number, hasMore: boolean }`

## Query Patterns

The utilities use consistent query patterns across collections and globals:

### Collections

```typescript
// Multiple items
await getCollectionItems('posts'); // All items
await getCollectionItems('pages', { query: 'children', value: 'parent-id' }); // Children
await getCollectionItems('posts', { query: 'siblings', value: 'post-id' }); // Siblings

// Single items
await getCollectionItem('posts', { query: 'slug', value: 'my-post' });
await getCollectionItem('posts', { query: 'id', value: 'some-uuid' });
```

### Globals

```typescript
// Multiple items
await getGlobalItems('menus'); // All items
await getGlobalItems('faq', { query: 'slug', value: 'category-slug' }); // Filtered

// Single items
await getGlobalItem('menus', { query: 'slug', value: 'main' });
await getGlobalItem('menus', { query: 'id', value: 'some-uuid' });
```

These utilities provide clean, predictable APIs with excellent TypeScript support and consistent return types.
