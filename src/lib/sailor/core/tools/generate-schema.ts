// This script is used by db:generate to create the schema.ts file
// Do not run this directly - use 'npm run db:generate' instead
import { sql } from 'drizzle-orm';
import { blockDefinitions } from '../../templates/blocks';
import { collectionDefinitions } from '../../templates/collections';
import { globalDefinitions } from '../../templates/globals';
import { CORE_FIELDS, BLOCK_CORE_FIELDS, SEO_FIELDS } from '../types';
import { createDatabaseAdapter } from '../db/adapter-factory';
import { toSnakeCase } from '../utils/string';
import fs from 'fs';
import path from 'path';

// Get database adapter for schema generation
const adapter = await createDatabaseAdapter();

// Store relationship metadata while generating tables
const relationshipMetadata: Array<{
  childTable: string;
  parentTable: string;
  type: 'file' | 'array' | 'nested';
  parentField?: string;
}> = [];

// Import database-specific table functions for internal processing
let sqliteTable: any, text: any, integer: any, pgTable: any;

if (adapter.getDatabaseType() === 'postgres') {
  const pgCore = await import('drizzle-orm/pg-core');
  pgTable = pgCore.pgTable;
  text = pgCore.text;
  integer = pgCore.integer;
  // Use pgTable but keep the sqliteTable reference for existing code
  sqliteTable = pgTable;
} else {
  const sqliteCore = await import('drizzle-orm/sqlite-core');
  sqliteTable = sqliteCore.sqliteTable;
  text = sqliteCore.text;
  integer = sqliteCore.integer;
}

// Helper function to merge core fields with template fields
function mergeWithCoreFields(
  templateFields: Record<string, any>,
  skipCoreFields = false,
  options?: { seo?: boolean; blocks?: boolean },
  isFlat = false
): Record<string, any> {
  if (skipCoreFields && !isFlat) {
    return templateFields;
  }

  // For flat globals, only include audit fields, not content-related fields
  if (isFlat) {
    const auditFields = {
      last_modified_by: CORE_FIELDS.last_modified_by
    };

    // Add template fields, handling override syntax for audit fields
    const mergedFields: Record<string, any> = { ...auditFields };
    for (const [key, fieldDef] of Object.entries(templateFields)) {
      const isInAuditFields = key in auditFields;

      if (isInAuditFields) {
        // Handle override syntax for audit fields
        if (fieldDef.override) {
          const { override, ...otherProps } = fieldDef;
          const baseField = (auditFields as any)[key];
          mergedFields[key] = {
            ...baseField,
            ...override,
            ...otherProps
          };
        } else {
          mergedFields[key] = fieldDef;
        }
      } else {
        mergedFields[key] = fieldDef;
      }
    }

    return mergedFields;
  }

  const mergedFields: Record<string, any> = { ...CORE_FIELDS };

  // Add SEO fields if seo option is enabled
  if (options?.seo) {
    Object.assign(mergedFields, SEO_FIELDS);
  }

  // Add template fields, handling override syntax for core fields and SEO fields
  for (const [key, fieldDef] of Object.entries(templateFields)) {
    const isInCoreFields = key in CORE_FIELDS;
    const isInSeoFields = key in SEO_FIELDS;

    if (isInCoreFields || isInSeoFields) {
      // Handle override syntax for core/SEO fields
      if (fieldDef.override) {
        const { override, ...otherProps } = fieldDef;
        const baseField = isInCoreFields ? (CORE_FIELDS as any)[key] : (SEO_FIELDS as any)[key];
        mergedFields[key] = {
          ...baseField,
          ...override,
          core: isInCoreFields,
          ...otherProps
        };
      } else {
        // Legacy: direct override (deprecated)
        const baseField = isInCoreFields ? (CORE_FIELDS as any)[key] : (SEO_FIELDS as any)[key];
        mergedFields[key] = { ...baseField, ...fieldDef, core: isInCoreFields };
      }
    } else {
      mergedFields[key] = fieldDef;
    }
  }

  return mergedFields;
}

// Helper function to merge core fields with block template fields
function mergeWithBlockCoreFields(templateFields: Record<string, any>): Record<string, any> {
  const mergedFields: Record<string, any> = { ...BLOCK_CORE_FIELDS };

  // Add template fields, handling override syntax for core fields
  for (const [key, fieldDef] of Object.entries(templateFields)) {
    if (key in BLOCK_CORE_FIELDS) {
      // Handle override syntax for core fields
      if (fieldDef.override) {
        const { override, ...otherProps } = fieldDef;
        mergedFields[key] = {
          ...(BLOCK_CORE_FIELDS as any)[key],
          ...override,
          core: true,
          ...otherProps
        };
      } else {
        // Legacy: direct override (deprecated)
        mergedFields[key] = { ...(BLOCK_CORE_FIELDS as any)[key], ...fieldDef, core: true };
      }
    } else {
      mergedFields[key] = fieldDef;
    }
  }

  return mergedFields;
}

