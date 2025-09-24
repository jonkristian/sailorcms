// Database seeding tool
import { sql, eq } from 'drizzle-orm';
import crypto from 'crypto';
import { getConsumerSchemaOrFail } from '../utils.js';
import { pathToFileURL } from 'url';
import { existsSync } from 'fs';
import path from 'path';
import { createCliDbOrFail } from '../utils.js';

let db = null;
let roles, blockTypes, collectionTypes, globalTypes;
let blockDefinitions, collectionDefinitions, globalDefinitions, settings;
let CORE_FIELDS, BLOCK_CORE_FIELDS;
async function getDb() {
  if (db) return db;
  const targetDir = process.cwd();
  db = await createCliDbOrFail(targetDir);
  const schema = await getConsumerSchemaOrFail(targetDir);
  roles = schema.roles;
  blockTypes = schema.blockTypes;
  collectionTypes = schema.collectionTypes;
  globalTypes = schema.globalTypes;

  // Load template definitions from consumer project only; abort if missing
  const templatesDir = path.join(targetDir, 'src', 'lib', 'sailor', 'templates');
  if (!existsSync(templatesDir)) {
    throw new Error(
      'Sailor templates not found in your project (src/lib/sailor/templates). Run "npx sailor core:init" first.'
    );
  }

  async function tryImportTemplates() {
    // Templates are always TypeScript files
    function getTemplatePath(relativePath) {
      const tsPath = path.join(templatesDir, relativePath + '.ts');

      if (existsSync(tsPath)) {
        return pathToFileURL(tsPath).href;
      } else {
        throw new Error(`Template file not found: ${tsPath}`);
      }
    }

    const consumerBlocks = getTemplatePath('blocks/index');
    const consumerCollections = getTemplatePath('collections/index');
    const consumerGlobals = getTemplatePath('globals/index');
    const consumerSettings = getTemplatePath('settings');

    const [b, c, g, s] = await Promise.all([
      import(consumerBlocks),
      import(consumerCollections),
      import(consumerGlobals),
      import(consumerSettings)
    ]);
    return {
      blockDefinitions: b.blockDefinitions,
      collectionDefinitions: c.collectionDefinitions,
      globalDefinitions: g.globalDefinitions,
      settings: s.settings
    };
  }

  const t = await tryImportTemplates();
  blockDefinitions = t.blockDefinitions;
  collectionDefinitions = t.collectionDefinitions;
  globalDefinitions = t.globalDefinitions;
  settings = t.settings;

  // Load core field definitions from consumer project
  const coreTypesPath = path.join(targetDir, 'src', 'lib', 'sailor', 'core', 'types.ts');

  if (!existsSync(coreTypesPath)) {
    throw new Error(
      'Core types not found in app (src/lib/sailor/core/types.ts). Run "npx sailor core:init" first.'
    );
  }
  const coreTypesMod = await import(pathToFileURL(coreTypesPath).href);
  CORE_FIELDS = coreTypesMod.CORE_FIELDS;
  BLOCK_CORE_FIELDS = coreTypesMod.BLOCK_CORE_FIELDS;
  return db;
}

// Helper function to merge core fields with template fields
function mergeWithCoreFields(templateFields, skipCoreFields = false) {
  if (skipCoreFields) {
    return templateFields;
  }

  const mergedFields = { ...CORE_FIELDS };

  // Add template fields, handling override syntax for core fields
  for (const [key, fieldDef] of Object.entries(templateFields)) {
    if (key in CORE_FIELDS) {
      // Handle override syntax for core fields
      if (fieldDef.override) {
        const { override, ui, ...otherProps } = fieldDef;
        mergedFields[key] = {
          ...CORE_FIELDS[key],
          ...override,
          core: true,
          ...(ui && { ui }),
          ...otherProps
        };
      } else {
        // Legacy: direct override (deprecated)
        mergedFields[key] = { ...CORE_FIELDS[key], ...fieldDef, core: true };
      }
    } else {
      mergedFields[key] = fieldDef;
    }
  }

  return mergedFields;
}

// Helper function to merge block core fields with template fields
function mergeWithBlockCoreFields(templateFields) {
  const mergedFields = { ...BLOCK_CORE_FIELDS };

  // Add template fields, handling override syntax for core fields
  for (const [key, fieldDef] of Object.entries(templateFields)) {
    if (key in BLOCK_CORE_FIELDS) {
      // Handle override syntax for core fields
      if (fieldDef.override) {
        const { override, ui, ...otherProps } = fieldDef;
        mergedFields[key] = {
          ...BLOCK_CORE_FIELDS[key],
          ...override,
          core: true,
          ...(ui && { ui }),
          ...otherProps
        };
      } else {
        // Legacy: direct override (deprecated)
        mergedFields[key] = { ...BLOCK_CORE_FIELDS[key], ...fieldDef, core: true };
      }
    } else {
      mergedFields[key] = fieldDef;
    }
  }

  return mergedFields;
}

// Seed roles first
export async function seedRoles() {
  try {
    const database = await getDb();

    await database.transaction(async (tx) => {
      // Create default roles
      const defaultRoles = [
        {
          name: 'admin',
          permissions: JSON.stringify(['*']) // All permissions
        },
        {
          name: 'editor',
          permissions: JSON.stringify(['read', 'write', 'publish'])
        },
        {
          name: 'viewer',
          permissions: JSON.stringify(['read'])
        }
      ];

      for (const roleData of defaultRoles) {
        const now = new Date();
        await tx
          .insert(roles)
          .values({
            id: crypto.randomUUID(),
            name: roleData.name,
            permissions: roleData.permissions,
            created_at: now,
            updated_at: now
          })
          .onConflictDoUpdate({
            target: roles.name,
            set: {
              permissions: roleData.permissions,
              updated_at: now
            }
          });
      }
    });

    console.log('✓ Roles seeded successfully');
  } catch (error) {
    console.error('✗ Error seeding roles:', error);
    throw error;
  }
}

