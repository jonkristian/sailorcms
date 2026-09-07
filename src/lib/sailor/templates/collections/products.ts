import type { CollectionDefinition } from 'sailorcms/core/types';

/**
 * Mirrors the iPro product catalogue: the category edge is declared here, on
 * the product, and the junction it generates (`junction_products_category`)
 * is the only place that edge exists.
 */
export const productsCollection: CollectionDefinition = {
  name: {
    singular: 'Product',
    plural: 'Products'
  },
  slug: 'products',
  description: 'A product catalogue, categorised through a many-to-many relation',
  icon: 'Package',
  options: {
    titleField: 'title',
    seo: false,
    blocks: false,
    searchable: true
  },
  fields: {
    // Core fields auto-added by generator (title, slug, status, sort, id,
    // created_at/updated_at, author, last_modified_by).
    description: {
      type: 'textarea',
      label: 'Description',
      position: 'main'
    },
    category: {
      type: 'relation',
      label: 'Categories',
      position: 'sidebar',
      showInTable: true,
      relation: {
        type: 'many-to-many',
        targetGlobal: 'product_categories'
      }
    }
  }
};
