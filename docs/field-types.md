# Field Types Reference

Complete reference for all field types available in Sailor CMS templates.

## Text Fields

### String

Single-line text input.

```typescript
{
  type: 'string',
  label: 'Title',
  required: true,
  placeholder: 'Enter title...'
}
```

### Text

Multi-line plain text.

```typescript
{
  type: 'text',
  label: 'Description',
  description: 'Plain text description'
}
```

### Textarea

Multi-line text with basic formatting.

```typescript
{
  type: 'textarea',
  label: 'Excerpt',
  placeholder: 'Brief summary...'
}
```

### Rich Text

WYSIWYG editor with HTML output.

```typescript
{
  type: 'wysiwyg',
  label: 'Content',
  description: 'Full content with formatting'
}
```

## Value Fields

### Number

Numeric input with optional constraints.

```typescript
{
  type: 'number',
  label: 'Price',
  min: 0,
  max: 10000,
  step: 0.01
}
```

### Boolean

Checkbox for true/false values.

```typescript
{
  type: 'boolean',
  label: 'Featured',
  default: false
}
```

### Date

Date picker.

```typescript
{
  type: 'date',
  label: 'Published At',
  default: 'now' // or specific date
}
```

### Select

Dropdown with predefined options.

```typescript
{
  type: 'select',
  label: 'Status',
  options: [
    { label: 'Draft', value: 'draft' },
    { label: 'Published', value: 'published' },
    { label: 'Archived', value: 'archived' }
  ],
  default: 'draft'
}
```

## File Fields

### File Upload

File upload with type restrictions.

```typescript
{
  type: 'file',
  label: 'Featured Image',
  file: {
    fileType: 'image', // 'image', 'document', 'any'
    multiple: false,   // Allow multiple files
    maxSize: '10MB'    // Size limit
  }
}
```

**File Type Options:**

- `image` - Images only (jpg, png, gif, webp, svg)
- `document` - Documents (pdf, doc, docx, txt)
- `any` - All file types

**Multiple Files:**

```typescript
{
  type: 'file',
  label: 'Gallery Images',
  file: {
    fileType: 'image',
    multiple: true
  }
}
```

**File Objects** (returned in frontend):

```javascript
{
  id: "file-uuid",
  url: "https://bucket.s3.amazonaws.com/image.jpg",
  alt: "Alt text",
  filename: "image.jpg",
  original_name: "My Image.jpg",
  size: 1024768,
  mime_type: "image/jpeg"
}
```

## Content Fields

### Tags

Tag management with autocomplete.

```typescript
{
  type: 'tags',
  label: 'Tags',
  description: 'Add tags to categorize content'
}
```

### Blocks

Flexible content blocks (for collections).

```typescript
{
  type: 'blocks',
  label: 'Page Layout',
  blocks: ['hero', 'richText', 'gallery', 'services'], // Available block types
  description: 'Drag and drop content blocks'
}
```

### Relation

Link to other collections or globals.

```typescript
{
  type: 'relation',
  label: 'Categories',
  description: 'Select categories for this post',
  relation: {
    type: 'many-to-many',      // 'one-to-one', 'one-to-many', 'many-to-many'
    targetGlobal: 'categories', // Target collection/global
    through: 'post_categories'  // Junction table (for many-to-many)
  }
}
```

## Structured Fields

### Array

Repeatable content with nested structure.

```typescript
{
  type: 'array',
  label: 'Team Members',
  items: {
    type: 'object',
    label: 'Team Member',
    properties: {
      name: {
        type: 'string',
        required: true,
        label: 'Full Name'
      },
      role: {
        type: 'string',
        label: 'Job Title'
      },
      bio: {
        type: 'textarea',
        label: 'Biography'
      },
      photo: {
        type: 'file',
        label: 'Profile Photo',
        file: { fileType: 'image' }
      }
    }
  }
}
```

**Simple Array (strings):**

```typescript
{
  type: 'array',
  label: 'Skills',
  items: {
    type: 'string',
    label: 'Skill'
  }
}
```

### Object

Nested object with defined properties.

```typescript
{
  type: 'object',
  label: 'SEO Settings',
  properties: {
    meta_title: {
      type: 'string',
      label: 'Meta Title',
      maxLength: 60
    },
    meta_description: {
      type: 'textarea',
      label: 'Meta Description',
      maxLength: 160
    },
    og_image: {
      type: 'file',
      label: 'Social Share Image',
      file: { fileType: 'image' }
    }
  }
}
```

## Field Options

### Common Properties

All fields support these options:

```typescript
{
  type: 'string',
  label: 'Field Label',           // Display label in admin
  description: 'Help text',       // Help text below field
  required: true,                 // Make field required
  default: 'default value',       // Default value
  hidden: false,                  // Hide from admin interface
  readonly: false,                // Make field read-only
  showInTable: true,              // Show field in table overview
  position: 'main',               // 'main' or 'sidebar' layout position
  placeholder: 'Enter value...'   // Placeholder text
}
```

### Validation Options

```typescript
{
  type: 'string',
  label: 'Username',
  required: true,
  minLength: 3,
  maxLength: 20,
  pattern: '^[a-zA-Z0-9_]+$' // Regex pattern
}
```

### Text Field Options

```typescript
{
  type: 'textarea',
  label: 'Description',
  minLength: 10,
  maxLength: 500,
  rows: 4 // Textarea height
}
```

### Number Field Options

```typescript
{
  type: 'number',
  label: 'Price',
  min: 0,
  max: 99999,
  step: 0.01,
  format: 'currency' // Display formatting
}
```

### Select Field Options

