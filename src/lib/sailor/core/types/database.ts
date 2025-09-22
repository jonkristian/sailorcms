// Client-safe database entity types (no Node.js dependencies)

// Collection types
export interface Collection {
  id: string;
  name: string;
  slug: string;
  singular: string;
  plural: string;
  description?: string;
  schema: string;
  tags?: boolean;
  seo?: boolean;
  created_at: Date;
  updated_at: Date;
}

// Block types
export interface BlockType {
  id: string;
  name: string;
  slug: string;
  description?: string;
  schema: string;
  created_at: Date;
  updated_at: Date;
}

// Global types
export interface GlobalType {
  id: string;
  name: string;
  slug: string;
  singular: boolean;
  description?: string;
  schema: string;
  tags?: boolean;
  created_at: Date;
  updated_at: Date;
}

// File types
export interface File {
  id: string;
  filename: string;
  original_name: string;
  path: string;
  url: string;
  size: number;
  mime_type: string;
  alt?: string;
  caption?: string;
  title?: string;
  description?: string;
  created_at: Date;
  updated_at: Date;
}
