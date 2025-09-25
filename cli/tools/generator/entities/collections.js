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
      return `global_${relation.targetGlobal}`;
    }
    if (relation.targetCollection) {
      return `collection_${relation.targetCollection}`;
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
