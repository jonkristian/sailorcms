/**
 * Shared string utility functions for Sailor CMS
 */

/**
 * Convert camelCase to snake_case for database naming
 * Used consistently across schema generation, table naming, etc.
 */
export function toSnakeCase(str: string): string {
  return str
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '');
}

/**
 * Build a generated child/relation table name: `<prefix>_<snake(field)>`.
 *
 * The schema generator snake_cases the field segment of every child table
 * (files, arrays, junctions), so a camelCase field key (`coverMobile`) becomes
 * `<prefix>_cover_mobile`. Every load/save lookup MUST go through this so the
 * convention lives in one place and can't drift per call site (the source of a
 * past class of silent "no such table/column" bugs).
 *
 * @example childTableName('collection_projects', 'coverMobile') // collection_projects_cover_mobile
 * @example childTableName(`junction_${slug}`, 'categories')     // junction_<slug>_categories
 */
export function childTableName(prefix: string, field: string): string {
  return `${prefix}_${toSnakeCase(field)}`;
}

/**
 * Convert snake_case to camelCase
 */
export function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Convert string to kebab-case
 */
export function toKebabCase(str: string): string {
  return str
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()
    .replace(/^-/, '');
}

/**
 * Capitalize first letter of string
 */
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