// Recursive function to generate nested array tables
function generateArrayTables(
  baseTableName: string,
  parentIdField: string,
  fields: Record<string, any>,
  depth: number = 0
): Array<{ name: string; table: any }> {
  const tables = [];

  // Find all array fields at this level
  const arrayFields = Object.entries(fields).filter(
    ([_, fieldDef]: [string, any]) => fieldDef.type === 'array' && fieldDef.items
  );

  for (const [fieldName, fieldDef] of arrayFields) {
    const arrayTableName =
      depth === 0
        ? `${baseTableName}_${toSnakeCase(fieldName)}` // Use descriptive naming for all levels
        : `${baseTableName}_${toSnakeCase(fieldName)}`;

    const arrayTable = sqliteTable(arrayTableName, {
      id: text('id')
        .primaryKey()
        .notNull()
        .$defaultFn(() => crypto.randomUUID()),
      [parentIdField]: text(parentIdField).notNull(),
      sort: integer('sort').notNull(),
      created_at: integer('created_at', { mode: 'timestamp' })
        .notNull()
        .$defaultFn(() => new Date()),
      updated_at: integer('updated_at', { mode: 'timestamp' })
        .notNull()
        .$defaultFn(() => new Date()),
      // Add regular fields from array items
      ...Object.entries(fieldDef.items?.properties || {}).reduce(
        (acc, [fieldKey, fieldKeyDef]: [string, any]) => {
          // Skip nested array fields as they'll get their own tables
          if (fieldKeyDef.type === 'array') return acc;
          // Skip file fields as they'll get their own relation tables
          if (fieldKeyDef.type === 'file') return acc;
          return { ...acc, [fieldKey]: text(fieldKey) };
        },
        {}
      )
    });

    tables.push({ name: arrayTableName, table: arrayTable });

    // Create file relation tables for file fields in this array
    const fileFields = Object.entries(fieldDef.items?.properties || {}).filter(
      ([_, fieldKeyDef]: [string, any]) => fieldKeyDef.type === 'file'
    );

    for (const [fileFieldName] of fileFields) {
      const fileTableName = `${arrayTableName}_${fileFieldName}`;
      const fileTable = sqliteTable(fileTableName, {
        id: text('id')
          .primaryKey()
          .notNull()
          .$defaultFn(() => crypto.randomUUID()),
        parent_id: text('parent_id').notNull(),
        file_id: text('file_id').notNull(),
        sort: integer('sort').notNull().default(0),
        alt_override: text('alt_override'),
        created_at: integer('created_at', { mode: 'timestamp' })
          .notNull()
          .$defaultFn(() => new Date())
      });
      tables.push({ name: fileTableName, table: fileTable });
    }

    // Recursively generate tables for nested arrays
    const nestedArrayFields = Object.entries(fieldDef.items?.properties || {}).filter(
      ([_, nestedFieldDef]: [string, any]) => nestedFieldDef.type === 'array'
    );

    for (const [nestedFieldName, nestedFieldDef] of nestedArrayFields) {
      const nestedTables = generateArrayTables(
        arrayTableName,
        'parent_id', // Use parent_id for nested tables
        { [nestedFieldName]: nestedFieldDef },
        depth + 1
      );
      tables.push(...nestedTables);
    }
  }

  return tables;
}

// Generate TypeScript interfaces for blocks
function generateBlockTypes() {
  const blockTypeDefinitions = Object.entries(blockDefinitions).map(([name, definition]) => {
    const interfaceName = `${name.charAt(0).toUpperCase() + name.slice(1)}Block`;
    const properties = Object.entries(definition.fields || {})
      .map(([key, fieldDef]: [string, any]) => {
        const isOptional = !fieldDef.required;
        const type = fieldDefToTypeScript(fieldDef, key);
        return `  ${key}${isOptional ? '?' : ''}: ${type};`;
      })
      .join('\n');

    return `export interface ${interfaceName} {\n${properties}\n}`;
  });

  return blockTypeDefinitions.join('\n\n');
}

// Generate TypeScript interfaces for collections
function generateCollectionTypes() {
  const collectionTypeDefinitions = Object.entries(collectionDefinitions).map(
    ([slug, definition]) => {
      const interfaceName = `${slug.charAt(0).toUpperCase() + slug.slice(1)}Collection`;

      // System fields (always present and non-nullable)
      const systemFields = ['  id: string;', '  created_at: string;', '  updated_at: string;'];

      // Merge core fields with template fields
      const allFields = mergeWithCoreFields(definition.fields || {}, false, definition.options);
      const templateProperties = Object.entries(allFields).map(([key, fieldDef]: [string, any]) => {
        const isOptional = !fieldDef.required;
        const type = fieldDefToTypeScript(fieldDef, key);
        return `  ${key}${isOptional ? '?' : ''}: ${type};`;
      });

      const allProperties = [...systemFields, ...templateProperties].join('\n');
      return `export interface ${interfaceName} {\n${allProperties}\n}`;
    }
  );

  return collectionTypeDefinitions.join('\n\n');
}

// Generate TypeScript interfaces for globals
function generateGlobalTypes() {
  const globalTypeDefinitions = Object.entries(globalDefinitions).map(([slug, definition]) => {
    const interfaceName = `${slug.charAt(0).toUpperCase() + slug.slice(1)}Global`;

    // System fields (always present and non-nullable)
    const systemFields = ['  id: string;', '  created_at: string;', '  updated_at: string;'];

    // Skip core fields for flat globals since they don't need titles in lists
    const skipCoreFields = definition.dataType === 'flat';
    const isFlat = definition.dataType === 'flat';
    const allFields = mergeWithCoreFields(
      definition.fields || {},
      skipCoreFields,
      undefined,
      isFlat
    );
    const templateProperties = Object.entries(allFields).map(([key, fieldDef]) => {
      const isOptional = !fieldDef.required;
      const type = fieldDefToTypeScript(fieldDef, key);
      return `  ${key}${isOptional ? '?' : ''}: ${type};`;
    });

    const allProperties = [...systemFields, ...templateProperties].join('\n');
    return `export interface ${interfaceName} {\n${allProperties}\n}`;
  });

  return globalTypeDefinitions.join('\n\n');
}

// Helper function to convert field definition to TypeScript type
function fieldDefToTypeScript(fieldDef: any, fieldName?: string): string {
  if (!fieldDef || typeof fieldDef !== 'object') return 'any';

  // Special handling for user reference fields
  if (fieldName === 'author' || fieldName === 'last_modified_by') {
    return 'UserReference';
  }

  if ('type' in fieldDef) {
    switch (fieldDef.type) {
      case 'string':
      case 'text':
      case 'textarea':
      case 'wysiwyg':
        if (fieldDef.enum) {
          return fieldDef.enum.map((e: string) => `'${e}'`).join(' | ');
        }
        return 'string';
      case 'number':
      case 'integer':
        return 'number';
      case 'boolean':
        return 'boolean';
      case 'date':
        return 'Date';
      case 'enum':
        if (fieldDef.enum) {
          return fieldDef.enum.map((v: string) => `'${v}'`).join(' | ');
        }
        return 'string';
      case 'select':
        if (fieldDef.options && Array.isArray(fieldDef.options)) {
          return fieldDef.options.map((option: any) => `'${option.value}'`).join(' | ');
        }
        return 'string';
      case 'relation':
        if (fieldDef.relation && fieldDef.relation.targetCollection) {
          if (fieldDef.relation.type === 'many-to-many') {
            return `${fieldDef.relation.targetCollection.charAt(0).toUpperCase() + fieldDef.relation.targetCollection.slice(1)}Collection[]`;
          } else {
            return `${fieldDef.relation.targetCollection.charAt(0).toUpperCase() + fieldDef.relation.targetCollection.slice(1)}Collection`;
          }
        }
        return 'any';
      case 'array':
        if (fieldDef.items) {
          const itemType = fieldDefToTypeScript(fieldDef.items);
          return `${itemType}[]`;
        }
        return 'any[]';
      case 'object':
        if (fieldDef.properties) {
          const properties = Object.entries(fieldDef.properties)
            .map(([key, value]) => {
              const isOptional = fieldDef.required ? !fieldDef.required.includes(key) : true;
              const type = fieldDefToTypeScript(value);
              return `  ${key}${isOptional ? '?' : ''}: ${type};`;
            })
            .join('\n');
          return `{\n${properties}\n}`;
        }
        return 'Record<string, any>';
      default:
        return 'any';
    }
  }

  return 'any';
}

