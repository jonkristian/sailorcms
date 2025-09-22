import { db } from '../db/index.server';
import { blockTypes, collectionTypes, globalTypes, roles } from '../db/index.server';
import { blockDefinitions } from '../../templates/blocks';
import { collectionDefinitions } from '../../templates/collections';
import { globalDefinitions } from '../../templates/globals';
import { CORE_FIELDS, BLOCK_CORE_FIELDS } from '../types';
import { sql, eq } from 'drizzle-orm';
import { SystemSettingsService } from '../services/system-settings.server';
import { createDatabaseAdapter } from '../db/adapter-factory';

// Get database adapter instance
let adapterInstance: any = null;
async function getAdapter() {
  if (!adapterInstance) {
    adapterInstance = await createDatabaseAdapter();
  }
  return adapterInstance;
}

// Helper function to merge core fields with template fields
function mergeWithCoreFields(
  templateFields: Record<string, any>,
  skipCoreFields = false
): Record<string, any> {
  if (skipCoreFields) {
    return templateFields;
  }

  const mergedFields: Record<string, any> = { ...CORE_FIELDS };

  // Add template fields, handling override syntax for core fields
  for (const [key, fieldDef] of Object.entries(templateFields)) {
    if (key in CORE_FIELDS) {
      // Handle override syntax for core fields
      if (fieldDef.override) {
        const { override, ui, ...otherProps } = fieldDef;
        mergedFields[key] = {
          ...(CORE_FIELDS as any)[key],
          ...override,
          core: true,
          ...(ui && { ui }),
          ...otherProps
        };
      } else {
        // Legacy: direct override (deprecated)
        mergedFields[key] = { ...(CORE_FIELDS as any)[key], ...fieldDef, core: true };
      }
    } else {
      mergedFields[key] = fieldDef;
    }
  }

  return mergedFields;
}

// Helper function to merge block core fields with template fields
function mergeWithBlockCoreFields(templateFields: Record<string, any>): Record<string, any> {
  const mergedFields: Record<string, any> = { ...BLOCK_CORE_FIELDS };

  // Add template fields, handling override syntax for core fields
  for (const [key, fieldDef] of Object.entries(templateFields)) {
    if (key in BLOCK_CORE_FIELDS) {
      // Handle override syntax for core fields
      if (fieldDef.override) {
        const { override, ui, ...otherProps } = fieldDef;
        mergedFields[key] = {
          ...(BLOCK_CORE_FIELDS as any)[key],
          ...override,
          core: true,
          ...(ui && { ui }),
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

// Seed roles first
export async function seedRoles() {
  try {
    const adapter = await getAdapter();
    const uuidSql = sql.raw(adapter.getUuidFunction());
    const timestampSql = sql.raw(adapter.getCurrentTimestampFunction());

    await db.transaction(async (tx: any) => {
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
    const adapter = await getAdapter();
    const uuidSql = sql.raw(adapter.getUuidFunction());
    const timestampSql = sql.raw(adapter.getCurrentTimestampFunction());

    await db.transaction(async (tx: any) => {
      // Get existing block types
      const existingBlockTypes = await tx.select().from(blockTypes);
      const existingSlugs = new Set(existingBlockTypes.map((bt: any) => bt.slug));

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
        if (!Object.prototype.hasOwnProperty.call(blockDefinitions, existingSlug as string)) {
          await tx.delete(blockTypes).where(eq(blockTypes.slug, existingSlug as string));
        }
      }

      // Get existing collection types
      const existingCollectionTypes = await tx.select().from(collectionTypes);
      const existingCollectionSlugs = new Set(existingCollectionTypes.map((ct: any) => ct.slug));

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
        if (!Object.prototype.hasOwnProperty.call(collectionDefinitions, existingSlug as string)) {
          await tx.delete(collectionTypes).where(eq(collectionTypes.slug, existingSlug as string));
        }
      }

      // Get existing global types
      const existingGlobalTypes = await tx.select().from(globalTypes);
      const existingGlobalSlugs = new Set(existingGlobalTypes.map((gt: any) => gt.slug));

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
        if (!Object.prototype.hasOwnProperty.call(globalDefinitions, existingSlug as string)) {
          await tx.delete(globalTypes).where(eq(globalTypes.slug, existingSlug as string));
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
export async function getRoleIdByName(roleName: string): Promise<string | null> {
  const role = await db.query.roles.findFirst({
    where: (roles: any, { eq }: any) => eq(roles.name, roleName)
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

    // Sync settings from environment variables (always run during db:update)
    try {
      console.log('⚙️  Syncing settings from environment variables...');
      await SystemSettingsService.initializeFromEnv();
      console.log('✅ Settings synced from environment variables');
    } catch (error) {
      console.warn(
        '⚠️  Settings sync failed (this is normal if no environment variables are set):',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }

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
