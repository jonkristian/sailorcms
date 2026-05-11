// Database schema generation
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import pluralize from 'pluralize';

export function registerDbGenerate(program) {
  program
    .command('db:generate')
    .description(
      'Regenerate generated/schema.ts and types.ts from templates (types-only subset of db:update — does not run drizzle-kit generate or migrations)'
    )
    .action(async () => {
      try {
        console.log('🗄️ Generating database schema...');

        // If we're in a regular Node.js environment (not tsx/bun), restart with tsx
        if (!process.env.TSX && !process.execPath.includes('bun')) {
          const { execSync } = await import('child_process');
          const path = await import('path');
          const __dirname = path.dirname(new URL(import.meta.url).pathname);
          const dbGeneratePath = path.join(__dirname, 'db-generate.js');

          execSync(`npx tsx ${dbGeneratePath}`, {
            cwd: process.cwd(),
            stdio: 'inherit',
            env: { ...process.env, TSX: '1' }
          });
          return;
        }

        await generateSchema();
      } catch (error) {
        console.error('❌ Error generating schema:', error.message);
        process.exit(1);
      }
    });
}

async function generateSchema() {
  const targetDir = process.cwd();

  // Check required files exist in consumer project
  const requiredFiles = [
    'src/lib/sailor/templates/blocks/index.ts',
    'src/lib/sailor/templates/collections/index.ts',
    'src/lib/sailor/templates/globals/index.ts',
    'drizzle.config.ts'
  ];

  for (const file of requiredFiles) {
    if (!fs.existsSync(path.join(targetDir, file))) {
      throw new Error(`Required file missing: ${file}. Please run "npx sailor core:init" first.`);
    }
  }

  // Dynamically import from the consumer project's template files
  const blockDefinitionsModule = await import(
    pathToFileURL(path.join(targetDir, 'src/lib/sailor/templates/blocks/index.ts')).href
  );
  const collectionDefinitionsModule = await import(
    pathToFileURL(path.join(targetDir, 'src/lib/sailor/templates/collections/index.ts')).href
  );
  const globalDefinitionsModule = await import(
    pathToFileURL(path.join(targetDir, 'src/lib/sailor/templates/globals/index.ts')).href
  );
  const settingsModule = await import(
    pathToFileURL(path.join(targetDir, 'src/lib/sailor/templates/settings.ts')).href
  );

  // Import CMS utilities from the package (sailor's admin code lives in
  // node_modules/sailorcms/ in consumers; in sailor's own dev, the same
  // relative path resolves to the repo's src/lib/sailor/).
  const __dirname = path.dirname(new URL(import.meta.url).pathname);
  const pkgRoot = path.join(__dirname, '..', '..');
  const typesModule = await import(
    pathToFileURL(path.join(pkgRoot, 'src/lib/sailor/core/types.ts')).href
  );
  const adapterFactoryModule = await import(
    pathToFileURL(path.join(pkgRoot, 'src/lib/sailor/core/db/adapter-factory.ts')).href
  );
  const stringUtilsModule = await import(
    pathToFileURL(path.join(pkgRoot, 'src/lib/sailor/core/utils/string.ts')).href
  );

  // Extract the exports
  const { blockDefinitions } = blockDefinitionsModule;
  const { collectionDefinitions } = collectionDefinitionsModule;
  const { globalDefinitions } = globalDefinitionsModule;
  const { settings } = settingsModule;
  const { CORE_FIELDS, BLOCK_CORE_FIELDS, SEO_FIELDS } = typesModule;
  const { createDatabaseAdapter } = adapterFactoryModule;
  const { toSnakeCase } = stringUtilsModule;

  // Get database adapter for schema generation
  const adapter = await createDatabaseAdapter();

  // Import the schema generator from the CLI tools directory
  const { SchemaGenerator } = await import(
    pathToFileURL(path.join(__dirname, 'generator/schema.js')).href
  );

  const generator = new SchemaGenerator(
    adapter,
    { globalDefinitions, collectionDefinitions, blockDefinitions },
    { CORE_FIELDS, BLOCK_CORE_FIELDS, SEO_FIELDS },
    { toSnakeCase }
  );

  const schemaContent = await generator.generateSchema();

  const generatedDir = path.join(targetDir, 'src/lib/sailor/generated');
  if (!fs.existsSync(generatedDir)) {
    fs.mkdirSync(generatedDir, { recursive: true });
  }
  const schemaPath = path.join(generatedDir, 'schema.ts');
  fs.writeFileSync(schemaPath, schemaContent);

  // Also generate additional files
  generateTypes(targetDir, {
    globalDefinitions,
    collectionDefinitions,
    blockDefinitions,
    CORE_FIELDS,
    SEO_FIELDS
  });

  generateFieldConfigs(targetDir, {
    globalDefinitions,
    collectionDefinitions,
    blockDefinitions,
    CORE_FIELDS,
    SEO_FIELDS
  });

  generateSettings(targetDir, { settings });

  generateIcons(targetDir, { globalDefinitions, collectionDefinitions, blockDefinitions });
}