// Generate helper functions for schema access
function generateSchemaHelpers() {
  const blockHelpers = Object.keys(blockDefinitions)
    .map((name) => {
      const interfaceName = `${name.charAt(0).toUpperCase() + name.slice(1)}Block`;
      return `  '${name}': ${interfaceName};`;
    })
    .join('\n');

  const collectionHelpers = Object.keys(collectionDefinitions)
    .map((slug) => {
      const interfaceName = `${slug.charAt(0).toUpperCase() + slug.slice(1)}Collection`;
      return `  '${slug}': ${interfaceName};`;
    })
    .join('\n');

  const globalHelpers = Object.keys(globalDefinitions)
    .map((slug) => {
      const interfaceName = `${slug.charAt(0).toUpperCase() + slug.slice(1)}Global`;
      return `  '${slug}': ${interfaceName};`;
    })
    .join('\n');

  return `// Type registries for dynamic access
export type BlockTypes = {
${blockHelpers}
};

export type CollectionTypes = {
${collectionHelpers}
};

export type GlobalTypes = {
${globalHelpers}
};`;
}

// Generate the types file content
export function generateTypesContent() {
  const imports = [
    "import type { LibSQLDatabase } from 'drizzle-orm/libsql';",
    "import type * as schema from './schema';",
    "import type { UserReference } from '../core/types';",
    '',
    '// Database instance type',
    'export type Database = LibSQLDatabase<typeof schema>;',
    '',
    '// Database table information types',
    'export interface TableInfo {',
    '  name: string;',
    '  columns: Array<{',
    '    cid: number;',
    '  name: string;',
    '  type: string;',
    '  notnull: number;',
    '  dflt_value: string | null;',
    '  pk: number;',
    '  }>;',
    '  rowCount: number;',
    '}',
    '',
    'export interface RowCountResult {',
    '  count: number;',
    '}',
    '',
    '// Database configuration types',
    'export interface DatabaseConfig {',
    '  url: string;',
    '  authToken?: string;',
    '}',
    '',
    '// Database migration types',
    'export interface MigrationResult {',
    '  success: boolean;',
    '  error?: string;',
    '}',
    '',
    '// Database seeding types',
    'export interface SeedResult {',
    '  success: boolean;',
    '  error?: string;',
    '  tablesSeeded?: string[];',
    '}',
    '',
    '// User and role types',
    "export type UserRole = 'admin' | 'editor' | 'viewer';",
    '',
    'export interface User {',
    '  id: string;',
    '  email: string;',
    '  name?: string;',
    '  email_verified?: number;',
    '  image?: string;',
    '  role: UserRole;',
    '  banned?: number;',
    '  ban_reason?: string;',
    '  ban_expires?: string;',
    '  created_at: string;',
    '  updated_at: string;',
    '}',
    '',
    'export interface Role {',
    '  id: string;',
    '  name: string;',
    '  permissions: string; // JSON string of permissions',
    '  created_at: string;',
    '  updated_at: string;',
    '}',
    '',
    'export interface CollectionType {',
    '  id: string;',
    '  name_singular: string;',
    '  name_plural: string;',
    '  slug: string;',
    '  description?: string;',
    '  icon?: string;',
    '  schema: string; // JSON string of field definitions',
    '  options?: string; // JSON string of collection options',
    '  created_at: string;',
    '  updated_at: string;',
    '}',
    '',
    'export interface GlobalType {',
    '  id: string;',
    '  name_singular: string;',
    '  name_plural: string;',
    '  slug: string;',
    '  description?: string;',
    '  icon?: string;',
    '  data_type: string; // "single" or "flat"',
    '  schema: string; // JSON string of field definitions',
    '  options?: string; // JSON string of global options',
    '  created_at: string;',
    '  updated_at: string;',
    '}',
    '',
    'export interface BlockType {',
    '  id: string;',
    '  name: string;',
    '  slug: string;',
    '  description?: string;',
    '  schema: string; // JSON string of field definitions',
    '  created_at: string;',
    '  updated_at: string;',
    '}',
    '',
    'export interface File {',
    '  id: string;',
    '  name: string;',
    '  mime_type: string;',
    '  size?: number | null;',
    '  path: string;',
    '  url: string;',
    '  hash?: string | null;',
    '  alt?: string | null;',
    '  title?: string | null;',
    '  description?: string | null;',
    '  author?: UserReference;',
    '  created_at: string;',
    '  updated_at: string;',
    '}',
    '',
    'export interface Tag {',
    '  id: string;',
    '  name: string;',
    '  slug: string;',
    '  scope?: string;',
    '  created_at: string;',
    '  updated_at: string;',
    '}',
    '',
    '// Generated block types',
    generateBlockTypes(),
    '',
    '// Generated collection types',
    generateCollectionTypes(),
    '',
    '// Generated global types',
    generateGlobalTypes(),
    '',
    generateSchemaHelpers()
  ];

  return imports.join('\n');
}

