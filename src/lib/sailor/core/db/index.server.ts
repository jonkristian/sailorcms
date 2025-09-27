import * as schema from '../../generated/schema';
import { createDatabaseAdapter } from './adapter-factory';

// Ensure environment variables are loaded
import { config } from 'dotenv';
config();

// Create database connection using adapter pattern
async function createDatabaseConnection() {
  const adapter = await createDatabaseAdapter();
  const client = await adapter.createClient();
  return adapter.createDrizzleInstance(client, schema);
}

// Create the database instance synchronously for Better Auth
// Check SvelteKit environment for build detection
import { building } from '$app/environment';

// Only create database connection when not building
let db: any;
if (!building) {
  db = await createDatabaseConnection();

  // Initialize template settings on startup
  try {
    const { SystemSettingsService } = await import('../services/system-settings.server');
    await SystemSettingsService.loadTemplateSettings();
  } catch (error) {
    console.warn('Warning: Failed to load template settings on startup:', error);
  }
}

export { db };

// Get database instance (for other uses)
export async function getDb() {
  return db;
}

// Export schema tables for server-side use
export * from '../../generated/schema';

// Migration function
export async function runMigrations() {
  try {
    console.log('Running database migrations...');
    const adapter = await createDatabaseAdapter();
    await adapter.runMigrations(db);
    console.log('✓ Database migrations completed successfully');
  } catch (error) {
    console.error('✗ Error running migrations:', error);
    throw error;
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('✗ Error:', error);
      process.exit(1);
    });
}