```typescript
{
  type: 'select',
  label: 'Status',
  options: [
    { label: 'Draft', value: 'draft' },
    { label: 'Published', value: 'published' },
    { label: 'Archived', value: 'archived' }
  ],
  default: 'draft',
  required: true
}
```

## Core Fields

Automatically added to collections and repeatable globals:

### All Collections & Repeatable Globals

- `id` - UUID primary key
- `title` - Display title (required)
- `slug` - URL-friendly identifier (required)
- `status` - Published/draft status (enum: 'draft' | 'published' | 'private' | 'archived')
- `author` - Content creator (user ID, auto-populated, hidden by default)
- `sort` - Manual ordering for drag-and-drop
- `parent_id` - Parent item for hierarchical relationships (hidden by default)
- `created_at` / `updated_at` - Timestamps
- `last_modified_by` - User who last modified the item (hidden by default)

### Flat Globals (`dataType: 'flat'`)

- `id` - UUID primary key
- `created_at` / `updated_at` - Timestamps
- **No other core fields** - Flat globals are singletons and don't need title, slug, status, etc.

### Override Core Fields

Customize core field behavior:

```typescript
fields: {
  title: {
    label: 'Product Name',
    description: 'This will be shown in the catalog'
  },
  slug: {
    description: 'URL path for this product'
  },
  author: {
    type: 'relation',
    label: 'Author',
    relation: {
      type: 'many-to-one',
      targetCollection: 'users'
    },
    description: 'Who created this content',
    hidden: false // Make visible in admin
  },
  sort: {
    hidden: true // Hide sorting from admin
  }
}
```

### SEO Fields

When `seo: true` is set in collection options, these fields are automatically added:

```typescript
export const postsCollection = {
  options: {
    seo: true // Automatically adds all SEO fields below
  }
};
```

**Auto-added SEO fields:**

- `meta_title` - Custom title for search engines (fallback to title)
- `meta_description` - Description for search results (150-160 chars recommended)
- `og_title` - Title for social media sharing (fallback to meta_title)
- `og_description` - Description for social media (fallback to meta_description)
- `og_image` - Image for social media sharing (1200x630px recommended)
- `canonical_url` - Override canonical URL for this page
- `noindex` - Prevent search engines from indexing this page

All SEO fields are positioned in the sidebar and are optional.

## Usage Examples

### Blog Post Collection

```typescript
export const postsCollection = {
  name: { singular: 'Post', plural: 'Posts' },
  slug: 'posts',
  options: {
    seo: true // Auto-adds meta_title, meta_description, og_* fields
  },
  fields: {
    excerpt: {
      type: 'textarea',
      label: 'Excerpt',
      maxLength: 300
    },
    content: {
      type: 'wysiwyg',
      label: 'Content'
    },
    featured_image: {
      type: 'file',
      label: 'Featured Image',
      file: { fileType: 'image' }
    },
    category: {
      type: 'relation',
      label: 'Category',
      relation: {
        type: 'many-to-one',
        targetGlobal: 'categories'
      }
    },
    tags: {
      type: 'tags',
      label: 'Tags'
    }
    // SEO fields (meta_title, meta_description, og_title, etc.)
    // are automatically added because seo: true is set in options
  }
};
```

### Product Collection

```typescript
export const productsCollection = {
  name: { singular: 'Product', plural: 'Products' },
  slug: 'products',
  fields: {
    price: {
      type: 'number',
      label: 'Price',
      required: true,
      min: 0,
      step: 0.01
    },
    on_sale: {
      type: 'boolean',
      label: 'On Sale'
    },
    sale_price: {
      type: 'number',
      label: 'Sale Price',
      min: 0,
      step: 0.01
    },
    images: {
      type: 'file',
      label: 'Product Images',
      file: {
        fileType: 'image',
        multiple: true
      }
    },
    variants: {
      type: 'array',
      label: 'Product Variants',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', label: 'Variant Name' },
          sku: { type: 'string', label: 'SKU' },
          price: { type: 'number', label: 'Price' }
        }
      }
    }
  }
};
```

## Field Layout Examples

### Contact Submission Form (Read-only fields)

```typescript
fields: {
  name: {
    type: 'string',
    label: 'Name',
    readonly: true,
    showInTable: true,
    position: 'main'
  },
  email: {
    type: 'string',
    label: 'Email',
    readonly: true,
    showInTable: true,
    position: 'main'
  },
  message: {
    type: 'textarea',
    label: 'Message',
    readonly: true,
    position: 'main'
  },
  submitted_at: {
    type: 'date',
    label: 'Submitted',
    readonly: true,
    position: 'sidebar'
  }
}
```

### Content with Sidebar Fields

```typescript
fields: {
  content: {
    type: 'wysiwyg',
    label: 'Content',
    position: 'main'
  },
  excerpt: {
    type: 'textarea',
    label: 'Excerpt',
    position: 'main'
  },
  status: {
    type: 'select',
    label: 'Status',
    position: 'sidebar',
    showInTable: true
  },
  sort: {
    type: 'number',
    label: 'Sort Order',
    hidden: true  // Hide from admin completely
  }
}
```

## Best Practices

1. **Use descriptive labels** - Help content editors understand fields
2. **Add validation** - Use `required`, `minLength`, `maxLength` appropriately
3. **Set file types** - Restrict file uploads with `fileType`
4. **Provide defaults** - Set sensible default values
5. **Group related fields** - Use objects for related settings
6. **Hide system fields** - Use `hidden: true` for fields like `sort`
7. **Use readonly for logs** - Make submission data `readonly: true`
8. **Show key fields in tables** - Use `showInTable: true` for important fields
9. **Organize with position** - Use `position: 'sidebar'` for metadata fields
10. **Add descriptions** - Explain complex fields with `description`