// Generate tables for each block definition
export const blockTables = Object.entries(blockDefinitions).map(([name, definition]) => {
  const tables = [];

  // Create main block table
  const mainTableName = `block_${name}`;
  const mainTable = sqliteTable(mainTableName, {
    id: text('id')
      .primaryKey()
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    collection_id: text('collection_id').notNull(),
    sort: integer('sort').notNull(),
    created_at: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updated_at: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    ...Object.entries(definition.fields || {}).reduce((acc, [key, fieldDef]: [string, any]) => {
      // Skip array fields as they'll get their own tables
      if (fieldDef.type === 'array') return acc;
      // Skip file fields as they'll get their own relation tables
      if (fieldDef.type === 'file') return acc;
      return { ...acc, [key]: text(key) };
    }, {})
  });
  tables.push({ name: mainTableName, table: mainTable });

  // Generate all array tables (including nested ones)
  const arrayTables = generateArrayTables(mainTableName, 'block_id', definition.fields || {});
  tables.push(...arrayTables);

  // Create tables for file fields
  const fileFields = Object.entries(definition.fields || {}).filter(
    ([_, fieldDef]: [string, any]) => fieldDef.type === 'file'
  );

  for (const [fieldName] of fileFields) {
    const fileTableName = `block_${name}_${toSnakeCase(fieldName)}`;
    const fileTable = sqliteTable(fileTableName, {
      id: text('id')
        .primaryKey()
        .notNull()
        .$defaultFn(() => crypto.randomUUID()),
      block_id: text('block_id').notNull(),
      file_id: text('file_id').notNull(),
      sort: integer('sort').notNull().default(0),
      alt_override: text('alt_override'),
      created_at: integer('created_at', { mode: 'timestamp' })
        .notNull()
        .$defaultFn(() => new Date())
    });
    tables.push({ name: fileTableName, table: fileTable });

    // Store relationship metadata
    relationshipMetadata.push({
      childTable: fileTableName,
      parentTable: mainTableName,
      type: 'file'
    });
  }

  return tables;
});

// Generate tables for each collection definition
export const collectionTables = Object.entries(collectionDefinitions).map(([slug, definition]) => {
  const tables = [];

  // Merge core fields with template fields
  const allFields = mergeWithCoreFields(definition.fields || {}, false, definition.options);

  // Create main collection table
  const mainTable = sqliteTable(`collection_${slug}`, {
    id: text('id')
      .primaryKey()
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    created_at: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updated_at: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    ...Object.entries(allFields).reduce((acc, [key, fieldDef]: [string, any]) => {
      // Skip relation fields as they'll get their own junction tables
      if (fieldDef.type === 'relation') return acc;

      // Handle different field types with proper constraints
      let column;
      if (fieldDef.type === 'number') {
        column = integer(key);
        if (fieldDef.required) column = column.notNull();
        if (fieldDef.default !== undefined) {
          column = column.default(fieldDef.default);
        }
      } else if (fieldDef.type === 'boolean') {
        column = integer(key, { mode: 'boolean' });
        if (fieldDef.required) column = column.notNull();
        if (fieldDef.default !== undefined) {
          column = column.default(fieldDef.default);
        }
      } else {
        column = text(key);
        if (fieldDef.required) {
          column = column.notNull();
        }
        if (fieldDef.default !== undefined) {
          column = column.default(fieldDef.default);
        }
        // Add unique constraint for slug fields
        if (key === 'slug') {
          column = column.unique();
        }
      }

      return { ...acc, [key]: column };
    }, {})
  });

  tables.push({ name: `collection_${slug}`, table: mainTable });

  // Create junction tables for many-to-many relations
  const relationFields = Object.entries(allFields).filter(
    ([_, fieldDef]: [string, any]) =>
      fieldDef.type === 'relation' && fieldDef.relation?.type === 'many-to-many'
  );

  for (const [fieldName, fieldDef] of relationFields) {
    const junctionTableName = `junction_${slug}_${toSnakeCase(fieldName)}`;

    const junctionTable = sqliteTable(junctionTableName, {
      id: text('id')
        .primaryKey()
        .notNull()
        .$defaultFn(() => crypto.randomUUID()),
      collection_id: text('collection_id').notNull(),
      target_id: text('target_id').notNull(),
      created_at: integer('created_at', { mode: 'timestamp' })
        .notNull()
        .$defaultFn(() => new Date()),
      updated_at: integer('updated_at', { mode: 'timestamp' })
        .notNull()
        .$defaultFn(() => new Date())
    });

    tables.push({ name: junctionTableName, table: junctionTable });
  }

  return tables;
});

