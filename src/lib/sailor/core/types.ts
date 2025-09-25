// Core type definitions for Sailor CMS
// This file contains all shared type definitions used across collections, blocks, and globals

// Polymorphic user reference type - can be ID string or populated user object
export type UserReference =
  | string
  | {
      id: string;
      name: string | null;
      email: string | null;
    };

export type FieldType =
  | 'string'
  | 'text'
  | 'textarea'
  | 'wysiwyg'
  | 'number'
  | 'boolean'
  | 'date'
  | 'email'
  | 'link'
  | 'select'
  | 'relation'
  | 'array'
  | 'object'
  | 'file'
  | 'tags';

/**
 * Standard pagination interface used across the CMS
 */
export interface Pagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export type RelationType = 'one-to-one' | 'one-to-many' | 'many-to-many';

export interface FieldDefinition {
  type?: FieldType;
  title?: string;
  label?: string; // Field label displayed in the UI
  description?: string;
  required?: boolean;
  unique?: boolean;
  default?: any;
  core?: boolean; // Indicates this is a core field
  // For overriding properties of core fields
  override?: Partial<Omit<FieldDefinition, 'override'>>;
  // For select fields
  options?: Array<{ label: string; value: string }>;
  // For relation fields
  relation?: {
    type: RelationType;
    targetCollection?: string;
    targetGlobal?: string;
    foreignKey?: string;
    through?: string; // For many-to-many relationships
  };
  // For array fields
  items?: FieldDefinition;
  nestable?: boolean; // Enable parent-child relationships for array items
  // For object fields
  properties?: Record<string, FieldDefinition>;
  // For file fields
  file?: {
    accept?: string; // MIME types or file extensions
    maxSize?: number; // Max file size in bytes
    multiple?: boolean; // Allow multiple file selection
    fileType?: 'image' | 'document' | 'all'; // Type of files to accept
  };
  // UI layout and behavior
  position?: 'sidebar' | 'main' | 'header' | 'footer';
  width?: 'full' | 'half' | 'third' | 'quarter';
  order?: number;
  expandable?: boolean;
  collapsible?: boolean;
  placeholder?: string;
  showLabel?: boolean;
  hidden?: boolean; // Hide field from UI but still include in form data
  showInTable?: boolean; // Show this field as a column in table views
  readonly?: boolean; // Make this specific field readonly (overrides global readonly for this field)
}

/**
 * Core fields that are automatically added by the generator to collections and globals.
 *
 * These fields are essential for most CMS functionality:
 * - `title`: Required for displaying entries in lists and overviews
 * - `slug`: Essential for pretty URLs, SEO, and frontend routing
 * - `status`: Critical for draft/published workflows and frontend visibility
 * - `sort`: Manual ordering for drag-and-drop reordering in admin interface
 * - Templates can override core field properties by defining them in their fields object
 * - Flat globals (dataType = 'flat') skip core fields automatically
 *
 * @example
 * // This collection automatically gets title, slug, and status fields
 * export const pagesCollection: CollectionDefinition = {
 *   fields: {
 *     // title: string (auto-added, required)
 *     // slug: string (auto-added, required, unique)
 *     // status: enum (auto-added, 'draft' | 'published' | 'archived')
 *     excerpt: { type: 'textarea', title: 'Excerpt' }
 *   }
 * };
 *
 * @example
 * // Override core field properties
 * export const productsCollection: CollectionDefinition = {
 *   fields: {
 *     title: { type: 'string', title: 'Product Name', required: true },
 *     slug: { type: 'string', title: 'URL Slug', required: true, unique: true },
 *     status: { type: 'select', options: [{ label: 'Draft', value: 'draft' }], required: true },
 *     price: { type: 'number', required: true }
 *   }
 * };
 */
export const CORE_FIELDS = {
  title: {
    type: 'string' as const,
    title: 'Title',
    required: true,
    core: true
  },
  slug: {
    type: 'string' as const,
    title: 'Slug',
    required: true,
    unique: true,
    core: true
  },
  status: {
    type: 'select' as const,
    title: 'Status',
    options: [
      { label: 'Draft', value: 'draft' },
      { label: 'Published', value: 'published' },
      { label: 'Private', value: 'private' },
      { label: 'Archived', value: 'archived' }
    ],
    required: true,
    core: true
  },
  author: {
    type: 'string' as const,
    title: 'Author',
    required: false,
    core: true,
    description: 'Content creator (user ID)',
    hidden: true // Hide from UI since it's auto-populated
  },
  sort: {
    type: 'number' as const,
    title: 'Sort Order',
    required: false, // Auto-assigned, so not required from user
    default: 0,
    core: true,
    hidden: true // Hide from UI since it's auto-assigned
  },
  parent_id: {
    type: 'string' as const,
    title: 'Parent ID',
    required: false,
    core: true,
    description: 'Parent item for nested relationships',
    hidden: true // Hide from UI since it's handled via drag-and-drop
  },
  last_modified_by: {
    type: 'string' as const,
    title: 'Last Modified By',
    required: false,
    core: true,
    hidden: true
  }
} as const;

