import type { GlobalDefinition } from 'sailorcms/core/types';

/**
 * The category side of the product catalogue: a two-level tree that products
 * point at.
 *
 * Note there is deliberately no `products` relation field here. The edge is
 * declared once, on the product; declaring it again from this side would
 * generate a second junction table and two answers to the same question.
 * Reading — and editing — it from this side is what the `reverse` field type
 * is for: it resolves to the junction the product already owns.
 */
export const productCategoriesGlobal: GlobalDefinition = {
  name: {
    singular: 'Product Category',
    plural: 'Product Categories'
  },
  slug: 'product_categories',
  description: 'A two-level category tree for the product catalogue',
  icon: 'FolderTree',
  dataType: 'repeatable',
  options: {
    sortable: true,
    nestable: true
  },
  fields: {
    title: {
      label: 'Name',
      position: 'sidebar'
    },
    parent_id: {
      type: 'relation',
      label: 'Parent Category',
      position: 'sidebar',
      description: 'Select a parent category to create a hierarchy',
      relation: {
        type: 'one-to-many',
        targetGlobal: 'product_categories'
      }
    },
    description: {
      type: 'text',
      label: 'Description',
      position: 'main',
      width: 'full'
    },
    /**
     * A read of `products.category` from the other end — the same junction the
     * product owns, not a second edge set. Emits no column and no table.
     */
    products: {
      type: 'reverse',
      label: 'Produkter i denne kategorien',
      position: 'main',
      reverse: {
        fromCollection: 'products',
        field: 'category'
      }
    },
    status: {
      type: 'select',
      label: 'Status',
      position: 'sidebar',
      order: 3,
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Published', value: 'published' }
      ],
      default: 'published'
    }
  }
};