// Generate tables for each global definition
export const globalTables = Object.entries(globalDefinitions).map(([slug, definition]) => {
  const tables = [];

  // Create main global table
  const mainTableName = `global_${slug}`;

  // Skip core fields for flat globals since they don't need titles in lists
  const skipCoreFields = definition.dataType === 'flat';
  const isFlat = definition.dataType === 'flat';
  const allFields = mergeWithCoreFields(definition.fields || {}, skipCoreFields, undefined, isFlat);

  // Build the table fields
  const tableFields: any = {
    id: text('id')
      .primaryKey()
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    created_at: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updated_at: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date())
  };

  // Add parent_id column if nestable
  if (definition.options?.nestable) {
    tableFields.parent_id = text('parent_id');
  }

  // Add regular fields (skip array fields as they'll get their own tables)
  const regularFields = Object.entries(allFields).reduce((acc, [key, fieldDef]) => {
    if (fieldDef.type === 'array') return acc;

    // Handle different field types with proper constraints
    let column;
    if (fieldDef.type === 'number') {
      column = integer(key);
      if (fieldDef.required) column = column.notNull();
      if (fieldDef.default !== undefined) {
        column = column.default(fieldDef.default);
      }
    } else if (fieldDef.type === 'boolean') {
      column = integer(key, { mode: 'boolean' });
      if (fieldDef.required) column = column.notNull();
      if (fieldDef.default !== undefined) {
        column = column.default(fieldDef.default);
      }
    } else {
      column = text(key);
      if (fieldDef.required) {
        column = column.notNull();
      }
      if (fieldDef.default !== undefined) {
        column = column.default(fieldDef.default);
      }
      // Add unique constraint for slug fields
      if (key === 'slug') {
        column = column.unique();
      }
    }

    return { ...acc, [key]: column };
  }, {});

  const mainTable = sqliteTable(mainTableName, {
    ...tableFields,
    ...regularFields
  });

  tables.push({ name: mainTableName, table: mainTable });

  // Create tables for array fields
  const arrayFields = Object.entries(allFields).filter(
    ([_, fieldDef]) => fieldDef.type === 'array' && fieldDef.items
  );

  for (const [fieldName, fieldDef] of arrayFields) {
    const arrayTableName = `global_${slug}_${toSnakeCase(fieldName)}`;

    const arrayTableFields: any = {
      id: text('id')
        .primaryKey()
        .notNull()
        .$defaultFn(() => crypto.randomUUID()),
      global_id: text('global_id').notNull(),
      sort: integer('sort').notNull(),
      created_at: integer('created_at', { mode: 'timestamp' })
        .notNull()
        .$defaultFn(() => new Date()),
      updated_at: integer('updated_at', { mode: 'timestamp' })
        .notNull()
        .$defaultFn(() => new Date())
    };

    // Add parent_id to array items if the global is nestable OR if this array field is nestable
    if (definition.options?.nestable || fieldDef.nestable) {
      arrayTableFields.parent_id = text('parent_id');
    }

    // Add array item properties
    const itemFields = Object.entries(fieldDef.items?.properties || {}).reduce(
      (acc, [fieldKey]: [string, any]) => ({
        ...acc,
        [fieldKey]: text(fieldKey)
      }),
      {}
    );

    const arrayTable = sqliteTable(arrayTableName, {
      ...arrayTableFields,
      ...itemFields
    });

    tables.push({ name: arrayTableName, table: arrayTable });
  }

  return tables;
});

// Flatten the array of tables
export const allTables = [
  ...blockTables.flat(),
  ...collectionTables.flat(),
  ...globalTables.flat()
];

// Export all tables
export const tables = {
  ...allTables.reduce((acc, table) => ({ ...acc, [table.name]: table.table }), {})
};

