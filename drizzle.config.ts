import { defineConfig } from 'drizzle-kit';
import { createDatabaseConfig, getDatabaseType } from './src/lib/sailor/core/db/base-adapter';

// Get database configuration using adapter pattern
const dbType = getDatabaseType();
const config = createDatabaseConfig();

// Create drizzle config based on database type
let drizzleConfig;

switch (dbType) {
  case 'postgres': {
    drizzleConfig = {
      dialect: 'postgresql' as const,
      dbCredentials: {
        url: config.url
      }
    };
    break;
  }

  case 'sqlite':
  default: {
    // Use Turso dialect for remote SQLite (with auth token), sqlite for local files
    if (config.authToken || config.url?.includes('libsql://')) {
      // Remote Turso database
      const dbUrl = config.url || `file:./${config.file}`;
      drizzleConfig = {
        dialect: 'turso' as const,
        dbCredentials: {
          url: dbUrl,
          authToken: config.authToken
        }
      };
    } else {
      // Local SQLite file
      const dbPath = config.file || 'sailor.sqlite';
      // Use absolute path for drizzle studio
      const absolutePath = dbPath.startsWith('/') ? dbPath : `./${dbPath}`;
      drizzleConfig = {
        dialect: 'sqlite' as const,
        dbCredentials: {
          url: absolutePath
        }
      };
    }
    break;
  }
}

export default defineConfig({
  schema: './src/lib/sailor/generated/schema.ts',
  out: './drizzle',
  ...drizzleConfig
});