/**
 * Scan all template definitions for `icon: 'Name'` declarations and emit
 * `generated/icons.ts` with explicit named imports from `@lucide/svelte`.
 * Only icons templates actually use get bundled, so consumers don't pay the
 * ~120KB cost of bundling the full Lucide barrel.
 */
function generateIcons(targetDir, { globalDefinitions, collectionDefinitions, blockDefinitions }) {
  const iconNames = new Set();
  const collect = (defs) => {
    for (const def of Object.values(defs || {})) {
      if (def && typeof def.icon === 'string' && /^[A-Z][A-Za-z0-9]*$/.test(def.icon)) {
        iconNames.add(def.icon);
      }
    }
  };
  collect(globalDefinitions);
  collect(collectionDefinitions);
  collect(blockDefinitions);

  const sorted = [...iconNames].sort();

  const lines = [
    '// Auto-generated Lucide icon registry for Sailor CMS',
    '// This file is automatically generated - do not edit manually.',
    "// Templates that declare `icon: 'Name'` end up here so tree-shaking keeps",
    '// the admin bundle small. Re-run `npx sailor db:update` after changing icons.',
    ''
  ];
  if (sorted.length > 0) {
    lines.push(`import { ${sorted.join(', ')} } from '@lucide/svelte';`);
    lines.push('');
    lines.push('export const templateIcons: Record<string, any> = {');
    for (const name of sorted) lines.push(`  ${name},`);
    lines.push('};');
  } else {
    lines.push('// (no template icons declared yet)');
    lines.push('export const templateIcons: Record<string, any> = {};');
  }
  lines.push('');

  const generatedDir = path.join(targetDir, 'src/lib/sailor/generated');
  if (!fs.existsSync(generatedDir)) fs.mkdirSync(generatedDir, { recursive: true });
  fs.writeFileSync(path.join(generatedDir, 'icons.ts'), lines.join('\n'));
}

function generateFieldConfigs(
  targetDir,
  { globalDefinitions, collectionDefinitions, blockDefinitions, CORE_FIELDS, SEO_FIELDS }
) {
  const fieldConfigs = {
    collections: {},
    globals: {},
    blocks: {}
  };

  // Process collections
  for (const [slug, definition] of Object.entries(collectionDefinitions)) {
    const mergedFields = mergeWithCoreFields(
      definition.fields || {},
      definition.skipCoreFields || false,
      definition.options || {},
      false,
      { CORE_FIELDS, SEO_FIELDS }
    );

    fieldConfigs.collections[slug] = {
      name: definition.name,
      slug,
      description: definition.description,
      icon: definition.icon,
      options: definition.options,
      fields: mergedFields
    };
  }

  // Process globals
  for (const [slug, definition] of Object.entries(globalDefinitions)) {
    const isFlat = definition.dataType === 'flat';
    const mergedFields = mergeWithCoreFields(
      definition.fields || {},
      definition.skipCoreFields || false,
      definition.options || {},
      isFlat,
      { CORE_FIELDS, SEO_FIELDS }
    );

    fieldConfigs.globals[slug] = {
      name: definition.name,
      slug,
      description: definition.description,
      icon: definition.icon,
      dataType: definition.dataType,
      options: definition.options,
      fields: mergedFields
    };
  }

  // Process blocks
  for (const [slug, definition] of Object.entries(blockDefinitions)) {
    const mergedFields = mergeWithCoreFields(
      definition.fields || {},
      true, // blocks skip core fields by default
      definition.options || {},
      false,
      { CORE_FIELDS, SEO_FIELDS }
    );

    fieldConfigs.blocks[slug] = {
      name: definition.name,
      slug,
      description: definition.description,
      icon: definition.icon,
      category: definition.category,
      options: definition.options,
      fields: mergedFields
    };
  }

  const settingsContent = [
    '// Auto-generated field configurations for Sailor CMS',
    '// This file is automatically generated - do not edit manually',
    '',
    'export const fieldConfigurations = ' + JSON.stringify(fieldConfigs, null, 2) + ';',
    '',
    'export default fieldConfigurations;'
  ].join('\n');

  const generatedDir = path.join(targetDir, 'src/lib/sailor/generated');
  if (!fs.existsSync(generatedDir)) {
    fs.mkdirSync(generatedDir, { recursive: true });
  }
  const fieldsPath = path.join(generatedDir, 'fields.ts');
  fs.writeFileSync(fieldsPath, settingsContent);
}