// Generate core schema content using factory function (eliminates regex hackery)
async function getCoreSchemaContent() {
  // Get the provider-specific table functions
  const { createTable, text, integer, index, uniqueIndex } = await adapter.getTableFunctions();

  // Generate the actual table creation code for each core table
  // Core table definitions - these are the source of truth for the database schema
  const coreTableDefinitions = [
    // Users table
    `export const users = ${adapter.getTableFunction()}(
  'users',
  {
    id: ${adapter.getPrimaryKeyDefinition()},
    email: ${adapter.getTextFieldDefinition('email', { notNull: true, unique: true })},
    name: ${adapter.getTextFieldDefinition('name')},
    email_verified: ${adapter.getIntegerFieldDefinition('email_verified', { default: 0 })},
    image: ${adapter.getTextFieldDefinition('image')},
    role: ${adapter.getTextFieldDefinition('role')},
    banned: ${adapter.getIntegerFieldDefinition('banned', { default: 0 })},
    ban_reason: ${adapter.getTextFieldDefinition('ban_reason')},
    ban_expires: ${adapter.getTimestampDefinition('ban_expires')},
    created_at: ${adapter.getTimestampDefinition('created_at')},
    updated_at: ${adapter.getTimestampDefinition('updated_at')}
  },
  (table) => [
    index('users_email_idx').on(table.email),
    index('users_role_idx').on(table.role)
  ]
);`,

    // Roles table
    `export const roles = ${adapter.getTableFunction()}('roles', {
  id: ${adapter.getPrimaryKeyDefinition()},
  name: ${adapter.getTextFieldDefinition('name', { notNull: true, unique: true })},
  permissions: ${adapter.getTextFieldDefinition('permissions', { notNull: true })},
  created_at: ${adapter.getTimestampDefinition('created_at')},
  updated_at: ${adapter.getTimestampDefinition('updated_at')}
});`,

    // Collection types table
    `export const collectionTypes = ${adapter.getTableFunction()}('collection_types', {
  id: ${adapter.getPrimaryKeyDefinition()},
  name_singular: ${adapter.getTextFieldDefinition('name_singular', { notNull: true })},
  name_plural: ${adapter.getTextFieldDefinition('name_plural', { notNull: true })},
  slug: ${adapter.getTextFieldDefinition('slug', { notNull: true, unique: true })},
  description: ${adapter.getTextFieldDefinition('description')},
  icon: ${adapter.getTextFieldDefinition('icon')},
  schema: ${adapter.getTextFieldDefinition('schema', { notNull: true })},
  options: ${adapter.getTextFieldDefinition('options')},
  created_at: ${adapter.getTimestampDefinition('created_at')},
  updated_at: ${adapter.getTimestampDefinition('updated_at')}
});`,

    // Block types table
    `export const blockTypes = ${adapter.getTableFunction()}('block_types', {
  id: ${adapter.getPrimaryKeyDefinition()},
  name: ${adapter.getTextFieldDefinition('name', { notNull: true })},
  slug: ${adapter.getTextFieldDefinition('slug', { notNull: true, unique: true })},
  description: ${adapter.getTextFieldDefinition('description')},
  schema: ${adapter.getTextFieldDefinition('schema', { notNull: true })},
  created_at: ${adapter.getTimestampDefinition('created_at')},
  updated_at: ${adapter.getTimestampDefinition('updated_at')}
});`,

    // Global types table
    `export const globalTypes = ${adapter.getTableFunction()}('global_types', {
  id: ${adapter.getPrimaryKeyDefinition()},
  name_singular: ${adapter.getTextFieldDefinition('name_singular', { notNull: true })},
  name_plural: ${adapter.getTextFieldDefinition('name_plural', { notNull: true })},
  slug: ${adapter.getTextFieldDefinition('slug', { notNull: true, unique: true })},
  description: ${adapter.getTextFieldDefinition('description')},
  icon: ${adapter.getTextFieldDefinition('icon')},
  data_type: ${adapter.getTextFieldDefinition('data_type', { notNull: true })},
  schema: ${adapter.getTextFieldDefinition('schema', { notNull: true })},
  options: ${adapter.getTextFieldDefinition('options')},
  created_at: ${adapter.getTimestampDefinition('created_at')},
  updated_at: ${adapter.getTimestampDefinition('updated_at')}
});`,

    // System settings table
    `export const systemSettings = ${adapter.getTableFunction()}('system_settings', {
  id: ${adapter.getPrimaryKeyDefinition()},
  key: ${adapter.getTextFieldDefinition('key', { notNull: true, unique: true })},
  value: ${adapter.getTextFieldDefinition('value', { notNull: true })},
  description: ${adapter.getTextFieldDefinition('description')},
  category: ${adapter.getTextFieldDefinition('category', { notNull: true })},
  created_at: ${adapter.getTimestampDefinition('created_at')},
  updated_at: ${adapter.getTimestampDefinition('updated_at')}
});`,

    // Files table
    `export const files = ${adapter.getTableFunction()}(
  'files',
  {
    id: ${adapter.getPrimaryKeyDefinition()},
    name: ${adapter.getTextFieldDefinition('name', { notNull: true })},
    mime_type: ${adapter.getTextFieldDefinition('mime_type', { notNull: true })},
    size: ${adapter.getIntegerFieldDefinition('size')},
    path: ${adapter.getTextFieldDefinition('path', { notNull: true })},
    url: ${adapter.getTextFieldDefinition('url', { notNull: true })},
    hash: ${adapter.getTextFieldDefinition('hash')},
    alt: ${adapter.getTextFieldDefinition('alt')},
    title: ${adapter.getTextFieldDefinition('title')},
    description: ${adapter.getTextFieldDefinition('description')},
    author: ${adapter.getTextFieldDefinition('author')},
    created_at: ${adapter.getTimestampDefinition('created_at')},
    updated_at: ${adapter.getTimestampDefinition('updated_at')}
  },
  (table) => [
    index('files_name_idx').on(table.name),
    index('files_mime_type_idx').on(table.mime_type),
    index('files_created_at_idx').on(table.created_at),
    index('files_hash_idx').on(table.hash)
  ]
);`,

    // Tags table
    `export const tags = ${adapter.getTableFunction()}(
  'tags',
  {
    id: ${adapter.getPrimaryKeyDefinition()},
    name: ${adapter.getTextFieldDefinition('name', { notNull: true })},
    slug: ${adapter.getTextFieldDefinition('slug', { notNull: true })},
    scope: ${adapter.getTextFieldDefinition('scope')},
    created_at: ${adapter.getTimestampDefinition('created_at')},
    updated_at: ${adapter.getTimestampDefinition('updated_at')}
  },
  (table) => [
    index('tags_name_idx').on(table.name),
    index('tags_slug_idx').on(table.slug),
    index('tags_scope_idx').on(table.scope),
    uniqueIndex('tags_name_scope_unique_idx').on(table.name, table.scope)
  ]
);`,

    // Taggables table
    `export const taggables = ${adapter.getTableFunction()}(
  'taggables',
  {
    id: ${adapter.getPrimaryKeyDefinition()},
    tag_id: ${adapter.getTextFieldDefinition('tag_id', { notNull: true })},
    taggable_type: ${adapter.getTextFieldDefinition('taggable_type', { notNull: true })},
    taggable_id: ${adapter.getTextFieldDefinition('taggable_id', { notNull: true })},
    created_at: ${adapter.getTimestampDefinition('created_at')}
  },
  (table) => [
    index('taggables_tag_id_idx').on(table.tag_id),
    index('taggables_taggable_type_idx').on(table.taggable_type),
    index('taggables_taggable_id_idx').on(table.taggable_id),
    index('taggables_composite_idx').on(table.taggable_type, table.taggable_id),
    index('taggables_unique_idx').on(table.tag_id, table.taggable_type, table.taggable_id)
  ]
);`,

    // Better Auth tables
    `export const accounts = ${adapter.getTableFunction()}('accounts', {
  id: ${adapter.getPrimaryKeyDefinition()},
  user_id: ${adapter.getTextFieldDefinition('user_id', { notNull: true })},
  account_id: ${adapter.getTextFieldDefinition('account_id', { notNull: true })},
  provider_id: ${adapter.getTextFieldDefinition('provider_id', { notNull: true })},
  access_token: ${adapter.getTextFieldDefinition('access_token')},
  refresh_token: ${adapter.getTextFieldDefinition('refresh_token')},
  id_token: ${adapter.getTextFieldDefinition('id_token')},
  access_token_expires_at: ${adapter.getTimestampDefinition('access_token_expires_at')},
  refresh_token_expires_at: ${adapter.getTimestampDefinition('refresh_token_expires_at')},
  scope: ${adapter.getTextFieldDefinition('scope')},
  password: ${adapter.getTextFieldDefinition('password')},
  created_at: ${adapter.getTimestampDefinition('created_at')},
  updated_at: ${adapter.getTimestampDefinition('updated_at')}
});`,

    `export const sessions = ${adapter.getTableFunction()}('sessions', {
  id: ${adapter.getPrimaryKeyDefinition()},
  user_id: ${adapter.getTextFieldDefinition('user_id', { notNull: true })},
  token: ${adapter.getTextFieldDefinition('token', { notNull: true })},
  expires_at: ${adapter.getTextFieldDefinition('expires_at', { notNull: true })},
  ip_address: ${adapter.getTextFieldDefinition('ip_address')},
  user_agent: ${adapter.getTextFieldDefinition('user_agent')},
  impersonated_by: ${adapter.getTextFieldDefinition('impersonated_by')},
  created_at: ${adapter.getTimestampDefinition('created_at')},
  updated_at: ${adapter.getTimestampDefinition('updated_at')}
});`,

    `export const verifications = ${adapter.getTableFunction()}('verifications', {
  id: ${adapter.getPrimaryKeyDefinition()},
  identifier: ${adapter.getTextFieldDefinition('identifier', { notNull: true })},
  value: ${adapter.getTextFieldDefinition('value', { notNull: true })},
  expires_at: ${adapter.getTextFieldDefinition('expires_at', { notNull: true })},
  created_at: ${adapter.getTimestampDefinition('created_at')},
  updated_at: ${adapter.getTimestampDefinition('updated_at')}
});`
  ];

  // Generate relation definitions
  const relationDefinitions = [
    `export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions)
}));`,

    `export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, {
    fields: [accounts.user_id],
    references: [users.id]
  })
}));`,

    `export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.user_id],
    references: [users.id]
  }),
  impersonatedBy: one(users, {
    fields: [sessions.impersonated_by],
    references: [users.id]
  })
}));`,

    `export const collectionTypesRelations = relations(collectionTypes, ({ many }) => ({
  blocks: many(blockTypes)
}));`,

    `export const blockTypesRelations = relations(blockTypes, ({ one }) => ({
  collectionType: one(collectionTypes, {
    fields: [blockTypes.id],
    references: [collectionTypes.id]
  })
}));`,

    `export const tagsRelations = relations(tags, ({ many }) => ({
  taggables: many(taggables)
}));`,

    `export const taggablesRelations = relations(taggables, ({ one }) => ({
  tag: one(tags, {
    fields: [taggables.tag_id],
    references: [tags.id]
  })
}));`,

    `export const filesRelations = relations(files, ({ many }) => ({
  taggables: many(taggables)
}));`
  ];

  return `
// Core tables generated using clean factory function (no regex replacements!)
// The actual table definitions are created with provider-specific functions

${coreTableDefinitions.join('\n\n')}

${relationDefinitions.join('\n\n')}`;
}

