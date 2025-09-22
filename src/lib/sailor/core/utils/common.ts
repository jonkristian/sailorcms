/**
 * Generates a UUID using the browser's built-in crypto.randomUUID()
 * This is the modern standard for UUID generation
 */
export function generateUUID(): string {
  // Use browser's built-in crypto.randomUUID() if available
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Fallback for older browsers or environments without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Safely parses JSON with error handling
 */
export function safeJsonParse<T = any>(jsonString: string | null | undefined, fallback: T): T {
  if (!jsonString) return fallback;

  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.warn('Failed to parse JSON:', error);
    return fallback;
  }
}

/**
 * Safely stringifies JSON with error handling
 */
export function safeJsonStringify<T = any>(data: T, fallback: string = '{}'): string {
  try {
    return JSON.stringify(data);
  } catch (error) {
    console.warn('Failed to stringify JSON:', error);
    return fallback;
  }
}

/**
 * Updates an item in an array by ID
 */
export function updateItemInArray<T extends Record<string, any>>(
  items: T[],
  id: string,
  updates: Partial<T>
): T[] {
  return items.map((item) => (item.id === id ? { ...item, ...updates } : item));
}

/**
 * Removes an item from an array by ID
 */
export function removeItemFromArray<T extends Record<string, any>>(items: T[], id: string): T[] {
  return items.filter((item) => item.id !== id);
}

/**
 * Adds an item to an array
 */
export function addItemToArray<T>(items: T[], item: T): T[] {
  return [...items, item];
}

/**
 * Converts a string to a URL-friendly slug
 * @param text - The text to convert to a slug
 * @param options - Optional configuration for slug generation
 * @returns A URL-friendly slug string
 */
export function slugify(
  text: string,
  options: {
    separator?: string;
    lowercase?: boolean;
    removeStopWords?: boolean;
    maxLength?: number;
  } = {}
): string {
  const { separator = '-', lowercase = true, removeStopWords = false, maxLength = 60 } = options;

  if (!text) return '';

  // Common stop words to remove (if enabled)
  const stopWords = new Set([
    'a',
    'an',
    'and',
    'are',
    'as',
    'at',
    'be',
    'by',
    'for',
    'from',
    'has',
    'he',
    'in',
    'is',
    'it',
    'its',
    'of',
    'on',
    'that',
    'the',
    'to',
    'was',
    'will',
    'with'
  ]);

  // Convert to string and normalize
  let slug = String(text)
    // Normalize unicode characters (convert accented characters to ASCII)
    .normalize('NFD')
    // Remove diacritics (accents)
    .replace(/[\u0300-\u036f]/g, '')
    // Replace various separators with spaces
    .replace(/[_\-\s]+/g, ' ')
    // Remove special characters, keep alphanumeric and spaces
    .replace(/[^\w\s]/g, '')
    // Trim whitespace
    .trim();

  // Convert to lowercase if specified
  if (lowercase) {
    slug = slug.toLowerCase();
  }

  // Split into words
  let words = slug.split(/\s+/);

  // Remove stop words if enabled
  if (removeStopWords) {
    words = words.filter((word) => !stopWords.has(word.toLowerCase()));
  }

  // Filter out empty words
  words = words.filter((word) => word.length > 0);

  // Join with separator
  slug = words.join(separator);

  // Truncate if longer than maxLength
  if (maxLength && slug.length > maxLength) {
    slug = slug.substring(0, maxLength);
    // Don't cut in the middle of a word if possible
    const lastSeparatorIndex = slug.lastIndexOf(separator);
    if (lastSeparatorIndex > maxLength * 0.8) {
      slug = slug.substring(0, lastSeparatorIndex);
    }
  }

  // Remove trailing separator
  slug = slug.replace(new RegExp(`${separator}+$`), '');

  return slug;
}

/**
 * Creates a unique slug by appending a number if the slug already exists
 * @param baseSlug - The base slug to make unique
 * @param existingSlugs - Array of existing slugs to check against
 * @returns A unique slug
 */
export function makeUniqueSlug(baseSlug: string, existingSlugs: string[]): string {
  if (!existingSlugs.includes(baseSlug)) {
    return baseSlug;
  }

  let counter = 1;
  let uniqueSlug = `${baseSlug}-${counter}`;

  while (existingSlugs.includes(uniqueSlug)) {
    counter++;
    uniqueSlug = `${baseSlug}-${counter}`;
  }

  return uniqueSlug;
}

/**
 * Generates a slug from a title with uniqueness checking
 * @param title - The title to convert to a slug
 * @param existingSlugs - Array of existing slugs to check against
 * @param options - Slugify options
 * @returns A unique slug
 */
export function generateSlug(
  title: string,
  existingSlugs: string[] = [],
  options: {
    separator?: string;
    lowercase?: boolean;
    removeStopWords?: boolean;
    maxLength?: number;
  } = {}
): string {
  const baseSlug = slugify(title, options);
  return makeUniqueSlug(baseSlug, existingSlugs);
}

/**
 * Sanitizes ID values to prevent orphaned records and invalid references
 * Converts invalid values (empty strings, '[]', etc.) to null
 * Validates UUID format for non-null values
 * @param value - The ID value to sanitize (parent_id, relation IDs, etc.)
 * @returns A valid UUID string or null
 */
export function sanitizeId(value: any): string | null {
  // Handle falsy values and common invalid strings
  if (!value || value === '' || value === '[]' || value === 'null' || value === 'undefined') {
    return null;
  }

  // For non-string values, convert to string first
  const stringValue = String(value);

  // Check if it's a valid UUID format (supports both v4 and other versions)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (uuidRegex.test(stringValue)) {
    return stringValue;
  }

  // Invalid format, treat as null to prevent orphaned records
  return null;
}

/**
 * Normalizes relation field inputs to extract IDs from objects or arrays
 * Handles common patterns like {id: "uuid"} or [{id: "uuid"}] or "uuid"
 * @param key - The field key (used to check if it's a relation field)
 * @param value - The input value to normalize
 * @returns The normalized ID value or the original value if not a relation field
 */
export function normalizeRelationId(key: string, value: any): any {
  if (!key.endsWith('_id')) return value;

  if (value && typeof value === 'object' && 'id' in value) {
    return (value as any).id ?? null;
  }

  if (Array.isArray(value) && value.length > 0) {
    const first = value[0] as any;
    return typeof first === 'object' ? (first?.id ?? null) : (first ?? null);
  }

  return value ?? null;
}