function mergeWithCoreFields(
  templateFields,
  skipCoreFields = false,
  options = {},
  isFlat = false,
  { CORE_FIELDS, SEO_FIELDS }
) {
  if (skipCoreFields && !isFlat) {
    return templateFields;
  }

  // For flat globals, only include audit fields, not content-related fields
  if (isFlat) {
    const auditFields = {
      last_modified_by: CORE_FIELDS.last_modified_by
    };

    // Add template fields, handling override syntax for audit fields
    const mergedFields = { ...auditFields };
    for (const [key, fieldDef] of Object.entries(templateFields)) {
      const isInAuditFields = key in auditFields;

      if (isInAuditFields) {
        // Handle override syntax for audit fields
        if (fieldDef.override) {
          const { override, ...otherProps } = fieldDef;
          const baseField = auditFields[key];
          mergedFields[key] = { ...baseField, ...otherProps };
        } else {
          mergedFields[key] = fieldDef;
        }
      } else {
        mergedFields[key] = fieldDef;
      }
    }

    return mergedFields;
  }

  // Start with all core fields
  const mergedFields = { ...CORE_FIELDS };

  // Add SEO fields if collection supports them
  if (options.enableSEO !== false) {
    Object.assign(mergedFields, SEO_FIELDS);
  }

  // Add template fields, handling override syntax
  for (const [key, fieldDef] of Object.entries(templateFields)) {
    const isInCoreFields = key in CORE_FIELDS;
    const isInSeoFields = key in SEO_FIELDS;

    if (isInCoreFields || isInSeoFields) {
      // Handle override syntax for core/SEO fields
      if (fieldDef.override) {
        const { override, ...otherProps } = fieldDef;
        const baseField = isInCoreFields ? CORE_FIELDS[key] : SEO_FIELDS[key];
        mergedFields[key] = { ...baseField, ...otherProps };
      } else {
        mergedFields[key] = fieldDef;
      }
    } else {
      mergedFields[key] = fieldDef;
    }
  }

  return mergedFields;
}

/**
 * Convert a human-readable name to a valid TypeScript identifier.
 *
 * Splits on common separators (whitespace, em dash, en dash, hyphen,
 * underscore, period) and PascalCases the parts. Preserves Unicode letters
 * (`å`, `ø`, `æ`, etc. are valid TS identifier chars) but strips anything
 * that isn't a letter, digit, `$`, or `_`. Ensures the result starts with
 * a letter or underscore so it parses cleanly.
 *
 * Examples:
 *   'Hero Section'         → 'HeroSection'
 *   'Partnere—logobånd'    → 'PartnereLogobånd'    (em dash split, å kept)
 *   'Forespørselsskjema'   → 'Forespørselsskjema'  (ø kept as-is)
 *   '1st Block'            → 'Block'                (leading digit stripped)
 */
function toValidIdentifier(name) {
  const parts = String(name || '')
    .split(/[\s\-—–_.]+/)
    .filter(Boolean);
  const pascal = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');
  // Strip anything that isn't a Unicode letter, digit, $, or _
  const cleaned = pascal.replace(/[^\p{L}\p{N}$_]/gu, '');
  // Identifiers can't start with a digit
  return cleaned.replace(/^\p{N}+/u, '') || 'Unnamed';
}

