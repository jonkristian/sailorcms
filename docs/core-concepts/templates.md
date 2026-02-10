---
layout: default
title: Templates
parent: Core Concepts
nav_order: 1
---

# Templates Guide

## What are Templates?

Templates in Sailor are TypeScript definitions that describe your content structure. Think of them as blueprints that tell the CMS:

- **What content types** you want to manage (posts, pages, products, etc.)
- **What fields** each content type should have (title, content, images, etc.)
- **How the content should behave** (SEO options, blocks support, URL structure)

## How Templates Work

1. **Define**: Write TypeScript templates describing your content structure
2. **Generate**: Sailor automatically creates database tables, admin forms, and TypeScript types
3. **Use**: Start creating and managing content through the admin interface
4. **Display**: Use the generated utilities to fetch and display content in your frontend

## Benefits

- **No Database Setup**: Sailor handles all the drizzle database schema generation
- **Type Safety**: Full TypeScript support with auto-generated types
- **Admin UI**: Beautiful, responsive admin interface automatically generated
- **Flexible**: Easy to modify and extend as your needs change
- **Consistent**: Standardized approach across all your content types

## Template Types

Sailor supports three main template types:

- **Collections**: Content with multiple entries (blog posts, pages, products)
- **Blocks**: Reusable content components (hero sections, galleries, features)
- **Globals**: Site-wide content (settings, menus, configuration)

---

## Common Template Structure

All templates share these core elements:

```typescript
export const myTemplate = {
  name: { singular: 'Item', plural: 'Items' },
  slug: 'items',
  description: 'Description of this content type',
  icon: 'FileText', // Optional: sidebar icon
  options: {
    // Template-specific options
  },
  fields: {
    // Your custom fields
  }
};
```

### Available Icons

Collections and globals automatically appear in the admin sidebar with these icons:
`FileText`, `Layout`, `FolderTree`, `HelpCircle`, `Menu`, `Settings`, `Image`, `Users`, `Calendar`, `Tag`, `Database`, `Globe`, `ShoppingCart`, `BarChart`

### Core Fields

**Collections & Repeatable Globals** automatically include:

- `id` - UUID primary key
- `title` - Display name (required)
- `slug` - URL-friendly identifier (required, unique)
- `status` - Published/draft status (enum: 'draft' | 'published' | 'private' | 'archived')
- `author` - Content creator (user ID, auto-populated, hidden by default)
- `sort` - Manual ordering for drag-and-drop
- `parent_id` - Parent item for hierarchical relationships (hidden by default)
- `created_at` / `updated_at` - Timestamps
- `last_modified_by` - User who last modified the item (hidden by default)

**Flat Globals** (`dataType: 'flat'`) only include:

- `id` - UUID primary key
- `created_at` / `updated_at` - Timestamps

**Blocks** include:

- `title` - Optional display name
- `sort` - Manual ordering (required)

## Collections

Content types with multiple entries (posts, pages, products).

### Basic Collection

```typescript
// src/lib/sailor/templates/collections/posts.ts
import type { CollectionDefinition } from '$sailor/core/types';

export const postsCollection: CollectionDefinition = {
  name: { singular: 'Post', plural: 'Posts' },
  slug: 'posts',
  description: 'Blog posts with rich content',
  icon: 'FileText',
  options: {
    titleField: 'title',
    seo: true,
    blocks: true,
    basePath: '/blog/',
    sortable: true
  },
  fields: {
    excerpt: {
      type: 'textarea',
      label: 'Excerpt',
      description: 'Short summary of the post'
    },
    content: {
      type: 'richText',
      label: 'Content'
    },
    featured_image: {
      type: 'file',
      label: 'Featured Image',
      items: { fileType: 'image' }
    },
    tags: {
      type: 'tags',
      label: 'Tags'
    }
  }
};
```

### Collection Options

| Option       | Type      | Description                                                                                                |
| ------------ | --------- | ---------------------------------------------------------------------------------------------------------- |
| `titleField` | `string`  | Field to display in admin lists and overviews                                                              |
| `seo`        | `boolean` | Adds SEO fields (meta_title, meta_description, og_title, og_description, og_image, canonical_url, noindex) |
| `blocks`     | `boolean` | Enable/disable blocks functionality (default: `true`)                                                      |
| `basePath`   | `string`  | Base URL path for preview links and SEO canonical URLs                                                     |
| `sortable`   | `boolean` | Enable drag-and-drop sorting on the collection table                                                       |
| `nestable`   | `boolean` | Enable parent-child hierarchical relationships                                                             |

### Registration

Register in `src/lib/sailor/templates/collections/index.ts`:

```typescript
export { postsCollection as posts } from './posts';
export { productsCollection as products } from './products';
```

## Blocks

Reusable content components for flexible layouts.

### Basic Block

```typescript
// src/lib/sailor/templates/blocks/hero.ts
export const heroBlock = {
  name: 'Hero Section',
  slug: 'hero',
  description: 'Large banner with title and background image',
  options: {
    titleField: 'title' // Field to display as title in block view
  },
  fields: {
    title: {
      type: 'string',
      required: true,
      label: 'Title'
    },
    subtitle: {
      type: 'string',
      label: 'Subtitle'
    },
    background_image: {
      type: 'file',
      label: 'Background Image',
      items: { fileType: 'image' }
    },
    cta_buttons: {
      type: 'array',
      label: 'CTA Buttons',
      items: {
        type: 'object',
        label: 'Button',
        properties: {
          text: { type: 'string', label: 'Button Text' },
          url: { type: 'string', label: 'Button URL' },
          style: {
            type: 'select',
            label: 'Button Style',
            options: [
              { label: 'Primary', value: 'primary' },
              { label: 'Secondary', value: 'secondary' }
            ]
          }
        }
      }
    }
  }
};
```

