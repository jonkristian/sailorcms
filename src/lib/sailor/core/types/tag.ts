// Client-safe types for tags (no Node.js dependencies)

export interface Tag {
  id: string;
  name: string;
  slug: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateTagData {
  name: string;
}

export interface TagWithCount extends Tag {
  usage_count: number;
}
