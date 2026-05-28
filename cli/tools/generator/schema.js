// New, clean schema generator with explicit metadata tracking

import { MetadataCollector } from './core/metadata-collector.js';
import { TableGenerator } from './core/tables.js';
import { RelationGenerator } from './core/relations.js';
import { CoreGenerator } from './core/core.js';
import { GlobalGenerator } from './entities/globals.js';
import { CollectionGenerator } from './entities/collections.js';
import { BlockGenerator } from './entities/blocks.js';

export class SchemaGenerator {
  constructor(adapter, definitions, coreFields, stringUtils) {
    this.adapter = adapter;
    this.definitions = definitions;
    this.coreFields = coreFields;

    // Core components
    this.metadata = new MetadataCollector();
    this.tableGen = new TableGenerator(adapter, this.metadata);
    this.relationGen = new RelationGenerator(this.metadata);
    this.coreGen = new CoreGenerator(adapter, this.getUserRoles());

    // Entity generators
    this.globalGen = new GlobalGenerator(this.tableGen, stringUtils);
    this.collectionGen = new CollectionGenerator(this.tableGen, stringUtils);
    this.blockGen = new BlockGenerator(this.tableGen, stringUtils);

    // Storage for generated tables
    this.allTables = [];
  }

  /**
   * Generate complete schema content
   */
  async generateSchema() {
    try {
      // Generate all tables
      await this.generateAllTables();

      // Validate relations now that all tables are registered
      // this.metadata.validateRelations(); // TODO: Implement if needed

      // Generate schema content
      const content = await this.buildSchemaContent();

      return content;
    } catch (error) {
      console.error('❌ Schema generation failed:', error.message);
      throw error;
    }
  }

  /**
   * Generate all entity tables
   */
  async generateAllTables() {
    // Generate core tables first so they're available for relations
    await this.generateCoreTablesMetadata();

    // Generate globals
    this.generateGlobalTables();

    // Generate collections
    this.generateCollectionTables();

    // Generate blocks
    this.generateBlockTables();
  }

  /**
   * Register core tables in metadata so they're available for relations
   */
  async generateCoreTablesMetadata() {
    // Register core tables in metadata
    this.metadata.registerTable('files', {
      type: 'core',
      fields: [
        'id',
        'name',
        'original_name',
        'mime_type',
        'size',
        'path',
        'url',
        'width',
        'height',
        'alt_text',
        'alt',
        'description',
        'author',
        'created_at',
        'updated_at',
        'deleted_at',
        'deleted_by'
      ]
    });

    this.metadata.registerTable('users', {
      type: 'core',
      fields: [
        'id',
        'email',
        'name',
        'password_hash',
        'role',
        'avatar',
        'image',
        'email_verified',
        'status',
        'last_login',
        'created_at',
        'updated_at'
      ]
    });

    this.metadata.registerTable('tags', {
      type: 'core',
      fields: [
        'id',
        'name',
        'slug',
        'color',
        'created_at',
        'updated_at',
        'deleted_at',
        'deleted_by'
      ]
    });

    this.metadata.registerTable('roles', {
      type: 'core',
      fields: ['id', 'name', 'description', 'created_at', 'updated_at']
    });

    this.metadata.registerTable('taggables', {
      type: 'core',
      fields: ['id', 'tag_id', 'taggable_id', 'taggable_type', 'created_at']
    });
  }

  /**
   * Generate all global tables
   */
  generateGlobalTables() {
    const { globalDefinitions } = this.definitions;

    // First pass: Register all global tables in metadata (without relations)
    for (const [slug, definition] of Object.entries(globalDefinitions)) {
      const tableName = `global_${slug}`;
      const allFields = this.globalGen.mergeFields(definition, this.coreFields);

      this.metadata.registerTable(tableName, {
        type: 'global',
        slug: slug,
        fields: Object.keys(allFields)
      });
    }

    // Second pass: Generate tables with relations (now all tables are registered)
    for (const [slug, definition] of Object.entries(globalDefinitions)) {
      const tables = this.globalGen.generateTables(slug, definition, this.coreFields);
      this.allTables.push(...tables);
    }
  }

  /**
   * Generate all collection tables
   */
  generateCollectionTables() {
    const { collectionDefinitions } = this.definitions;

    for (const [slug, definition] of Object.entries(collectionDefinitions)) {
      const tables = this.collectionGen.generateTables(slug, definition, this.coreFields);
      this.allTables.push(...tables);
    }
  }

  /**
   * Generate all block tables
   */
  generateBlockTables() {
    const { blockDefinitions } = this.definitions;

    for (const [slug, definition] of Object.entries(blockDefinitions)) {
      const tables = this.blockGen.generateTables(slug, definition, this.coreFields);
      this.allTables.push(...tables);
    }
  }

  /**
   * Get user roles for core generation
   */
  getUserRoles() {
    // This would normally come from settings, using fallback for now
    return ['admin', 'editor', 'user'];
  }

  /**
   * Build the complete schema file content
   */
  async buildSchemaContent() {
    const imports = await this.generateImports();
    const coreContent = await this.generateCoreContent();
    const tableDefinitions = this.generateTableDefinitions();
    const relationDefinitions = this.generateRelationDefinitions();

    return [
      imports,
      '',
      '// Core tables and relations',
      coreContent,
      '',
      '// Generated entity tables',
      ...tableDefinitions,
      '',
      '// Generated relations',
      ...relationDefinitions
    ].join('\n');
  }

  /**
   * Generate imports for the schema file
   */
  async generateImports() {
    return [
      this.adapter.getImports(),
      "import { relations } from 'drizzle-orm';",
      "import { sql } from 'drizzle-orm';"
    ].join('\n');
  }

