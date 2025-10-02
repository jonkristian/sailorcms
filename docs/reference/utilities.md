---
layout: default
title: Utilities
parent: API Reference
nav_order: 1
---

# Utilities

Simple helper functions for loading content in your SvelteKit app.

## Collections

The `getCollections()` function is your one-stop solution for all collection queries. It intelligently returns either a single item or multiple items based on the options you provide.

```typescript
import { getCollections } from '$sailor/utils';
import type { Post, Page } from '$sailor/generated/types';

// Multiple items - returns { items, total, hasMore, pagination?, grouped? }
const posts = await getCollections<Post>('posts');

// Single item by slug - returns Item | null
const post = await getCollections<Post>('posts', {
  itemSlug: 'my-post'
});

// Single item by ID - returns Item | null
const post = await getCollections<Post>('posts', {
  itemId: 'some-uuid'
});

// Get children of a parent
const subpages = await getCollections<Page>('pages', {
  parentId: 'parent-page-id'
});

// Get siblings of an item
const relatedPosts = await getCollections<Post>('posts', {
  siblingOf: 'current-post-id',
  excludeCurrent: true
});

// Items automatically include hierarchical URL property
const pages = await getCollections<Page>('pages');
pages.items.forEach((page) => {
  console.log(page.url); // "/parent-page/child-page" (hierarchical)
  console.log(page.title); // "Child Page Title"
  console.log(page.slug); // "child-page"
});

// Optional: include breadcrumb navigation
const pagesWithBreadcrumbs = await getCollections<Page>('pages', {
  includeBreadcrumbs: true
});
pagesWithBreadcrumbs.items.forEach((page) => {
  console.log(page.url); // "/parent-page/child-page"
  console.log(page.breadcrumbs); // [{ title: "Parent Page", url: "/parent-page", slug: "parent-page" }]
});

// Pagination support
const paginatedPosts = await getCollections<Post>('posts', {
  limit: 10,
  currentPage: 2,
  baseUrl: '/blog'
});
console.log(paginatedPosts.items); // Array of posts
console.log(paginatedPosts.total); // Total count
console.log(paginatedPosts.hasMore); // Has more pages?
console.log(paginatedPosts.pagination); // Full pagination info

// Filter by status
const drafts = await getCollections<Post>('posts', {
  status: 'draft' // 'published', 'draft', or 'all'
});

// Filter by related content
const techPosts = await getCollections<Post>('posts', {
  whereRelated: {
    field: 'categories',
    value: 'technology'
  }
});

// Complex queries with filtering, ordering, grouping
const posts = await getCollections<Post>('posts', {
  limit: 10,
  currentPage: 2,
  baseUrl: '/blog',
  status: 'published',
  includeBlocks: false,
  groupBy: 'tags',
  orderBy: 'created_at',
  order: 'desc',
  whereRelated: { field: 'categories', value: 'tech' }
});
```

### Collection Options

| Option               | Type                              | Description                                                |
| -------------------- | --------------------------------- | ---------------------------------------------------------- |
| `itemSlug`           | `string`                          | Get specific item by slug (returns single item)            |
| `itemId`             | `string`                          | Get specific item by ID (returns single item)              |
| `parentId`           | `string`                          | Get children of this parent                                |
| `siblingOf`          | `string`                          | Get siblings of this item                                  |
| `excludeCurrent`     | `boolean`                         | Exclude current item from siblings query (default: `true`) |
| `status`             | `'published' \| 'draft' \| 'all'` | Filter by status (default: `'published'`)                  |
| `includeBlocks`      | `boolean`                         | Load blocks for items (default: `true`)                    |
| `includeBreadcrumbs` | `boolean`                         | Generate breadcrumb navigation (default: `false`)          |
| `includeAuthors`     | `boolean`                         | Populate author details (default: `false`)                 |
| `orderBy`            | `string`                          | Field to order by (default: `'created_at'`)                |
| `order`              | `'asc' \| 'desc'`                 | Sort order (default: `'desc'`)                             |
| `groupBy`            | `string`                          | Group results by field                                     |
| `limit`              | `number`                          | Limit number of results                                    |
| `offset`             | `number`                          | Offset for pagination                                      |
| `baseUrl`            | `string`                          | Base URL for pagination links                              |
| `currentPage`        | `number`                          | Current page for pagination                                |
| `whereRelated`       | `object`                          | Filter by related content: `{ field, value, recursive? }`  |
| `user`               | `User \| null`                    | User context for ACL filtering                             |