// Generate the schema file content
export async function generateSchemaContent() {
  const coreContent = await getCoreSchemaContent();

  const imports = [
    adapter.getImports(),
    "import { relations } from 'drizzle-orm';",
    "import { sql } from 'drizzle-orm';",
    '',
    '// Core tables and relations',
    coreContent,
    '',
    '// Generated block tables'
  ];

  // First generate all table definitions using adapter-specific syntax
  const blockTableDefinitions = allTables.map(({ name, table }) => {
    const fields = Object.entries(table)
      .map(([key]) => {
        if (key === 'id') return `  id: ${adapter.getPrimaryKeyDefinition()}`;
        if (key === 'created_at')
          return `  created_at: ${adapter.getTimestampDefinition('created_at')}`;
        if (key === 'updated_at')
          return `  updated_at: ${adapter.getTimestampDefinition('updated_at')}`;
        if (key === 'sort')
          return `  sort: ${adapter.getIntegerFieldDefinition('sort', { notNull: true, default: 0 })}`;
        if (key === 'block_id')
          return `  block_id: ${adapter.getTextFieldDefinition('block_id', { notNull: true })}`;
        if (key === 'global_id')
          return `  global_id: ${adapter.getTextFieldDefinition('global_id', { notNull: true })}`;
        if (key === 'collection_id')
          return `  collection_id: ${adapter.getTextFieldDefinition('collection_id', { notNull: true })}`;
        if (key === 'parent_id')
          return `  parent_id: ${adapter.getTextFieldDefinition('parent_id')}`;
        if (key === 'slug')
          return `  slug: ${adapter.getTextFieldDefinition('slug', { unique: true })}`;
        return `  ${key}: ${adapter.getTextFieldDefinition(key)}`;
      })
      .filter(Boolean);

    return `export const ${name} = ${adapter.getTableFunction()}('${name}', {\n${fields.join(',\n')}\n});`;
  });

  // Then generate relations using stored metadata
  const relationDefinitions = [];

  // Generate relations for stored metadata (file tables)
  relationshipMetadata.forEach(({ childTable, parentTable, type }) => {
    if (type === 'file') {
      relationDefinitions.push(`export const ${childTable}Relations = relations(${childTable}, ({ one }) => ({
  block: one(${parentTable}, {
    fields: [${childTable}.block_id],
    references: [${parentTable}.id],
  }),
}));`);
    }
  });

  // Generate relations for other tables (arrays, nested arrays) using old logic for now
  const otherRelationDefinitions = allTables
    .filter(({ name, table }) => {
      // Skip file tables (already handled by metadata)
      const isFileTable = relationshipMetadata.some(
        (rel) => rel.childTable === name && rel.type === 'file'
      );
      if (isFileTable) return false;

      // Handle both old _rel pattern and new descriptive naming
      if (name.endsWith('_rel')) return true;
      // For new naming, look for tables that are array relations (have _features, _cta, etc.)
      // Main block tables have collection_id, array tables have block_id
      const parts = name.split('_');
      const hasBlockId = 'block_id' in table;
      const hasCollectionId = 'collection_id' in table;
      return parts.length >= 3 && parts[0] === 'block' && hasBlockId && !hasCollectionId;
    })
    .map(({ name, table }) => {
      if (name.endsWith('_rel')) {
        // Old pattern
        const mainTableName = name.replace('_rel', '');
        return `export const ${name}Relations = relations(${name}, ({ one }) => ({
  block: one(${mainTableName}, {
    fields: [${name}.block_id],
    references: [${mainTableName}.id],
  }),
}));`;
      } else {
        // New pattern - determine if this is a nested array or first-level array
        const parts = name.split('_');
        if (parts.length === 4) {
          // This could be a nested array (e.g., block_features_features_cta) or a file table (e.g., block_media_text_image)
          // Check if it has file_id field to determine if it's a file table
          const hasFileId = 'file_id' in table;
          if (hasFileId) {
            // This is a file table (e.g., block_media_text_image)
            // It should relate to the main block table
            const mainTableName = `${parts[0]}_${parts[1]}_${parts[2]}`;
            return `export const ${name}Relations = relations(${name}, ({ one }) => ({
  block: one(${mainTableName}, {
    fields: [${name}.block_id],
    references: [${mainTableName}.id],
  }),
}));`;
          } else {
            // This is a nested array (e.g., block_features_features_cta)
            // It should relate to its parent array table
            const parentTableName = `${parts[0]}_${parts[1]}_${parts[2]}`;
            return `export const ${name}Relations = relations(${name}, ({ one }) => ({
  parent: one(${parentTableName}, {
    fields: [${name}.parent_id],
    references: [${parentTableName}.id],
  }),
}));`;
          }
        } else if (parts.length === 3) {
          // This could be a first-level array (e.g., block_features_features) or a file table (e.g., block_media_text_image)
          // All 3-part tables with block_id should relate to the main block table
          const mainTableName = `${parts[0]}_${parts[1]}`;
          return `export const ${name}Relations = relations(${name}, ({ one }) => ({
  block: one(${mainTableName}, {
    fields: [${name}.block_id],
    references: [${mainTableName}.id],
  }),
}));`;
        } else if (parts.length === 4) {
          // This could be a nested array (e.g., block_features_features_cta) or a file table (e.g., block_media_text_image)
          // Check if it has file_id field to determine if it's a file table
          const hasFileId = 'file_id' in table;
          if (hasFileId) {
            // This is a file table (e.g., block_media_text_image)
            // It should relate to the main block table
            const mainTableName = `${parts[0]}_${parts[1]}_${parts[2]}`;
            return `export const ${name}Relations = relations(${name}, ({ one }) => ({
  block: one(${mainTableName}, {
    fields: [${name}.block_id],
    references: [${mainTableName}.id],
  }),
}));`;
          } else {
            // This is a nested array (e.g., block_features_features_cta)
            // It should relate to its parent array table
            const parentTableName = `${parts[0]}_${parts[1]}_${parts[2]}`;
            return `export const ${name}Relations = relations(${name}, ({ one }) => ({
  parent: one(${parentTableName}, {
    fields: [${name}.parent_id],
    references: [${parentTableName}.id],
  }),
}));`;
          }
        }
      }
    });

  // Combine all relation definitions
  relationDefinitions.push(...otherRelationDefinitions);

  // Generate global relations
  const globalRelationDefinitions = allTables
    .filter(
      ({ name }) =>
        name.startsWith('global_') &&
        name.includes('_') &&
        !name.endsWith('_rel') &&
        name.split('_').length > 2
    )
    .map(({ name }) => {
      const parts = name.split('_');
      const globalSlug = parts[1];
      const mainTableName = `global_${globalSlug}`;
      return `export const ${name}Relations = relations(${name}, ({ one }) => ({
  global: one(${mainTableName}, {
    fields: [${name}.global_id],
    references: [${mainTableName}.id],
  }),
}));`;
    });

  const content = [
    ...imports,
    ...blockTableDefinitions,
    '',
    '// Relations',
    ...relationDefinitions,
    '',
    '// Global Relations',
    ...globalRelationDefinitions
  ].join('\n');

  return content;
}

