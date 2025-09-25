// Block table generator - handles reusable content blocks

export class BlockGenerator {
  constructor(tableGenerator, stringUtils) {
    this.tableGen = tableGenerator;
    this.toSnakeCase = stringUtils.toSnakeCase;
  }

  /**
   * Generate all tables for a block definition
   */
  generateTables(blockSlug, definition, coreFields) {
    const tables = [];
    const entityInfo = {
      type: 'block',
      slug: blockSlug
    };

    // Create main block table
    const mainTable = this.createMainBlockTable(blockSlug, definition, coreFields, entityInfo);
    tables.push(mainTable);

    // Create child tables for arrays and files
    const childTables = this.createChildTables(mainTable.name, definition.fields || {}, entityInfo);
    tables.push(...childTables);

    return tables;
  }

  /**
   * Create the main block table
   */
  createMainBlockTable(blockSlug, definition, coreFields, entityInfo) {
    const tableName = `block_${blockSlug}`;

    // Merge core block fields with template fields
    const allFields = this.mergeFields(definition, coreFields);

    // Build table fields, excluding arrays and files
    const tableFields = this.buildMainTableFields(allFields, definition);

    return this.tableGen.createMainTable(tableName, tableFields, entityInfo);
  }

  /**
   * Create child tables for arrays and file fields
   */
  createChildTables(mainTableName, templateFields, entityInfo) {
    const tables = [];

    for (const [fieldName, fieldDef] of Object.entries(templateFields)) {
      if (fieldDef.type === 'array') {
        tables.push(...this.createArrayTables(mainTableName, fieldName, fieldDef, entityInfo));
      } else if (fieldDef.type === 'file') {
        tables.push(this.createFileTable(mainTableName, fieldName, fieldDef, entityInfo));
      }
    }

    return tables;
  }

  /**
   * Create array tables (with potential nesting)
   */
  createArrayTables(parentTable, fieldName, fieldDef, entityInfo, depth = 0) {
    const tables = [];
    const arrayTableName = `${parentTable}_${this.toSnakeCase(fieldName)}`;

    // Create the main array table
    const arrayTable = this.tableGen.createArrayTable(
      arrayTableName,
      parentTable,
      { name: fieldName, ...fieldDef },
      entityInfo
    );
    tables.push(arrayTable);

    // Handle nested arrays and files within this array
    if (fieldDef.items?.properties) {
      for (const [itemFieldName, itemFieldDef] of Object.entries(fieldDef.items.properties)) {
        if (itemFieldDef.type === 'array') {
          tables.push(
            ...this.createArrayTables(
              arrayTableName,
              itemFieldName,
              itemFieldDef,
              entityInfo,
              depth + 1
            )
          );
        } else if (itemFieldDef.type === 'file') {
          tables.push(
            this.createFileTable(arrayTableName, itemFieldName, itemFieldDef, entityInfo)
          );
        }
      }
    }

    return tables;
  }

  /**
   * Create a file relation table
   */
  createFileTable(parentTable, fieldName, fieldDef, entityInfo) {
    const fileTableName = `${parentTable}_${this.toSnakeCase(fieldName)}`;
    return this.tableGen.createFileTable(
      fileTableName,
      parentTable,
      { name: fieldName, ...fieldDef },
      entityInfo
    );
  }

  /**
   * Merge core block fields with template fields
   */
  mergeFields(definition, coreFields) {
    const { BLOCK_CORE_FIELDS } = coreFields;

    return {
      ...BLOCK_CORE_FIELDS,
      ...definition.fields
    };
  }

  /**
   * Build main table fields, excluding arrays and files
   */
  buildMainTableFields(allFields, definition) {
    const fields = {
      id: this.tableGen.getPrimaryKeyField(),
      collection_id: this.tableGen.getTextField({ notNull: true }),
      sort: this.tableGen.getIntegerField({ notNull: true, default: 0 }),
      created_at: this.tableGen.getTimestampField(),
      updated_at: this.tableGen.getTimestampField()
    };

    // Add all merged core+template fields (skip arrays and many-to-many relations - they get separate tables)
    for (const [fieldName, fieldDef] of Object.entries(allFields)) {
      if (fieldDef.type === 'array') {
        // Arrays get separate tables
        continue;
      }

      if (fieldDef.type === 'relation') {
        // Handle relation fields that need foreign keys in main table
        const relation = fieldDef.relation;
        if (relation && relation.type !== 'many-to-many') {
          // one-to-one and one-to-many relations add foreign key to main table
          fields[fieldName] = this.tableGen.getTextField();
        }
        continue;
      }

      if (fieldDef.type === 'file') {
        // File fields store the file ID as a foreign key to the files table
        fields[fieldName] = this.tableGen.getTextField();
        continue;
      }

      fields[fieldName] = this.buildFieldDefinition(fieldName, fieldDef);
    }

    return fields;
  }

  /**
   * Build a single field definition with proper constraints
   */
  buildFieldDefinition(fieldName, fieldDef) {
    const options = {
      notNull: fieldDef.required,
      default: fieldDef.default
    };

    if (fieldDef.type === 'number') {
      return this.tableGen.getIntegerField(options);
    }

    if (fieldDef.type === 'boolean') {
      return this.tableGen.getIntegerField({ ...options, mode: 'boolean' });
    }

    // Default to text field
    return this.tableGen.getTextField(options);
  }
}
