/**
 * Utility functions for displaying content in the CMS
 */

/**
 * Get the display title for an item based on the template's titleField option
 * @param item - The item to get the title for
 * @param template - The template definition (block, collection, or global)
 * @returns The display title string
 */
export function getDisplayTitle(item: any, template: any): string {
  if (!item) return 'Untitled';

  // Use the configured titleField from template options
  const titleField = template?.options?.titleField;
  if (titleField && item[titleField]) {
    const value = item[titleField];

    // For rich text fields, strip HTML and limit length
    if (typeof value === 'string' && value.includes('<')) {
      const stripped = value.replace(/<[^>]*>/g, '').trim();
      return stripped.length > 50 ? stripped.substring(0, 50) + '...' : stripped;
    }

    return String(value);
  }

  // Fallback chain for backward compatibility
  if (item.title) return String(item.title);
  if (item.name) return String(item.name);

  // Find first string-like field as last resort
  const fields = template?.fields || {};
  for (const [key, field] of Object.entries(fields)) {
    const fieldDef = field as any;
    if (fieldDef?.type === 'string' && item[key]) {
      return String(item[key]);
    }
  }

  return 'Untitled';
}

/**
 * Get a truncated version of the display title for compact views
 * @param item - The item to get the title for
 * @param template - The template definition
 * @param maxLength - Maximum length (default: 30)
 * @returns Truncated title string
 */
export function getCompactTitle(item: any, template: any, maxLength: number = 30): string {
  const title = getDisplayTitle(item, template);
  return title.length > maxLength ? title.substring(0, maxLength) + '...' : title;
}