### Return Types

**Single Item Query** (when `itemSlug` or `itemId` is provided):

```typescript
type CollectionsSingleResult<T> =
  | (T & {
      url: string;
      breadcrumbs?: BreadcrumbItem[];
      blocks?: BlockWithRelations[];
    })
  | null;
```

**Multiple Items Query** (default):

```typescript
type CollectionsMultipleResult<T> = {
  items: (T & {
    url: string;
    breadcrumbs?: BreadcrumbItem[];
    blocks?: BlockWithRelations[];
  })[];
  total: number;
  hasMore: boolean;
  pagination?: Pagination;
  grouped?: Record<string, T[]>;
};
```

## Globals

The `getGlobals()` function handles all global queries with the same intelligent single/multiple return pattern.

```typescript
import { getGlobals } from '$sailor/utils';
import type { Menu, Category } from '$sailor/generated/types';

// Multiple items from repeatable globals
const menus = await getGlobals<Menu>('menus');
console.log(menus.items); // Array of menu items
console.log(menus.total); // Total count

// Single item by slug
const mainMenu = await getGlobals<Menu>('menus', {
  itemSlug: 'main'
});

// Single item by ID
const menuById = await getGlobals<Menu>('menus', {
  itemId: 'some-uuid'
});

// Filter by parent (for nested/hierarchical globals)
const topCategories = await getGlobals<Category>('categories', {
  parentId: null // or specific parent ID
});

// Get siblings of an item
const relatedCategories = await getGlobals<Category>('categories', {
  siblingOf: 'current-category-id'
});

// Complex queries with grouping, tags, ordering
const faqsByTags = await getGlobals('faq', {
  withTags: true,
  groupBy: 'tags',
  orderBy: 'title',
  order: 'asc',
  limit: 50
});

// Filter by related content
const techCategories = await getGlobals<Category>('categories', {
  whereRelated: { field: 'parent', value: 'technology' }
});
```

### Global Options

| Option                | Type              | Description                                                |
| --------------------- | ----------------- | ---------------------------------------------------------- |
| `itemSlug`            | `string`          | Get specific item by slug (returns single item)            |
| `itemId`              | `string`          | Get specific item by ID (returns single item)              |
| `parentId`            | `string`          | Get children of this parent                                |
| `siblingOf`           | `string`          | Get siblings of this item                                  |
| `excludeCurrent`      | `boolean`         | Exclude current item from siblings query (default: `true`) |
| `withRelations`       | `boolean`         | Include relations for items (default: `true`)              |
| `withTags`            | `boolean`         | Include tags for items (default: `false`)                  |
| `loadFullFileObjects` | `boolean`         | Load full file objects vs just IDs (default: `false`)      |
| `groupBy`             | `string`          | Group results by field                                     |
| `orderBy`             | `string`          | Field to order by (default: `'sort'`)                      |
| `order`               | `'asc' \| 'desc'` | Sort order (default: `'asc'`)                              |
| `limit`               | `number`          | Limit number of results                                    |
| `offset`              | `number`          | Offset for pagination                                      |
| `whereRelated`        | `object`          | Filter by related content: `{ field, value }`              |
| `user`                | `User \| null`    | User context for ACL filtering                             |

### Return Types

**Single Item Query** (when `itemSlug` or `itemId` is provided):

```typescript
type GlobalsSingleResult<T> = T | null;
```

**Multiple Items Query** (default):

```typescript
type GlobalsMultipleResult<T> = {
  items: T[];
  total: number;
  hasMore?: boolean;
  grouped?: Record<string, T[]>;
};
```

