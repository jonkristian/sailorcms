// Client-safe types for WordPress import (no Node.js dependencies)

export interface FieldMapping {
  field: string;
  type: string;
  status: 'optimal' | 'compatible' | 'missing';
  description: string;
}

export interface AvailableField {
  name: string;
  type: string;
  label: string;
}

export interface CollectionAnalysis {
  collectionName: string;
  collectionExists: boolean;
  fieldMappings: {
    content: FieldMapping | null;
    excerpt: FieldMapping | null;
    featured_image: FieldMapping | null;
    categories: FieldMapping | null;
    tags: FieldMapping | null;
  };
  availableFields: AvailableField[];
  categoryConfig: {
    detected: boolean;
    junctionTable?: string;
    targetCollection?: string;
  };
  recommendations: string[];
  warnings: string[];
}
