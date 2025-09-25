// Base table generator with database adapter integration

export class TableGenerator {
  constructor(adapter, metadataCollector) {
    this.adapter = adapter;
    this.metadata = metadataCollector;
  }

  /**
   * Create a main entity table (collection, global, block)
   */
  createMainTable(tableName, fields, entityInfo) {
    const table = this.createTableDefinition(tableName, fields);

    this.metadata.registerTable(tableName, {
      type: 'main',
      entity: entityInfo,
      fields: Object.keys(fields)
    });

    return { name: tableName, table };
  }

  /**
   * Create an array/child table for storing array field items
   */
  createArrayTable(tableName, parentTable, field, entityInfo) {
    const fields = {
      id: this.getPrimaryKeyField(),
      [`${parentTable.split('_')[0]}_id`]: this.getTextField({ notNull: true }), // block_id, global_id, collection_id
      sort: this.getIntegerField({ notNull: true, default: 0 }),
      created_at: this.getTimestampField(),
      updated_at: this.getTimestampField(),
      ...this.buildArrayItemFields(field)
    };

    const table = this.createTableDefinition(tableName, fields);

    this.metadata.registerTable(tableName, {
      type: 'array',
      entity: entityInfo,
      parent: {
        table: parentTable,
        field: field.name,
        foreignKey: `${parentTable.split('_')[0]}_id`
      }
    });

    // Add the parent relation
    this.metadata.addRelation({
      fromTable: tableName,
      toTable: parentTable,
      type: 'many-to-one',
      foreignKey: `${parentTable.split('_')[0]}_id`,
      references: 'id'
    });

    return { name: tableName, table };
  }

  /**
   * Create a file relation table
   */
  createFileTable(tableName, parentTable, field, entityInfo) {
    const fields = {
      id: this.getPrimaryKeyField(),
      parent_id: this.getTextField({ notNull: true }),
      file_id: this.getTextField({ notNull: true }),
      sort: this.getIntegerField({ notNull: true, default: 0 }),
      alt_override: this.getTextField(),
      created_at: this.getTimestampField()
    };

    const table = this.createTableDefinition(tableName, fields);

    this.metadata.registerTable(tableName, {
      type: 'file_relation',
      entity: entityInfo,
      parent: {
        table: parentTable,
        field: field.name
      }
    });

    // Add relations to parent and files table
    this.metadata.addRelation({
      fromTable: tableName,
      toTable: parentTable,
      type: 'many-to-one',
      foreignKey: 'parent_id',
      references: 'id'
    });

    this.metadata.addRelation({
      fromTable: tableName,
      toTable: 'files',
      type: 'many-to-one',
      foreignKey: 'file_id',
      references: 'id'
    });

    return { name: tableName, table };
  }

  /**
   * Create a junction table for many-to-many relations
   */
  createJunctionTable(tableName, fromTable, toTable, entityInfo) {
    const fields = {
      id: this.getPrimaryKeyField(),
      [`${fromTable.split('_')[0]}_id`]: this.getTextField({ notNull: true }),
      target_id: this.getTextField({ notNull: true }),
      created_at: this.getTimestampField(),
      updated_at: this.getTimestampField()
    };

    const table = this.createTableDefinition(tableName, fields);

    this.metadata.registerTable(tableName, {
      type: 'junction',
      entity: entityInfo,
      junction: {
        fromTable,
        toTable,
        fromKey: `${fromTable.split('_')[0]}_id`,
        toKey: 'target_id'
      }
    });

    // Add both relations
    this.metadata.addRelation({
      fromTable: tableName,
      toTable: fromTable,
      type: 'many-to-one',
      foreignKey: `${fromTable.split('_')[0]}_id`,
      references: 'id'
    });

    this.metadata.addRelation({
      fromTable: tableName,
      toTable: toTable,
      type: 'many-to-one',
      foreignKey: 'target_id',
      references: 'id'
    });

    return { name: tableName, table };
  }

  // Database adapter wrapper methods
  createTableDefinition(name, fields) {
    // Return a simple object for now - we'll build the actual Drizzle table later
    return fields;
  }

  getPrimaryKeyField() {
    return 'PRIMARY_KEY';
  }

  getTextField(options = {}) {
    return { type: 'text', ...options };
  }

  getIntegerField(options = {}) {
    return { type: 'integer', ...options };
  }

  getTimestampField() {
    return { type: 'timestamp' };
  }

  /**
   * Build fields for array items based on field definition
   */
  buildArrayItemFields(field) {
    const fields = {};

    if (field.items?.properties) {
      for (const [key, fieldDef] of Object.entries(field.items.properties)) {
        // Skip nested arrays and files (they get their own tables)
        if (fieldDef.type === 'array' || fieldDef.type === 'file') continue;
        fields[key] = this.getTextField();
      }
    }

    return fields;
  }
}