function generateTypes(
  targetDir,
  { globalDefinitions, collectionDefinitions, blockDefinitions, CORE_FIELDS, SEO_FIELDS }
) {
  const fieldConfigs = {
    collections: {},
    globals: {},
    blocks: {}
  };

  // Process collections
  for (const [slug, definition] of Object.entries(collectionDefinitions)) {
    const mergedFields = mergeWithCoreFields(
      definition.fields || {},
      definition.skipCoreFields || false,
      definition.options || {},
      false,
      { CORE_FIELDS, SEO_FIELDS }
    );

    fieldConfigs.collections[slug] = {
      name: definition.name,
      slug,
      description: definition.description,
      icon: definition.icon,
      typeName: definition.typeName,
      options: definition.options,
      fields: mergedFields
    };
  }

  // Process globals
  for (const [slug, definition] of Object.entries(globalDefinitions)) {
    const isFlat = definition.dataType === 'flat';
    const mergedFields = mergeWithCoreFields(
      definition.fields || {},
      definition.skipCoreFields || false,
      definition.options || {},
      isFlat,
      { CORE_FIELDS, SEO_FIELDS }
    );

    fieldConfigs.globals[slug] = {
      name: definition.name,
      slug,
      description: definition.description,
      icon: definition.icon,
      typeName: definition.typeName,
      dataType: definition.dataType,
      options: definition.options,
      fields: mergedFields
    };
  }

  // Process blocks
  for (const [slug, definition] of Object.entries(blockDefinitions)) {
    const mergedFields = mergeWithCoreFields(
      definition.fields || {},
      true, // blocks skip core fields by default
      definition.options || {},
      false,
      { CORE_FIELDS, SEO_FIELDS }
    );

    fieldConfigs.blocks[slug] = {
      name: definition.name,
      slug,
      description: definition.description,
      icon: definition.icon,
      typeName: definition.typeName,
      category: definition.category,
      options: definition.options,
      fields: mergedFields
    };
  }

  // Type-name precedence:
  //   1. `definition.typeName` (explicit override for edges like `settings`
  //      collective-noun, FAQ acronyms, or whenever the singularized slug
  //      reads wrong).
  //   2. Singularize the slug (collections + globals only — slugs are
  //      conventionally plural for those, singular type names match TS
  //      row-type conventions; block slugs are typically already singular).
  //   3. PascalCase, then suffix globals with `Global` and blocks with `Block`
  //      to namespace away from cross-kind slug collisions.
  const collectionTypeName = (config) =>
    config.typeName || toValidIdentifier(pluralize.singular(config.slug));
  const globalTypeName = (config) =>
    config.typeName || toValidIdentifier(pluralize.singular(config.slug)) + 'Global';
  const blockTypeName = (config) => config.typeName || toValidIdentifier(config.slug) + 'Block';

  const typeDefinitions = [];
  typeDefinitions.push('// Auto-generated types for Sailor CMS — do not edit manually.');
  typeDefinitions.push('//');
  typeDefinitions.push('// Naming rule: row types (collection / global) are singular and derived');
  typeDefinitions.push(
    '// from the slug — `posts` → `Post`, `categories` → `CategoryGlobal`. Block'
  );
  typeDefinitions.push('// types preserve the slug since a block often contains many of the named');
  typeDefinitions.push(
    '// thing — `features` → `FeaturesBlock` (one block listing many features).'
  );
  typeDefinitions.push('// Globals are suffixed `Global` and blocks `Block` so cross-kind slug');
  typeDefinitions.push(
    "// collisions can't happen and sailor's built-in `Settings` stays distinct."
  );
  typeDefinitions.push(
    "// Set `typeName: '…'` on a template definition to override the auto-derived name."
  );
  typeDefinitions.push('');

  // Generate collection types
  typeDefinitions.push('// Collection Types');
  for (const [slug, config] of Object.entries(fieldConfigs.collections)) {
    const typeName = collectionTypeName(config);

    // Start with core database fields that are always present
    const coreFields = ['  id: string;', '  created_at: Date;', '  updated_at: Date;'];

    const fields = Object.entries(config.fields)
      .map(([fieldName, fieldDef]) => {
        const tsType = getTypeScriptType(fieldDef);
        const optional = fieldDef.required !== true ? '?' : '';
        return `  ${fieldName}${optional}: ${tsType};`;
      })
      .join('\n');

    typeDefinitions.push(`export interface ${typeName} {`);
    typeDefinitions.push(coreFields.join('\n'));
    if (fields) {
      typeDefinitions.push(fields);
    }
    typeDefinitions.push('}');
    typeDefinitions.push('');
  }

  // Generate global types
  typeDefinitions.push('// Global Types');
  for (const [slug, config] of Object.entries(fieldConfigs.globals)) {
    const typeName = globalTypeName(config);

    // Start with core database fields that are always present
    const coreFields = ['  id: string;', '  created_at: Date;', '  updated_at: Date;'];

    const fields = Object.entries(config.fields)
      .map(([fieldName, fieldDef]) => {
        const tsType = getTypeScriptType(fieldDef);
        const optional = fieldDef.required !== true ? '?' : '';
        return `  ${fieldName}${optional}: ${tsType};`;
      })
      .join('\n');

    typeDefinitions.push(`export interface ${typeName} {`);
    typeDefinitions.push(coreFields.join('\n'));
    if (fields) {
      typeDefinitions.push(fields);
    }
    typeDefinitions.push('}');
    typeDefinitions.push('');
  }

  // Generate block types
  typeDefinitions.push('// Block Types');
  for (const [slug, config] of Object.entries(fieldConfigs.blocks)) {
    const typeName = blockTypeName(config);

    // Start with core database fields that are always present
    const coreFields = ['  id: string;', '  created_at: Date;', '  updated_at: Date;'];

    const fields = Object.entries(config.fields)
      .map(([fieldName, fieldDef]) => {
        const tsType = getTypeScriptType(fieldDef);
        const optional = fieldDef.required !== true ? '?' : '';
        return `  ${fieldName}${optional}: ${tsType};`;
      })
      .join('\n');

    typeDefinitions.push(`export interface ${typeName} {`);
    typeDefinitions.push(coreFields.join('\n'));
    if (fields) {
      typeDefinitions.push(fields);
    }
    typeDefinitions.push('}');
    typeDefinitions.push('');
  }

  // Generate union types
  typeDefinitions.push('// Union Types');
  const collectionTypes = Object.values(fieldConfigs.collections)
    .map((config) => collectionTypeName(config))
    .join(' | ');
  if (collectionTypes) {
    typeDefinitions.push(`export type CollectionTypes = ${collectionTypes};`);
    typeDefinitions.push('');
  }

  const globalTypes = Object.values(fieldConfigs.globals)
    .map((config) => globalTypeName(config))
    .join(' | ');
  if (globalTypes) {
    typeDefinitions.push(`export type GlobalTypes = ${globalTypes};`);
    typeDefinitions.push('');
  }

  const blockTypes = Object.values(fieldConfigs.blocks)
    .map((config) => blockTypeName(config))
    .join(' | ');
  if (blockTypes) {
    typeDefinitions.push(`export type BlockTypes = ${blockTypes};`);
    typeDefinitions.push('');
  }

  // Add core table types
  typeDefinitions.push('// Core Table Types');
  typeDefinitions.push('export interface User {');
  typeDefinitions.push('  id: string;');
  typeDefinitions.push('  email: string;');
  typeDefinitions.push('  name?: string;');
  typeDefinitions.push('  password_hash: string;');
  typeDefinitions.push('  role: string;');
  typeDefinitions.push('  avatar?: string;');
  typeDefinitions.push('  image?: string;');
  typeDefinitions.push('  email_verified: boolean;');
  typeDefinitions.push('  status: string;');
  typeDefinitions.push('  last_login?: Date;');
  typeDefinitions.push('  // JSON-stringified preferences blob (date_format, locale, etc.).');
  typeDefinitions.push('  // Written by sailor-hooks; consumers read via JSON.parse.');
  typeDefinitions.push('  preferences?: string | null;');
  typeDefinitions.push('  created_at: Date;');
  typeDefinitions.push('  updated_at: Date;');
  typeDefinitions.push('}');
  typeDefinitions.push('');

  typeDefinitions.push('export interface File {');
  typeDefinitions.push('  id: string;');
  typeDefinitions.push('  name: string;');
  typeDefinitions.push('  original_name: string;');
  typeDefinitions.push('  mime_type: string;');
  typeDefinitions.push('  size: number;');
  typeDefinitions.push('  path: string;');
  typeDefinitions.push('  url?: string;');
  typeDefinitions.push('  width?: number;');
  typeDefinitions.push('  height?: number;');
  typeDefinitions.push('  alt_text?: string;');
  typeDefinitions.push('  alt?: string;');
  typeDefinitions.push('  description?: string;');
  typeDefinitions.push('  author: string;');
  typeDefinitions.push('  created_at: Date;');
  typeDefinitions.push('  updated_at: Date;');
  typeDefinitions.push('}');
  typeDefinitions.push('');

  typeDefinitions.push('export interface Tag {');
  typeDefinitions.push('  id: string;');
  typeDefinitions.push('  name: string;');
  typeDefinitions.push('  slug: string;');
  typeDefinitions.push('  color?: string;');
  typeDefinitions.push('  created_at: Date;');
  typeDefinitions.push('  updated_at: Date;');
  typeDefinitions.push('}');
  typeDefinitions.push('');

  typeDefinitions.push('export interface Settings {');
  typeDefinitions.push('  key: string;');
  typeDefinitions.push('  value: string;');
  typeDefinitions.push('  description?: string;');
  typeDefinitions.push('  category: string;');
  typeDefinitions.push('  source: string;');
  typeDefinitions.push('  created_at: Date;');
  typeDefinitions.push('  updated_at: Date;');
  typeDefinitions.push('}');
  typeDefinitions.push('');

  // Add collection definition types
  typeDefinitions.push('// Collection Definition Types');
  typeDefinitions.push('export interface CollectionDefinition {');
  typeDefinitions.push('  slug: string;');
  typeDefinitions.push('  name: { singular: string; plural: string };');
  typeDefinitions.push('  name_plural: string;');
  typeDefinitions.push('  description?: string;');
  typeDefinitions.push('  icon?: string;');
  typeDefinitions.push('  order?: number;');
  typeDefinitions.push(
    '  /** Override the generated TS interface name (defaults to `singular(slug)` PascalCased). */'
  );
  typeDefinitions.push('  typeName?: string;');
  typeDefinitions.push('  fields: Record<string, any>;');
  typeDefinitions.push('  options?: Record<string, any>;');
  typeDefinitions.push('}');
  typeDefinitions.push('');

  typeDefinitions.push('export interface GlobalDefinition {');
  typeDefinitions.push('  slug: string;');
  typeDefinitions.push('  name: { singular: string; plural: string };');
  typeDefinitions.push('  description?: string;');
  typeDefinitions.push('  icon?: string;');
  typeDefinitions.push('  order?: number;');
  typeDefinitions.push(
    '  /** Override the generated TS interface name (defaults to `singular(slug)` PascalCased + `Global` suffix). */'
  );
  typeDefinitions.push('  typeName?: string;');
  typeDefinitions.push('  data_type?: string;');
  typeDefinitions.push('  fields: Record<string, any>;');
  typeDefinitions.push('  options?: Record<string, any>;');
  typeDefinitions.push('}');
  typeDefinitions.push('');

  const typesContent = typeDefinitions.join('\n');
  const generatedDir = path.join(targetDir, 'src/lib/sailor/generated');
  if (!fs.existsSync(generatedDir)) {
    fs.mkdirSync(generatedDir, { recursive: true });
  }
  const typesPath = path.join(generatedDir, 'types.ts');
  fs.writeFileSync(typesPath, typesContent);
}