/**
 * Core fields that are automatically added to blocks.
 * Blocks have a simpler set of core fields since they're content components within collections.
 */
export const BLOCK_CORE_FIELDS = {
  title: {
    type: 'string' as const,
    title: 'Title',
    required: false, // Not all blocks need titles
    core: true
  },
  sort: {
    type: 'number' as const,
    title: 'Sort Order',
    required: true,
    default: 0,
    core: true
  }
} as const;

/**
 * SEO fields that are automatically added when seo: true is set in collection options.
 *
 * These fields provide comprehensive SEO optimization for collections:
 * - `meta_title`: Custom title for search engines (falls back to title if empty)
 * - `meta_description`: Meta description for search results and social sharing
 * - `og_title`: Open Graph title for social media sharing
 * - `og_description`: Open Graph description for social media
 * - `og_image`: Image for social media sharing and Open Graph
 * - `canonical_url`: Override canonical URL for this page
 * - `noindex`: Prevent search engines from indexing this page
 *
 * @example
 * // Collection with SEO fields automatically added
 * export const pagesCollection: CollectionDefinition = {
 *   options: {
 *     seo: true // Adds all SEO_FIELDS automatically
 *   },
 *   fields: {
 *     // meta_title, meta_description, og_title, etc. auto-added
 *     content: { type: 'wysiwyg' }
 *   }
 * };
 */
export const SEO_FIELDS = {
  meta_title: {
    type: 'string' as const,
    label: 'Meta Title',
    description: 'Custom title for search engines. If empty, the page title will be used.',
    placeholder: 'Custom title for search engines',
    position: 'sidebar' as const,
    order: 100
  },
  meta_description: {
    type: 'textarea' as const,
    label: 'Meta Description',
    description: 'Description shown in search results. Recommended: 150-160 characters.',
    placeholder: 'Brief description for search engines and social media',
    position: 'sidebar' as const,
    order: 101
  },
  og_title: {
    type: 'string' as const,
    label: 'Social Media Title',
    description: 'Title for social media sharing. If empty, meta title or page title will be used.',
    placeholder: 'Title for social media sharing',
    position: 'sidebar' as const,
    order: 102
  },
  og_description: {
    type: 'textarea' as const,
    label: 'Social Media Description',
    description: 'Description for social media sharing. If empty, meta description will be used.',
    placeholder: 'Description for social media sharing',
    position: 'sidebar' as const,
    order: 103
  },
  og_image: {
    type: 'file' as const,
    label: 'Social Media Image',
    description: 'Image for social media sharing. Recommended: 1200x630px.',
    file: {
      accept: 'image/*',
      multiple: false,
      fileType: 'image' as const
    },
    position: 'sidebar' as const,
    order: 104
  },
  canonical_url: {
    type: 'string' as const,
    label: 'Canonical URL',
    description: 'Override the canonical URL for this page. Leave empty to use default.',
    placeholder: 'https://example.com/canonical-path',
    position: 'sidebar' as const,
    order: 105
  },
  noindex: {
    type: 'boolean' as const,
    label: 'Hide from Search Engines',
    description: 'Prevent search engines from indexing this page.',
    default: false,
    position: 'sidebar' as const,
    order: 106
  }
} as const;

// Collection definition type
export type CollectionDefinition = {
  name: {
    singular: string;
    plural: string;
  };
  slug: string;
  description: string;
  icon?: string; // Optional icon identifier for the collection
  fields: Record<string, FieldDefinition>;
  options?: {
    titleField?: string; // Field to use as title for display
    seo?: boolean; // Automatically add SEO fields to this collection
    blocks?: boolean; // Enable/disable blocks functionality for this collection
    basePath?: string; // Base URL path for preview links and canonical URLs (e.g., '/articles/')
    sortable?: boolean; // Enable/disable drag-and-drop reordering
    nestable?: boolean; // Enable/disable hierarchical parent-child relationships
  };
};

// Block definition type
export type BlockDefinition = {
  name: string;
  slug: string;
  description: string;
  fields: Record<string, FieldDefinition>;
  options?: {
    titleField?: string; // Field to use as title for display
  };
};

// Global data type definition
export type GlobalDataType = 'flat' | 'repeatable' | 'relational';

// Global definition type
export type GlobalDefinition = {
  name: {
    singular: string;
    plural: string;
  };
  slug: string;
  description: string;
  fields: Record<string, FieldDefinition>;
  icon?: string; // Optional icon identifier for the global
  dataType: GlobalDataType; // 'flat' for single records, 'repeatable' for multiple flat records, 'relational' for complex relations
  // Data behavior options
  options?: {
    sortable?: boolean; // enable manual sorting in UI
    nestable?: boolean; // enable parent-child relationships (repeatable only)
    inline?: boolean; // edit inline vs navigate to separate pages (repeatable only)
    titleField?: string; // Field to use as title for display
    readonly?: boolean; // make items read-only (hide create/edit UI)
    defaultSort?: { field: string; direction: 'asc' | 'desc' }; // default sort order
  };
};
