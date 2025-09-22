// SQLite database adapter for Sailor CMS
import {
  DatabaseAdapter,
  type DatabaseConfig,
  type SchemaDefinition,
  type FieldDefinition,
  type DrizzleConfig
} from '../base-adapter';

export class SQLiteAdapter extends DatabaseAdapter {
  constructor(config: DatabaseConfig) {
    super(config);
  }

  async createClient(): Promise<any> {
    const { createClient } = await import('@libsql/client');

    if (this.config.url) {
      // Remote database (Turso, etc.)
      return createClient({
        url: this.config.url,
        authToken: this.config.authToken
      });
    } else {
      // Local SQLite file - import Node.js modules dynamically
      const [{ default: fs }, { join, dirname }] = await Promise.all([import('fs'), import('path')]);

      const DB_PATH = join(process.cwd(), this.config.file!);
      const localUrl = `file:${DB_PATH}`;

      // Ensure database directory exists
      const dbDir = dirname(DB_PATH);
      if (!fs.existsSync(dbDir)) {
        console.log(`Creating database directory: ${dbDir}`);
        fs.mkdirSync(dbDir, { recursive: true });
      }

      // Ensure database file exists
      if (!fs.existsSync(DB_PATH)) {
        console.log('Creating new SQLite database file...');
        fs.writeFileSync(DB_PATH, '');
      }

      return createClient({
        url: localUrl,
        authToken: this.config.authToken
      });
    }
  }

  async createDrizzleInstance(client: any, schema: any): Promise<any> {
    const { drizzle } = await import('drizzle-orm/libsql');
    const db = drizzle(client, { schema });
    // Apply local SQLite tuning pragmas to reduce SQLITE_BUSY and improve concurrency
    try {
      // For local files, this.config.url is not set; remote URLs (Turso) should skip PRAGMAs
      if (!this.config.url) {
        const { sql } = await import('drizzle-orm');
        // Enable write-ahead logging and set a small busy timeout for dev
        await db.run(sql`PRAGMA journal_mode = WAL`);
        await db.run(sql`PRAGMA busy_timeout = 3000`);
      }
    } catch (e) {
      console.warn('SQLite PRAGMA setup skipped/failed:', e);
    }
    return db;
  }

  getDrizzleConfig(): DrizzleConfig {
    const dbUrl = this.config.url || `file:./${this.config.file}`;

    return {
      dialect: 'turso',
      dbCredentials: {
        url: dbUrl,
        authToken: this.config.authToken
      }
    };
  }

  async runMigrations(db: any): Promise<void> {
    const { migrate } = await import('drizzle-orm/libsql/migrator');
    await migrate(db, { migrationsFolder: './drizzle' });
  }

  getImports(): string {
    return `import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';`;
  }

  getTableFunction(): string {
    return 'sqliteTable';
  }

  getPrimaryKeyDefinition(): string {
    return `text('id').primaryKey().notNull().$defaultFn(() => crypto.randomUUID())`;
  }

  getTimestampDefinition(name: string): string {
    return `integer('${name}', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())`;
  }

  getTextFieldDefinition(
    name: string,
    options: { notNull?: boolean; unique?: boolean } = {}
  ): string {
    let definition = `text('${name}')`;

    if (options.notNull) definition += '.notNull()';
    if (options.unique) definition += '.unique()';

    return definition;
  }

  getIntegerFieldDefinition(
    name: string,
    options: { notNull?: boolean; default?: number } = {}
  ): string {
    let definition = `integer('${name}')`;

    if (options.notNull) definition += '.notNull()';
    if (options.default !== undefined) definition += `.default(${options.default})`;

    return definition;
  }

  getUuidFunction(): string {
    return `(lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random() % 4) + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))))`;
  }

  getCurrentTimestampFunction(): string {
    return `datetime('now')`;
  }

  async getTableFunctions() {
    const { sqliteTable, text, integer, index, uniqueIndex } = await import(
      'drizzle-orm/sqlite-core'
    );
    return {
      createTable: sqliteTable,
      text,
      integer,
      index,
      uniqueIndex
    };
  }

  generateTableDefinition(schema: SchemaDefinition): string {
    const fields = Object.entries(schema.fields)
      .map(([name, field]) => `    ${this.generateFieldDefinition(name, field)}`)
      .join(',\n');

    let table = `export const ${schema.tableName} = sqliteTable('${schema.tableName}', {\n${fields}\n}`;

    // Add indexes if any
    if (schema.indexes && schema.indexes.length > 0) {
      const indexes = schema.indexes
        .map((idx) => {
          const indexFn = idx.unique ? 'uniqueIndex' : 'index';
          const fields = idx.fields.map((f) => `table.${f}`).join(', ');
          return `    ${indexFn}('${idx.name}').on(${fields})`;
        })
        .join(',\n');

      table += `, (table) => [\n${indexes}\n]`;
    }

    table += ');';
    return table;
  }

  generateFieldDefinition(name: string, field: FieldDefinition): string {
    switch (field.type) {
      case 'uuid':
        if (field.primaryKey) {
          return `${name}: ${this.getPrimaryKeyDefinition()}`;
        }
        return `${name}: text('${name}')`;

      case 'timestamp':
        return `${name}: ${this.getTimestampDefinition(name)}`;

      case 'integer':
        return `${name}: ${this.getIntegerFieldDefinition(name, {
          notNull: field.notNull,
          default: field.default
        })}`;

      case 'text':
      default:
        return `${name}: ${this.getTextFieldDefinition(name, {
          notNull: field.notNull,
          unique: field.unique
        })}`;
    }
  }

  generateRelationDefinition(relation: any): string {
    // SQLite relations are the same as other SQL databases in Drizzle
    return `// Relations handled by Drizzle relations() function`;
  }
}
