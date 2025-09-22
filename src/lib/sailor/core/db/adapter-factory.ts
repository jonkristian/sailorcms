// Factory for creating the appropriate database adapter
import { DatabaseAdapter, createDatabaseConfig, getDatabaseType } from './base-adapter';
import { SQLiteAdapter } from './adapters/sqlite';
import { PostgreSQLAdapter } from './adapters/postgres';

// Singleton adapter instance
let adapterInstance: DatabaseAdapter | null = null;

export async function createDatabaseAdapter(): Promise<DatabaseAdapter> {
  if (adapterInstance) {
    return adapterInstance;
  }

  const config = createDatabaseConfig();
  const type = getDatabaseType();

  switch (type) {
    case 'postgres':
      adapterInstance = new PostgreSQLAdapter(config);
      break;

    case 'sqlite':
    default:
      adapterInstance = new SQLiteAdapter(config);
      break;
  }

  return adapterInstance;
}

// Get the current adapter (must be created first)
export function getDatabaseAdapter(): DatabaseAdapter {
  if (!adapterInstance) {
    throw new Error('Database adapter not initialized. Call createDatabaseAdapter() first.');
  }
  return adapterInstance;
}

// Reset adapter (useful for testing)
export function resetDatabaseAdapter(): void {
  adapterInstance = null;
}
