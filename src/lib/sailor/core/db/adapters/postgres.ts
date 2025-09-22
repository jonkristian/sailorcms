// PostgreSQL database adapter for Sailor CMS
import {
  DatabaseAdapter,
  type DatabaseConfig,
  type SchemaDefinition,
  type FieldDefinition,
  type DrizzleConfig
} from '../base-adapter';

export class PostgreSQLAdapter extends DatabaseAdapter {
  constructor(config: DatabaseConfig) {
    super(config);
  }

  async createClient(): Promise<any> {
    const { Pool } = await import('pg');

    return new Pool({
      connectionString: this.config.url
    });
  }

  async createDrizzleInstance(client: any, schema: any): Promise<any> {
    const { drizzle } = await import('drizzle-orm/node-postgres');
    return drizzle(client, { schema });
  }

  getDrizzleConfig(): DrizzleConfig {
    return {
      dialect: 'postgresql',
      dbCredentials: {
        connectionString: this.config.url
      }
    };
  }

  async runMigrations(db: any): Promise<void> {
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    await migrate(db, { migrationsFolder: './drizzle' });
  }

  getImports(): string {
    return `import { pgTable, text, integer, index, uniqueIndex, timestamp, uuid } from 'drizzle-orm/pg-core';`;
  }

  getTableFunction(): string {
    return 'pgTable';
  }

  getPrimaryKeyDefinition(): string {
    return `uuid('id').primaryKey().defaultRandom()`;
  }

  getTimestampDefinition(name: string): string {
    return `timestamp('${name}').defaultNow().notNull()`;
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
    return `gen_random_uuid()`;
  }

  getCurrentTimestampFunction(): string {
    return `now()`;
  }

  async getTableFunctions() {
    const { pgTable, text, integer, index, uniqueIndex, timestamp, uuid } = await import(
      'drizzle-orm/pg-core'
    );
    return {
      createTable: pgTable,
      text,
      integer,
      index,
      uniqueIndex,
      timestamp,
      uuid
    };
  }

  generateTableDefinition(schema: SchemaDefinition): string {
    const fields = Object.entries(schema.fields)
      .map(([name, field]) => `    ${this.generateFieldDefinition(name, field)}`)
      .join(',\n');

    let table = `export const ${schema.tableName} = pgTable('${schema.tableName}', {\n${fields}\n}`;

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
        return `${name}: uuid('${name}')`;

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
    // PostgreSQL relations are the same as other SQL databases in Drizzle
    return `// Relations handled by Drizzle relations() function`;
  }
}
