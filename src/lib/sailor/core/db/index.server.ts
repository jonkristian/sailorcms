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

// Create the database instance with lazy initialization to avoid top-level await
let dbInstance: any = null;
let dbPromise: Promise<any> | null = null;

async function initializeDatabase() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const connection = await createDatabaseConnection();

      // Set dbInstance FIRST so the db proxy works
      dbInstance = connection;

      // Initialize template settings and environment variables on startup
      try {
        const { SystemSettingsService } = await import('../services/settings.server');
        await SystemSettingsService.loadTemplateSettings();
        await SystemSettingsService.initializeFromEnv();
      } catch (error) {
        console.warn('Warning: Failed to load settings on startup:', error);
      }

      return connection;
    })();
  }
  return dbPromise;
}

// Proxy to handle lazy initialization
const db = new Proxy({} as any, {
  get(target, prop) {
    if (!dbInstance) {
      throw new Error('Database not initialized. Call initializeDatabase() first or use getDb().');
    }
    return dbInstance[prop];
  }
});

export { db, initializeDatabase };

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
