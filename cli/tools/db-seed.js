// Import CLI database connection (no SvelteKit dependencies)
import { createCLIDatabase, blockTypes, collectionTypes, globalTypes, roles } from '../../src/lib/sailor/core/db/cli.js';
import { blockDefinitions } from '../../src/lib/sailor/templates/blocks/index.js';
import { collectionDefinitions } from '../../src/lib/sailor/templates/collections/index.js';
import { globalDefinitions } from '../../src/lib/sailor/templates/globals/index.js';
import { CORE_FIELDS, BLOCK_CORE_FIELDS } from '../../src/lib/sailor/core/types.js';
import { sql, eq } from 'drizzle-orm';
import { createDatabaseAdapter } from '../../src/lib/sailor/core/db/adapter-factory.js';

// Create database connection for seeding (CLI context)
let db = null;
async function getDb() {
  if (!db) {
    db = await createCLIDatabase();
  }
  return db;
}

// Helper function to merge core fields with template fields
function mergeWithCoreFields(
  templateFields,
  skipCoreFields = false
) {
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
          ...(CORE_FIELDS)[key],
          ...override,
          core: true,
          ...(ui && { ui }),
          ...otherProps
        };
      } else {
        // Legacy: direct override (deprecated)
        mergedFields[key] = { ...(CORE_FIELDS)[key], ...fieldDef, core: true };
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
          ...(BLOCK_CORE_FIELDS)[key],
          ...override,
          core: true,
          ...(ui && { ui }),
          ...otherProps
        };
      } else {
        // Legacy: direct override (deprecated)
        mergedFields[key] = { ...(BLOCK_CORE_FIELDS)[key], ...fieldDef, core: true };
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
    const adapter = await createDatabaseAdapter();
    const database = await getDb();
    const uuidSql = sql.raw(adapter.getUuidFunction());
    const timestampSql = sql.raw(adapter.getCurrentTimestampFunction());

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
        await tx
          .insert(roles)
          .values({
            id: uuidSql,
            name: roleData.name,
            permissions: roleData.permissions,
            created_at: timestampSql,
            updated_at: timestampSql
          })
          .onConflictDoUpdate({
            target: roles.name,
            set: {
              permissions: roleData.permissions,
              updated_at: timestampSql
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
    const adapter = await createDatabaseAdapter();
    const database = await getDb();
    const uuidSql = sql.raw(adapter.getUuidFunction());
    const timestampSql = sql.raw(adapter.getCurrentTimestampFunction());

    await database.transaction(async (tx) => {
      // Get existing block types
      const existingBlockTypes = await tx.select().from(blockTypes);
      const existingSlugs = new Set(existingBlockTypes.map((bt) => bt.slug));

      // Seed block types
      for (const [slug, definition] of Object.entries(blockDefinitions)) {
        const mergedFields = mergeWithBlockCoreFields(definition.fields || {});
        const fields = JSON.stringify(mergedFields);
        await tx
          .insert(blockTypes)
          .values({
            id: uuidSql,
            name: definition.name,
            slug,
            description: definition.description || '',
            schema: fields,
            created_at: timestampSql,
            updated_at: timestampSql
          })
          .onConflictDoUpdate({
            target: blockTypes.slug,
            set: {
              name: definition.name,
              description: definition.description || '',
              schema: fields,
              updated_at: timestampSql
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
      const existingCollectionTypes = await tx.select().from(collectionTypes);
      const existingCollectionSlugs = new Set(existingCollectionTypes.map((ct) => ct.slug));

      // Seed collection types
      for (const [slug, definition] of Object.entries(collectionDefinitions)) {
        const mergedFields = mergeWithCoreFields(definition.fields || {});
        const fields = JSON.stringify(mergedFields);
        const options = JSON.stringify(definition.options || {});
        await tx
          .insert(collectionTypes)
          .values({
            id: uuidSql,
            name_singular: definition.name.singular,
            name_plural: definition.name.plural,
            slug,
            description: definition.description || '',
            icon: definition.icon || null,
            schema: fields,
            options,
            created_at: timestampSql,
            updated_at: timestampSql
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
              updated_at: timestampSql
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
      const existingGlobalTypes = await tx.select().from(globalTypes);
      const existingGlobalSlugs = new Set(existingGlobalTypes.map((gt) => gt.slug));

      // Seed global types
      for (const [slug, definition] of Object.entries(globalDefinitions)) {
        const skipCoreFields = definition.dataType === 'flat';
        const isFlat = definition.dataType === 'flat';
        const mergedFields = mergeWithCoreFields(definition.fields || {}, skipCoreFields);
        const fields = JSON.stringify(mergedFields);
        const options = JSON.stringify(definition.options || {});
        await tx
          .insert(globalTypes)
          .values({
            id: uuidSql,
            name_singular: definition.name.singular,
            name_plural: definition.name.plural,
            slug,
            description: definition.description || '',
            icon: definition.icon || null,
            data_type: definition.dataType,
            schema: fields,
            options,
            created_at: timestampSql,
            updated_at: timestampSql
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
              updated_at: timestampSql
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
  const role = await database.query.roles.findFirst({
    where: (roles, { eq }) => eq(roles.name, roleName)
  });
  return role?.id || null;
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

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedAll()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('✗ Error:', error);
      process.exit(1);
    });
}
