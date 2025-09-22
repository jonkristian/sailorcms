// Base interface for database adapters
// This allows Sailor CMS to support multiple databases with clean separation

export type DatabaseType = 'sqlite' | 'postgres' | 'mysql' | 'mongodb';

export interface DatabaseConfig {
  type: DatabaseType;
  url?: string;
  authToken?: string;
  file?: string;
  // Future: host, port, database, etc.
}

export interface SchemaDefinition {
  tableName: string;
  fields: Record<string, FieldDefinition>;
  indexes?: IndexDefinition[];
  relations?: RelationDefinition[];
}

export interface FieldDefinition {
  type: 'text' | 'integer' | 'boolean' | 'timestamp' | 'uuid';
  primaryKey?: boolean;
  notNull?: boolean;
  unique?: boolean;
  default?: any;
  references?: { table: string; field: string };
}

export interface IndexDefinition {
  name: string;
  fields: string[];
  unique?: boolean;
}

export interface RelationDefinition {
  type: 'one-to-many' | 'many-to-one' | 'many-to-many';
  table: string;
  field: string;
  references: { table: string; field: string };
}

export interface DrizzleConfig {
  dialect: string;
  dbCredentials: Record<string, any>;
}

export abstract class DatabaseAdapter {
  protected config: DatabaseConfig;

  constructor(config: DatabaseConfig) {
    this.config = config;
  }

  // Connection and client management
  abstract createClient(): Promise<any>;
  abstract createDrizzleInstance(client: any, schema: any): any;

  // Configuration for drizzle-kit
  abstract getDrizzleConfig(): DrizzleConfig;

  // Schema generation - converts our schema definitions to database-specific syntax
  abstract generateTableDefinition(schema: SchemaDefinition): string;
  abstract generateFieldDefinition(name: string, field: FieldDefinition): string;
  abstract generateRelationDefinition(relation: RelationDefinition): string;

  // Database-specific imports for generated schema files
  abstract getImports(): string;

  // Migration support
  abstract runMigrations(db: any): Promise<void>;

  // Schema building helpers
  abstract getTableFunction(): string;
  abstract getPrimaryKeyDefinition(): string;
  abstract getTimestampDefinition(name: string): string;
  abstract getTextFieldDefinition(
    name: string,
    options?: { notNull?: boolean; unique?: boolean }
  ): string;
  abstract getIntegerFieldDefinition(
    name: string,
    options?: { notNull?: boolean; default?: number }
  ): string;

  // SQL function helpers for seeding
  abstract getUuidFunction(): string;
  abstract getCurrentTimestampFunction(): string;

  // Provider-specific table functions for schema definition
  abstract getTableFunctions(): Promise<{
    createTable: any;
    text: any;
    integer: any;
    index: any;
    uniqueIndex: any;
    timestamp?: any;
    uuid?: any;
  }>;

  // Utility methods
  getDatabaseType(): DatabaseType {
    return this.config.type;
  }

  getConfig(): DatabaseConfig {
    return this.config;
  }
}

// Factory function to get the right adapter
export function getDatabaseType(): DatabaseType {
  const dbProvider = process.env.DATABASE_PROVIDER || 'sqlite';

  if (!['sqlite', 'postgres', 'mysql', 'mongodb'].includes(dbProvider)) {
    console.warn(`Invalid DATABASE_PROVIDER: ${dbProvider}. Defaulting to sqlite.`);
    return 'sqlite';
  }

  return dbProvider as DatabaseType;
}

export function createDatabaseConfig(): DatabaseConfig {
  const type = getDatabaseType();

  switch (type) {
    case 'postgres':
      return {
        type: 'postgres',
        url: process.env.DATABASE_URL || 'postgresql://localhost:5432/sailor'
      };

    case 'mysql':
      return {
        type: 'mysql',
        url: process.env.DATABASE_URL || 'mysql://localhost:3306/sailor'
      };

    case 'sqlite':
    default:
      const dbUrl = process.env.DATABASE_URL || 'file:./sailor.sqlite';

      // Extract auth token from URL if present (for Turso)
      const authToken = process.env.DATABASE_AUTH_TOKEN;
      if (dbUrl.includes('?authToken=')) {
        const [url, token] = dbUrl.split('?authToken=');
        return {
          type: 'sqlite',
          url: url,
          authToken: token,
          file: url.startsWith('file:') ? url.replace('file:', '') : undefined
        };
      }

      return {
        type: 'sqlite',
        url: dbUrl,
        authToken: authToken,
        file: dbUrl.startsWith('file:') ? dbUrl.replace('file:', '') : undefined
      };
  }
}