// Generate and write the schema file
export async function generateSchema() {
  const schemaContent = await generateSchemaContent();
  const generatedDir = path.join(process.cwd(), 'src/lib/sailor/generated');
  if (!fs.existsSync(generatedDir)) {
    fs.mkdirSync(generatedDir, { recursive: true });
  }
  const schemaPath = path.join(generatedDir, 'schema.ts');
  fs.writeFileSync(schemaPath, schemaContent);
  console.log('✓ Schema generated');
}

// Generate and write the types file
export function generateTypes() {
  const typesContent = generateTypesContent();
  const generatedDir = path.join(process.cwd(), 'src/lib/sailor/generated');
  if (!fs.existsSync(generatedDir)) {
    fs.mkdirSync(generatedDir, { recursive: true });
  }
  const typesPath = path.join(generatedDir, 'types.ts');
  fs.writeFileSync(typesPath, typesContent);
  console.log('✓ Types generated');
}

// Generate field configurations for runtime use
function generateFieldConfigs() {
  const collectionConfigs: Record<string, Record<string, any>> = {};
  const globalConfigs: Record<string, Record<string, any>> = {};
  const blockConfigs: Record<string, Record<string, any>> = {};

  // Generate collection field configs
  Object.entries(collectionDefinitions).forEach(([name, definition]) => {
    const mergedFields = mergeWithCoreFields(definition.fields || {}, false, definition.options);
    collectionConfigs[name] = mergedFields;
  });

  // Generate global field configs
  Object.entries(globalDefinitions).forEach(([name, definition]) => {
    const skipCoreFields = definition.dataType === 'flat';
    const isFlat = definition.dataType === 'flat';
    const mergedFields = mergeWithCoreFields(
      definition.fields || {},
      skipCoreFields,
      undefined,
      isFlat
    );
    globalConfigs[name] = mergedFields;
  });

  // Generate block field configs
  Object.entries(blockDefinitions).forEach(([name, definition]) => {
    const mergedFields = mergeWithBlockCoreFields(definition.fields || {});
    blockConfigs[name] = mergedFields;
  });

  const fieldConfigsContent = `// Generated field configurations for developer reference
// This file is auto-generated. Do not edit manually.
//
// NOTE: The CMS runtime uses field configurations loaded from the database.
// This file is provided as a developer reference for field schemas and types.
// Use these exports if you need field configurations in frontend-only contexts.

// Collection field configurations
export const collectionFieldConfigs = ${JSON.stringify(collectionConfigs, null, 2)} as const;

// Global field configurations  
export const globalFieldConfigs = ${JSON.stringify(globalConfigs, null, 2)} as const;

// Block field configurations
export const blockFieldConfigs = ${JSON.stringify(blockConfigs, null, 2)} as const;

// Helper function to get field config for a collection
export function getCollectionFieldConfig(collectionSlug: string) {
  return (collectionFieldConfigs as any)[collectionSlug];
}

// Helper function to get field config for a global
export function getGlobalFieldConfig(globalSlug: string) {
  return (globalFieldConfigs as any)[globalSlug];
}

// Helper function to get field config for a block
export function getBlockFieldConfig(blockSlug: string) {
  return (blockFieldConfigs as any)[blockSlug];
}
`;

  const generatedDir = path.join(process.cwd(), 'src/lib/sailor/generated');
  if (!fs.existsSync(generatedDir)) {
    fs.mkdirSync(generatedDir, { recursive: true });
  }
  const fieldsPath = path.join(generatedDir, 'fields.ts');
  fs.writeFileSync(fieldsPath, fieldConfigsContent);
  console.log('✓ Field configurations generated');
}

// Generate both schema and types
export async function generateAll() {
  await generateSchema();
  generateTypes();
  generateFieldConfigs();
  console.log('✅ Generation completed');
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  await generateAll();
}