## Files & Images

### Client-side (Browser Components)

```typescript
import { getFile, getImage } from '$sailor/utils/files';

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
import { setDefaultBreakpoints } from '$sailor/utils/files';
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
import { getFile, getImage, getImagesByTags } from '$sailor/utils/files/server';

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
import { renderContent, getExcerpt } from '$sailor/utils/content';

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
import { getSiteSettings } from '$sailor/utils';

// Site-specific settings (contact email, social media, etc.)
const config = await getSiteSettings();
```

## SEO

```typescript
import { extractSEO, generateMetaTags } from '$sailor/utils/seo';

// Get post with SEO fields (automatically included with seo: true)
const post = await getCollections('posts', { itemSlug: 'my-post' });

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
{#each posts.items as post}
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
  // const page = await getCollections('pages', { itemSlug: 'home' });

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
  import { renderContent, getExcerpt } from '$sailor/utils/content';

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
import { getCollections } from '$sailor/utils';
import type { Post } from '$sailor/generated/types';

export async function load() {
  const posts = await getCollections<Post>('posts');
  return { posts }; // posts.items contains typed array with .url property
}
```

### Blog with Pagination

```typescript
// +page.server.ts
import { getCollections } from '$sailor/utils';
import type { Post } from '$sailor/generated/types';

export async function load({ url }) {
  const page = Number(url.searchParams.get('page')) || 1;

  const posts = await getCollections<Post>('posts', {
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
import { getGlobals, getSiteSettings } from '$sailor/utils';
import type { Menu } from '$sailor/generated/types';

export async function load() {
  const navigation = await getGlobals<Menu>('menus');
  const config = await getSiteSettings();

  return { navigation, config };
}
```

### Single Post Page

```typescript
// +page.server.ts
import { getCollections, getSiteSettings } from '$sailor/utils';
import { extractSEO } from '$sailor/utils/seo';
import type { Post } from '$sailor/generated/types';

export async function load({ params }) {
  const post = await getCollections<Post>('posts', {
    itemSlug: params.slug
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
const posts = await getCollections('nonexistent'); // { items: [], total: 0, hasMore: false }
const post = await getCollections('posts', { itemSlug: 'missing' }); // null
const menus = await getGlobals('missing'); // { items: [], total: 0 }
const menu = await getGlobals('menus', { itemSlug: 'missing' }); // null
```

## Image Options

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

## UI Utilities

```typescript
import {
  buildNavigationTree,
  generateBreadcrumbs,
  createPagination,
  formatDate,
  timeAgo,
  sortByDate
} from '$sailor/utils/ui';

// Build hierarchical navigation tree from flat items
const tree = buildNavigationTree(pages.items);

// Generate breadcrumb trail
const breadcrumbs = generateBreadcrumbs(page);

// Create pagination object
const pagination = createPagination({
  total: 100,
  pageSize: 10,
  currentPage: 3,
  baseUrl: '/blog'
});

// Format dates
const formatted = formatDate(post.created_at); // "Jan 15, 2024"
const relative = timeAgo(post.created_at); // "2 days ago"

// Sort items by date
const sorted = sortByDate(items, 'created_at', 'desc');
```

## Type Safety

All utilities provide full TypeScript support with generics:

```typescript
import type { Post, Page, Menu, Category } from '$sailor/generated/types';

// Fully typed collection results
const posts = await getCollections<Post>('posts');
posts.items[0].title; // ✓ Typed as string
posts.items[0].content; // ✓ Typed correctly

// Fully typed single items
const post = await getCollections<Post>('posts', { itemSlug: 'my-post' });
if (post) {
  post.title; // ✓ Typed as string
  post.url; // ✓ Auto-generated URL property
}

// Fully typed globals
const menus = await getGlobals<Menu>('menus');
menus.items[0].name; // ✓ Typed correctly
```

These utilities provide clean, predictable APIs with excellent TypeScript support and consistent return types following SOLID principles.