  /**
   * Generate core tables (users, files, etc.)
   */
  async generateCoreContent() {
    const coreTablesContent = await this.coreGen.generateCoreTables();
    const coreRelationsContent = this.coreGen.generateCoreRelations();

    return [
      '// Core tables generated using clean factory function',
      '// The actual table definitions are created with provider-specific functions',
      '',
      coreTablesContent,
      '',
      coreRelationsContent
    ].join('\n');
  }

  /**
   * Generate table definitions from collected tables
   */
  generateTableDefinitions() {
    return this.allTables.map(({ name, table, indexes, opts }) => {
      const fields = this.buildFieldDefinitions(table, name, opts);
      const fieldsBlock = `{\n${fields.join(',\n')}\n}`;

      if (indexes && indexes.length > 0) {
        const indexLines = indexes
          .map((idx) => {
            const fn = idx.type === 'unique' ? 'uniqueIndex' : 'index';
            const cols = idx.columns.map((c) => `table.${c}`).join(', ');
            return `  ${fn}('${idx.name}').on(${cols})`;
          })
          .join(',\n');
        return `export const ${name} = ${this.adapter.getTableFunction()}('${name}', ${fieldsBlock}, (table) => [\n${indexLines}\n]);`;
      }

      return `export const ${name} = ${this.adapter.getTableFunction()}('${name}', ${fieldsBlock});`;
    });
  }

  /**
   * Generate relation definitions
   */
  generateRelationDefinitions() {
    const relations = this.relationGen.generateOrganizedRelations();

    return [
      '// Standard relations',
      ...relations.standard,
      '',
      '// File relations',
      ...relations.files,
      '',
      '// Junction table relations',
      ...relations.junctions
    ].filter((line) => line !== '');
  }

  /**
   * Build field definitions for a table.
   *
   * `opts.relaxed = true` (set by the entity generators on a localized
   * main table) drops NOT NULL / UNIQUE on the hardcoded core fields
   * (`updated_at`, `sort`, `slug`). Those columns go vestigial once
   * `_locales` is the canonical store, and SQLite would otherwise refuse
   * `ALTER TABLE ADD COLUMN NOT NULL` on a populated table during the
   * non-localized → localized flip.
   */
  buildFieldDefinitions(table, tableName, opts = {}) {
    const fields = [];
    // Localized sibling tables enforce slug uniqueness via a composite
    // (slug, locale) index emitted alongside the table — drop the single-column
    // unique here so EN slug='about' and NB slug='about' can coexist.
    const isLocalesTable = typeof tableName === 'string' && tableName.endsWith('_locales');
    const relaxed = opts.relaxed === true;

    for (const [fieldName, fieldDef] of Object.entries(table)) {
      if (fieldName === 'id') {
        fields.push(`  id: ${this.adapter.getPrimaryKeyDefinition()}`);
      } else if (fieldName === 'created_at') {
        fields.push(`  created_at: ${this.adapter.getTimestampDefinition('created_at')}`);
      } else if (fieldName === 'updated_at') {
        fields.push(
          relaxed
            ? `  updated_at: ${this.adapter.getNullableTimestampDefinition('updated_at')}`
            : `  updated_at: ${this.adapter.getTimestampDefinition('updated_at')}`
        );
      } else if (fieldName === 'deleted_at') {
        fields.push(`  deleted_at: ${this.adapter.getNullableTimestampDefinition('deleted_at')}`);
      } else if (fieldName === 'deleted_by') {
        fields.push(`  deleted_by: ${this.adapter.getTextFieldDefinition('deleted_by')}`);
      } else if (fieldName === 'parent_id') {
        // Check if parent_id has foreign key reference (for self-referential relations)
        const options = {};
        if (fieldDef.references) options.references = fieldDef.references;
        fields.push(`  parent_id: ${this.adapter.getTextFieldDefinition('parent_id', options)}`);
      } else if (fieldName.endsWith('_id')) {
        const options = { notNull: true };
        if (fieldDef.references) options.references = fieldDef.references;
        fields.push(`  ${fieldName}: ${this.adapter.getTextFieldDefinition(fieldName, options)}`);
      } else if (fieldName === 'sort') {
        const sortOpts = relaxed ? { default: 0 } : { notNull: true, default: 0 };
        fields.push(`  sort: ${this.adapter.getIntegerFieldDefinition('sort', sortOpts)}`);
      } else if (fieldName === 'slug') {
        const slugOpts = isLocalesTable ? { notNull: true } : relaxed ? {} : { unique: true };
        fields.push(`  slug: ${this.adapter.getTextFieldDefinition('slug', slugOpts)}`);
      } else {
        // Handle field definitions with potential foreign key references
        const options = {};
        if (fieldDef.notNull) options.notNull = fieldDef.notNull;
        if (fieldDef.unique) options.unique = fieldDef.unique;
        if (fieldDef.references) options.references = fieldDef.references;
        if (fieldDef.default !== undefined) options.default = fieldDef.default;
        if (fieldDef.mode) options.mode = fieldDef.mode;

        if (fieldDef.type === 'integer') {
          fields.push(
            `  ${fieldName}: ${this.adapter.getIntegerFieldDefinition(fieldName, options)}`
          );
        } else {
          fields.push(`  ${fieldName}: ${this.adapter.getTextFieldDefinition(fieldName, options)}`);
        }
      }
    }

    return fields;
  }

  /**
   * Get summary of generated schema
   */
  getSummary() {
    const tablesByType = {};

    for (const table of this.allTables) {
      const metadata = this.metadata.getTableMetadata(table.name);
      const type = metadata?.type || 'unknown';
      tablesByType[type] = (tablesByType[type] || 0) + 1;
    }

    return {
      totalTables: this.allTables.length,
      totalRelations: this.metadata.getAllRelations().length,
      tablesByType
    };
  }
}