### Block Scoping

Limit which block types are available for specific collections:

```typescript
fields: {
  layout: {
    type: 'blocks',
    label: 'Page Layout',
    blocks: ['hero', 'richText', 'gallery'] // Only these block types allowed
  }
}
```

### Registration

Register in `src/lib/sailor/templates/blocks/index.ts`:

```typescript
export { heroBlock as hero } from './hero';
export { galleryBlock as gallery } from './gallery';
```

## Globals

Site-wide settings and repeatable content.

### Flat Global (Single Entry)

```typescript
// src/lib/sailor/templates/globals/settings.ts
import type { GlobalDefinition } from '$sailor/core/types';

export const settingsGlobal: GlobalDefinition = {
  name: { singular: 'Settings', plural: 'Settings' },
  slug: 'settings',
  description: 'Global site configuration',
  icon: 'Settings',
  dataType: 'flat', // Single entry, no title/slug/status fields
  options: {
    titleField: 'site_name'
  },
  fields: {
    site_name: {
      type: 'string',
      required: true,
      label: 'Site Name'
    },
    tagline: {
      type: 'string',
      label: 'Tagline'
    },
    logo: {
      type: 'file',
      label: 'Site Logo',
      items: { fileType: 'image' }
    }
  }
};
```

### Repeatable Global (Multiple Entries)

```typescript
// src/lib/sailor/templates/globals/menus.ts
export const menusGlobal: GlobalDefinition = {
  name: { singular: 'Menu', plural: 'Menus' },
  slug: 'menus',
  description: 'Navigation menus',
  icon: 'Menu',
  dataType: 'repeatable', // Multiple entries with title/slug/status fields
  options: {
    sortable: true // Enable sorting for menu items
  },
  fields: {
    name: { type: 'string', required: true, label: 'Menu Name' },
    items: {
      type: 'array',
      label: 'Menu Items',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string', label: 'Link Text' },
          url: { type: 'string', label: 'URL' }
        }
      }
    }
  }
};
```

### Registration

Register in `src/lib/sailor/templates/globals/index.ts`:

```typescript
export { settingsGlobal as settings } from './settings';
export { menusGlobal as menus } from './menus';
```

## Common Field Types

### Basic Fields

```typescript
fields: {
  // Text
  title: { type: 'string', required: true, label: 'Title' },
  description: { type: 'textarea', label: 'Description' },
  content: { type: 'richText', label: 'Content' },

  // Media
  image: { type: 'file', label: 'Image', items: { fileType: 'image' } },
  gallery: { type: 'file', label: 'Gallery', items: { fileType: 'image', multiple: true } },

  // Selection
  category: { type: 'select', label: 'Category', options: ['News', 'Tutorial', 'Review'] },
  tags: { type: 'tags', label: 'Tags' },

  // Relationships
  author: { type: 'relation', label: 'Author', relation: { type: 'manyToOne', targetCollection: 'users' } },

  // Layout
  layout: { type: 'blocks', label: 'Page Layout' }
}
```

### Field Options

Most fields support these common options:

- `required: boolean` - Make field mandatory
- `label: string` - Display label in admin
- `description: string` - Help text below field
- `hidden: boolean` - Hide field from admin interface
- `default: any` - Default value for new entries

## Settings Configuration

Customize CMS behavior in `templates/settings.ts`:

```typescript
// src/lib/sailor/templates/settings.ts
import type { CMSSettings } from '$sailor/core/settings/types';

export const settings: Partial<CMSSettings> = {
  storage: {
    images: {
      formats: ['webp', 'jpg', 'png'],
      maxFileSize: '10.0MB',
      maxWidth: 2560,
      maxHeight: 2560,
      defaultQuality: 85
    },
    upload: {
      maxFileSize: '10.0MB',
      allowedTypes: ['*/*'],
      folderStructure: 'flat'
    }
  },
  system: {
    debugMode: false
  }
};
```

## Examples

### E-commerce Product

```typescript
export const productsCollection: CollectionDefinition = {
  name: { singular: 'Product', plural: 'Products' },
  slug: 'products',
  description: 'E-commerce products',
  icon: 'ShoppingCart',
  options: {
    titleField: 'name',
    seo: true,
    blocks: false,
    basePath: '/shop/',
    sortable: true
  },
  fields: {
    name: { type: 'string', required: true, label: 'Product Name' },
    price: { type: 'number', required: true, label: 'Price' },
    description: { type: 'wysiwyg', label: 'Description' },
    images: {
      type: 'file',
      label: 'Product Images',
      items: { fileType: 'image', multiple: true }
    },
    category: { type: 'select', label: 'Category', options: ['Electronics', 'Clothing', 'Books'] }
  }
};
```

### Simple Blog Post

```typescript
export const postsCollection: CollectionDefinition = {
  name: { singular: 'Post', plural: 'Posts' },
  slug: 'posts',
  description: 'Blog posts',
  icon: 'FileText',
  options: {
    titleField: 'title',
    seo: true,
    blocks: true,
    basePath: '/blog/',
    sortable: false
  },
  fields: {
    excerpt: { type: 'textarea', label: 'Excerpt' },
    content: { type: 'richText', label: 'Content' },
    featured_image: { type: 'file', label: 'Featured Image', items: { fileType: 'image' } },
    tags: { type: 'tags', label: 'Tags' }
  }
};
```

> **Note**: Many settings like storage provider, S3 credentials, and database URL are configured via environment variables. See `environment-variables.md` for details.