function getTypeScriptType(fieldDef) {
  const type = fieldDef.type || 'text';

  switch (type) {
    case 'text':
    case 'textarea':
    case 'wysiwyg':
    case 'email':
    case 'url':
    case 'slug':
    case 'password':
      return 'string';

    case 'number':
      return 'number';

    case 'checkbox':
      return 'boolean';

    case 'select':
    case 'radio':
      if (fieldDef.options && Array.isArray(fieldDef.options)) {
        const values = fieldDef.options
          .map((opt) => (typeof opt === 'object' ? `'${opt.value}'` : `'${opt}'`))
          .join(' | ');
        return values;
      }
      return 'string';

    case 'file':
      return 'string'; // File ID reference

    case 'relation':
      return 'string'; // Related entity ID

    case 'array':
      const itemType = fieldDef.items ? getTypeScriptType(fieldDef.items) : 'any';
      return `${itemType}[]`;

    case 'blocks':
      return 'any[]'; // Block array

    case 'date':
    case 'datetime':
      return 'Date';

    case 'json':
      return 'Record<string, any>';

    default:
      return 'any';
  }
}

function generateSettings(targetDir, { settings }) {
  const settingsContent = [
    '// Auto-generated settings for Sailor CMS',
    '// This file is automatically generated - do not edit manually',
    '',
    'export const settings = ' + JSON.stringify(settings || {}, null, 2) + ';',
    '',
    'export default settings;'
  ].join('\n');

  const generatedDir = path.join(targetDir, 'src/lib/sailor/generated');
  if (!fs.existsSync(generatedDir)) {
    fs.mkdirSync(generatedDir, { recursive: true });
  }
  const settingsPath = path.join(generatedDir, 'settings.ts');
  fs.writeFileSync(settingsPath, settingsContent);
}

// If called directly (not imported), run schema generation
if (import.meta.url === `file://${process.argv[1]}`) {
  generateSchema().catch((error) => {
    console.error('❌ Error generating schema:', error.message);
    process.exit(1);
  });
}