// Seed registry tables
export async function seedRegistry() {
  try {
    const database = await getDb();

    await database.transaction(async (tx) => {
      // Get existing block types
      const existingBlockTypes = await tx.select({ slug: blockTypes.slug }).from(blockTypes);
      const existingSlugs = new Set(existingBlockTypes.map((bt) => bt.slug));

      // Seed block types
      for (const [slug, definition] of Object.entries(blockDefinitions)) {
        const mergedFields = mergeWithBlockCoreFields(definition.fields || {});
        const fields = JSON.stringify(mergedFields);
        const now = new Date();
        await tx
          .insert(blockTypes)
          .values({
            id: crypto.randomUUID(),
            name: definition.name,
            slug,
            description: definition.description || '',
            schema: fields,
            created_at: now,
            updated_at: now
          })
          .onConflictDoUpdate({
            target: blockTypes.slug,
            set: {
              name: definition.name,
              description: definition.description || '',
              schema: fields,
              updated_at: now
            }
          });
      }

      // Remove block types that no longer exist
      for (const existingSlug of existingSlugs) {
        if (!Object.prototype.hasOwnProperty.call(blockDefinitions, existingSlug)) {
          await tx.delete(blockTypes).where(eq(blockTypes.slug, existingSlug));
        }
      }

      // Get existing collection types
      const existingCollectionTypes = await tx
        .select({ slug: collectionTypes.slug })
        .from(collectionTypes);
      const existingCollectionSlugs = new Set(existingCollectionTypes.map((ct) => ct.slug));

      // Seed collection types
      for (const [slug, definition] of Object.entries(collectionDefinitions)) {
        const mergedFields = mergeWithCoreFields(definition.fields || {});
        const fields = JSON.stringify(mergedFields);
        const options = JSON.stringify(definition.options || {});
        const now = new Date();
        await tx
          .insert(collectionTypes)
          .values({
            id: crypto.randomUUID(),
            name_singular: definition.name.singular,
            name_plural: definition.name.plural,
            slug,
            description: definition.description || '',
            icon: definition.icon || null,
            schema: fields,
            options,
            created_at: now,
            updated_at: now
          })
          .onConflictDoUpdate({
            target: collectionTypes.slug,
            set: {
              name_singular: definition.name.singular,
              name_plural: definition.name.plural,
              description: definition.description || '',
              icon: definition.icon || null,
              schema: fields,
              options,
              updated_at: now
            }
          });
      }

      // Remove collection types that no longer exist
      for (const existingSlug of existingCollectionSlugs) {
        if (!Object.prototype.hasOwnProperty.call(collectionDefinitions, existingSlug)) {
          await tx.delete(collectionTypes).where(eq(collectionTypes.slug, existingSlug));
        }
      }

      // Get existing global types
      const existingGlobalTypes = await tx.select({ slug: globalTypes.slug }).from(globalTypes);
      const existingGlobalSlugs = new Set(existingGlobalTypes.map((gt) => gt.slug));

      // Seed global types
      for (const [slug, definition] of Object.entries(globalDefinitions)) {
        const skipCoreFields = definition.dataType === 'flat';
        const isFlat = definition.dataType === 'flat';
        const mergedFields = mergeWithCoreFields(definition.fields || {}, skipCoreFields);
        const fields = JSON.stringify(mergedFields);
        const options = JSON.stringify(definition.options || {});
        const now = new Date();
        await tx
          .insert(globalTypes)
          .values({
            id: crypto.randomUUID(),
            name_singular: definition.name.singular,
            name_plural: definition.name.plural,
            slug,
            description: definition.description || '',
            icon: definition.icon || null,
            data_type: definition.dataType,
            schema: fields,
            options,
            created_at: now,
            updated_at: now
          })
          .onConflictDoUpdate({
            target: globalTypes.slug,
            set: {
              name_singular: definition.name.singular,
              name_plural: definition.name.plural,
              description: definition.description || '',
              icon: definition.icon || null,
              schema: fields,
              options,
              updated_at: now
            }
          });
      }

      // Remove global types that no longer exist
      for (const existingSlug of existingGlobalSlugs) {
        if (!Object.prototype.hasOwnProperty.call(globalDefinitions, existingSlug)) {
          await tx.delete(globalTypes).where(eq(globalTypes.slug, existingSlug));
        }
      }
    });

    console.log('✓ Registry tables seeded successfully');
  } catch (error) {
    console.error('✗ Error seeding registry tables:', error);
    throw error;
  }
}

// Function to get role ID by name
export async function getRoleIdByName(roleName) {
  const database = await getDb();
  const result = await database.get(sql`select id from roles where name = ${roleName}`);
  return result?.id || null;
}

// Main seed function that runs everything
export async function seedAll() {
  try {
    console.log('🌱 Starting database seeding...');

    // Seed roles first
    await seedRoles();

    // Then seed registry
    await seedRegistry();

    console.log('✅ All seeding completed successfully');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    throw error;
  }
}

// Run if this file is executed directly (use more reliable detection)
if (process.argv[1] && process.argv[1].endsWith('db-seed.js')) {
  seedAll()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('✗ Error:', error);
      process.exit(1);
    });
}
