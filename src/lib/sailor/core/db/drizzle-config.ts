import { defineConfig, type Config } from 'drizzle-kit';
import { createDatabaseConfig, getDatabaseType } from './base-adapter';

export interface SailorDrizzleConfigOptions {
  /** Path to the generated schema. Default: `./src/lib/sailor/generated/schema.ts` */
  schema?: string;
  /** Migrations output directory. Default: `./drizzle` */
  out?: string;
  /**
   * Additional drizzle-kit tablesFilter entries to merge with sailor's defaults.
   * Sailor excludes `search_index_fts*` (FTS5 virtual + shadow tables) automatically.
   */
  tablesFilter?: string[];
}

/**
 * Build a drizzle-kit config for a Sailor CMS project. Consumers should
 * use this from their `drizzle.config.ts`:
 *
 * ```ts
 * import { sailorDrizzleConfig } from './src/lib/sailor/core/db/drizzle-config';
 * export default sailorDrizzleConfig();
 * ```
 *
 * Dialect, credentials, and filters stay inside the library so bug fixes and
 * new filters propagate via `core:update` without touching the user's file.
 */
export function sailorDrizzleConfig(options: SailorDrizzleConfigOptions = {}): Config {
  const dbType = getDatabaseType();
  const config = createDatabaseConfig();

  const tablesFilter = [
    // FTS5 virtual table + its internal shadow tables are created at runtime
    // by SearchIndexService, not declared in the drizzle schema. Excluding
    // them stops drizzle-kit pull/diff from prompting about "extra" tables.
    '!search_index_fts',
    '!search_index_fts_*',
    ...(options.tablesFilter ?? [])
  ];

  const base = {
    schema: options.schema ?? './src/lib/sailor/generated/schema.ts',
    out: options.out ?? './drizzle',
    tablesFilter
  };

  switch (dbType) {
    case 'postgres':
      return defineConfig({
        ...base,
        dialect: 'postgresql',
        dbCredentials: { url: config.url ?? '' }
      });

    case 'sqlite':
    default: {
      if (config.authToken || config.url?.includes('libsql://')) {
        return defineConfig({
          ...base,
          dialect: 'turso',
          dbCredentials: {
            url: config.url ?? `file:./${config.file}`,
            authToken: config.authToken
          }
        });
      }

      const dbPath = config.file;
      if (!dbPath) {
        throw new Error(
          'DATABASE_URL must be configured for SQLite (e.g. DATABASE_URL=file:./db/sailor.sqlite)'
        );
      }
      const absolutePath = dbPath.startsWith('/') ? dbPath : `./${dbPath}`;
      return defineConfig({
        ...base,
        dialect: 'sqlite',
        dbCredentials: { url: absolutePath }
      });
    }
  }
}
