// Database connection for CLI tools (no SvelteKit dependencies)
import * as schema from '../../generated/schema.js';
import { createDatabaseAdapter } from './adapter-factory.js';

// Ensure environment variables are loaded
import { config } from 'dotenv';
config();

// Create database connection for CLI usage
export async function createCLIDatabase() {
  const adapter = await createDatabaseAdapter();
  const client = await adapter.createClient();
  return adapter.createDrizzleInstance(client, schema);
}

// Export schema for CLI usage
export * from '../../generated/schema.js';