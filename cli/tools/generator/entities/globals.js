// Global table generator - handles repeatable, single, and flat globals

export class GlobalGenerator {
  constructor(tableGenerator, stringUtils) {
    this.tableGen = tableGenerator;
    this.toSnakeCase = stringUtils.toSnakeCase;
  }

  /**
   * Generate all tables for a global definition
   */
  generateTables(globalSlug, definition, coreFields) {
    const tables = [];
    const entityInfo = {
      type: 'global',
      slug: globalSlug
    };

    // Create main global table
    const mainTable = this.createMainGlobalTable(globalSlug, definition, coreFields, entityInfo);
    tables.push(mainTable);

    // Create child tables for arrays and files
    const childTables = this.createChildTables(mainTable.name, definition.fields || {}, entityInfo);
    tables.push(...childTables);

    // Handle relation fields (foreign keys, junction tables)
    const allFields = this.mergeFields(definition, coreFields);
    const relationTables = this.createRelationTables(mainTable.name, allFields, entityInfo);
    tables.push(...relationTables);

    return tables;
  }

  /**
   * Create the main global table
   */
  createMainGlobalTable(globalSlug, definition, coreFields, entityInfo) {
    const tableName = `global_${globalSlug}`;

    // Merge core fields with template fields based on dataType
    const allFields = this.mergeFields(definition, coreFields);

    // Build table fields, excluding arrays and files (they get separate tables)
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
   * Create junction tables for many-to-many relations
   */
  createRelationTables(mainTableName, allFields, entityInfo) {
    const tables = [];

    for (const [fieldName, fieldDef] of Object.entries(allFields)) {
      if (fieldDef.type !== 'relation') continue;

      const relation = fieldDef.relation;
      if (!relation) continue;

      if (relation.type === 'many-to-many') {
        // Create junction table for many-to-many relations
        const targetTable = this.resolveTargetTable(relation);
        const junctionTableName = `junction_${mainTableName.replace('global_', '')}_${this.toSnakeCase(fieldName)}`;

        const junctionTable = this.tableGen.createJunctionTable(
          junctionTableName,
          mainTableName,
          targetTable,
          entityInfo
        );
        tables.push(junctionTable);
      } else {
        // one-to-one and one-to-many relations just add foreign key to main table
        // The foreign key is handled in buildMainTableFields by adding the field
        // But we need to track the relation for proper Drizzle relation generation
        const targetTable = this.resolveTargetTable(relation);

        this.tableGen.metadata.addRelation({
          fromTable: mainTableName,
          toTable: targetTable,
          type: relation.type === 'one-to-one' ? 'many-to-one' : 'one-to-many',
          foreignKey: fieldName,
          references: 'id'
        });
      }
    }

    return tables;
  }

  /**
   * Resolve target table name from relation definition
   */
  resolveTargetTable(relation) {
    if (relation.targetGlobal) {
      const targetTable = `global_${relation.targetGlobal}`;
      // Validate that the target table exists in metadata
      if (!this.tableGen.metadata.getTableMetadata(targetTable)) {
        console.warn(`Warning: Relation target table '${targetTable}' not found in metadata. Available global tables:`,
          this.tableGen.metadata.getTablesByType('global').map(t => t.name));
      }
      return targetTable;
    }
    if (relation.targetCollection) {
      const targetTable = `collection_${relation.targetCollection}`;
      // Validate that the target table exists in metadata
      if (!this.tableGen.metadata.getTableMetadata(targetTable)) {
        console.warn(`Warning: Relation target table '${targetTable}' not found in metadata. Available collection tables:`,
          this.tableGen.metadata.getTablesByType('collection').map(t => t.name));
      }
      return targetTable;
    }
    throw new Error(`Invalid relation: ${JSON.stringify(relation)}`);
  }

  /**
   * Merge core fields with template fields based on global dataType
   */
  mergeFields(definition, coreFields) {
    const { CORE_FIELDS } = coreFields;

    if (definition.dataType === 'flat') {
      // Flat globals only get audit fields
      return {
        last_modified_by: CORE_FIELDS.last_modified_by,
        ...definition.fields
      };
    }

    // Repeatable globals get full core fields
    return {
      ...CORE_FIELDS,
      ...definition.fields
    };
  }

  /**
   * Build main table fields, excluding arrays, files, and relations
   */
  buildMainTableFields(allFields, definition) {
    const fields = {
      id: this.tableGen.getPrimaryKeyField(),
      created_at: this.tableGen.getTimestampField(),
      updated_at: this.tableGen.getTimestampField()
    };

    // Add all merged core+template fields (skip arrays - they get separate tables)
    for (const [fieldName, fieldDef] of Object.entries(allFields)) {
      if (fieldDef.type === 'array') continue;

      if (fieldDef.type === 'file') {
        // File fields store the file ID as a foreign key to the files table
        fields[fieldName] = this.tableGen.getTextField();
        continue;
      }

      // Handle relation fields that need foreign keys in main table
      if (fieldDef.type === 'relation') {
        const relation = fieldDef.relation;
        if (relation && relation.type !== 'many-to-many') {
          // one-to-one and one-to-many relations add foreign key to main table
          fields[fieldName] = this.tableGen.getTextField();
        }
        continue; // Don't process as regular field
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
      default: fieldDef.default,
      unique: fieldName === 'slug'
    };

    // parent_id should never be required (top-level items have no parent)
    if (fieldName === 'parent_id') {
      options.notNull = false;
      delete options.default;
    }

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
