// Collection table generator - handles content collections like posts, pages, products

export class CollectionGenerator {
  constructor(tableGenerator, stringUtils) {
    this.tableGen = tableGenerator;
    this.toSnakeCase = stringUtils.toSnakeCase;
  }

  /**
   * Generate all tables for a collection definition
   */
  generateTables(collectionSlug, definition, coreFields) {
    const tables = [];
    const entityInfo = {
      type: 'collection',
      slug: collectionSlug
    };

    // Create main collection table
    const mainTable = this.createMainCollectionTable(
      collectionSlug,
      definition,
      coreFields,
      entityInfo
    );
    tables.push(mainTable);

    // Create child tables for blocks (if enabled)
    if (definition.options?.blocks) {
      const blockTable = this.createBlockTable(mainTable.name, entityInfo);
      tables.push(blockTable);
    }

    // Create array tables for template fields
    const templateFields = definition.fields || {};
    for (const [fieldName, fieldDef] of Object.entries(templateFields)) {
      if (fieldDef.type === 'array') {
        tables.push(...this.createArrayTables(mainTable.name, fieldName, fieldDef, entityInfo));
      }
    }

    // Handle relation fields (foreign keys, junction tables)
    const allFields = this.mergeFields(definition, coreFields);
    const relationTables = this.createRelationTables(mainTable.name, allFields, entityInfo);
    tables.push(...relationTables);

    return tables;
  }

  /**
   * Create the main collection table
   */
  createMainCollectionTable(collectionSlug, definition, coreFields, entityInfo) {
    const tableName = `collection_${collectionSlug}`;

    // Merge core fields with template fields
    const allFields = this.mergeFields(definition, coreFields);

    // Build table fields, excluding relations (they get separate tables/foreign keys)
    const tableFields = this.buildMainTableFields(allFields, definition);

    return this.tableGen.createMainTable(tableName, tableFields, entityInfo);
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
        }
      }
    }

    return tables;
  }

  /**
   * Create blocks table for collection with blocks enabled
   */
  createBlockTable(collectionTableName, entityInfo) {
    const blockTableName = `${collectionTableName}_blocks`;

    const fields = {
      id: this.tableGen.getPrimaryKeyField(),
      collection_id: this.tableGen.getTextField({ notNull: true }),
      block_type: this.tableGen.getTextField({ notNull: true }),
      block_id: this.tableGen.getTextField({ notNull: true }),
      sort: this.tableGen.getIntegerField({ notNull: true, default: 0 }),
      created_at: this.tableGen.getTimestampField(),
      updated_at: this.tableGen.getTimestampField()
    };

    const blockTable = this.tableGen.createMainTable(blockTableName, fields, entityInfo);

    // Add relation to parent collection
    this.tableGen.metadata.addRelation({
      fromTable: blockTableName,
      toTable: collectionTableName,
      type: 'many-to-one',
      foreignKey: 'collection_id',
      references: 'id'
    });

    return blockTable;
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
        const junctionTableName = `junction_${mainTableName.replace('collection_', '')}_${this.toSnakeCase(fieldName)}`;

        const junctionTable = this.tableGen.createJunctionTable(
          junctionTableName,
          mainTableName,
          targetTable,
          entityInfo
        );
        tables.push(junctionTable);
      } else {
        // one-to-one and one-to-many relations just add foreign key to main table
        // The foreign key is handled in buildMainTableFields
        // But we need to track the relation for proper Drizzle relation generation
        const targetTable = this.resolveTargetTable(relation);

        if (relation.type === 'one-to-many') {
          // For one-to-many: register both sides of the relationship

          // From collection to target (many-to-one): "Pages belong to Category"
          this.tableGen.metadata.addRelation({
            fromTable: mainTableName,
            toTable: targetTable,
            type: 'many-to-one',
            foreignKey: fieldName,
            references: 'id'
          });

          // From target to collection (one-to-many): "Category has many Pages"
          this.tableGen.metadata.addRelation({
            fromTable: targetTable,
            toTable: mainTableName,
            type: 'one-to-many',
            foreignKey: fieldName,
            references: 'id'
          });
        } else {
          // one-to-one relations are just many-to-one from the referencing table's perspective
          this.tableGen.metadata.addRelation({
            fromTable: mainTableName,
            toTable: targetTable,
            type: 'many-to-one',
            foreignKey: fieldName,
            references: 'id'
          });
        }
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
        console.warn(
          `Warning: Relation target table '${targetTable}' not found in metadata. Available global tables:`,
          this.tableGen.metadata.getTablesByType('global').map((t) => t.name)
        );
      }
      return targetTable;
    }
    if (relation.targetCollection) {
      const targetTable = `collection_${relation.targetCollection}`;
      // Validate that the target table exists in metadata
      if (!this.tableGen.metadata.getTableMetadata(targetTable)) {
        console.warn(
          `Warning: Relation target table '${targetTable}' not found in metadata. Available collection tables:`,
          this.tableGen.metadata.getTablesByType('collection').map((t) => t.name)
        );
      }
      return targetTable;
    }
    throw new Error(`Invalid relation: ${JSON.stringify(relation)}`);
  }

  /**
   * Merge core fields with template fields
   */
  mergeFields(definition, coreFields) {
    const { CORE_FIELDS, SEO_FIELDS } = coreFields;

    let mergedFields = { ...CORE_FIELDS };

    // Add SEO fields if seo option is enabled
    if (definition.options?.seo) {
      Object.assign(mergedFields, SEO_FIELDS);
    }

    // Add template fields
    Object.assign(mergedFields, definition.fields || {});

    return mergedFields;
  }

  /**
   * Build main table fields, excluding relations
   */
  buildMainTableFields(allFields, definition) {
    const fields = {
      id: this.tableGen.getPrimaryKeyField(),
      created_at: this.tableGen.getTimestampField(),
      updated_at: this.tableGen.getTimestampField()
    };

    // Add all merged core+template fields (skip arrays and many-to-many relations - they get separate handling)
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
          const targetTable = this.resolveTargetTable(relation);
          fields[fieldName] = this.tableGen.getTextField({
            references: { table: targetTable, field: 'id' }
          });
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
