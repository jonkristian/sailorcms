// Global table generator - handles repeatable, single, and flat globals

export class GlobalGenerator {
  constructor(tableGenerator, stringUtils, opts = {}) {
    this.tableGen = tableGenerator;
    this.toSnakeCase = stringUtils.toSnakeCase;
    // Slugs currently in the transitional (mid-flip) state: emit relaxed full
    // main + _locales for these. Others get steady-state (identity-only main).
    this.transitionalLocalized = opts.transitionalLocalized ?? new Set();
  }

  /**
   * Generate all tables for a global definition
   */
  generateTables(globalSlug, definition, coreFields) {
    if (definition.localized) {
      return this.generateLocalizedTables(globalSlug, definition, coreFields);
    }

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
   * Generate tables for a localized global. Mirrors the collection split:
   *
   *   - `global_<slug>`         — full main shape (identity + all template
   *     columns). Same schema as a non-localized global; per-locale reads
   *     ignore these columns. Keeping main additive means a non-localized →
   *     localized flip just adds the `_locales` sibling without dropping
   *     existing populated columns; the data migrator copies the seed locale
   *     across and the doctor flags the leftover columns as cleanable.
   *   - `global_<slug>_locales` — canonical per-locale editable content, FK
   *     back to main. All reads/writes post-migration go through here.
   *
   * Child tables (arrays, files, m2m junctions) anchor on `global_<slug>` —
   * same naming as non-localized — so flipping localized doesn't churn child
   * table names.
   */
  generateLocalizedTables(globalSlug, definition, coreFields) {
    const tables = [];
    const entityInfo = { type: 'global', slug: globalSlug };

    const isTransitional = this.transitionalLocalized.has(globalSlug);

    // Main table emission:
    //   - Transitional (mid-flip, one cycle): relaxed full shape so the
    //     data-copy migrator has main columns to read from.
    //   - Steady-state (default): identity-only main. `_locales` is the sole
    //     canonical content store; drizzle's journal records the column drops
    //     as ordinary migrations — no doctor `--fix`, no drift.
    const mainTable = isTransitional
      ? this.createMainGlobalTable(globalSlug, definition, coreFields, entityInfo, {
          relaxed: true
        })
      : this.createIdentityOnlyMainTable(globalSlug, entityInfo);
    tables.push(mainTable);

    // Locales sibling: canonical per-locale content store.
    const localesTable = this.createLocalizedLocalesTable(
      globalSlug,
      definition,
      coreFields,
      entityInfo,
      mainTable.name
    );
    tables.push(localesTable);

    // Child tables anchor on main (same naming as non-localized).
    const childParent = mainTable.name;

    const templateFields = definition.fields || {};
    for (const [fieldName, fieldDef] of Object.entries(templateFields)) {
      if (fieldDef.type === 'array') {
        tables.push(...this.createArrayTables(childParent, fieldName, fieldDef, entityInfo));
      } else if (fieldDef.type === 'file') {
        tables.push(this.createFileTable(childParent, fieldName, fieldDef, entityInfo));
      }
    }

    const allFields = this.mergeFields(definition, coreFields);
    tables.push(...this.createRelationTables(childParent, allFields, entityInfo));

    return tables;
  }

  /**
   * Locale sibling for a localized global: per-locale editable content + FK
   * back to main. Composite uniques mirror the collection version.
   *
   * For flat globals we still emit the same shape — the singleton-vs-multiple
   * distinction is enforced by the read/write paths, not by the locales table
   * schema. Each flat global ends up with one main row plus one `_locales`
   * row per configured locale.
   */
  createLocalizedLocalesTable(globalSlug, definition, coreFields, entityInfo, mainTableName) {
    const tableName = `${mainTableName}_locales`;
    const fkField = `${globalSlug}_id`;

    const fields = {
      id: this.tableGen.getPrimaryKeyField(),
      [fkField]: this.tableGen.getTextField({
        notNull: true,
        references: { table: mainTableName, field: 'id' }
      }),
      locale: this.tableGen.getTextField({ notNull: true }),
      updated_at: this.tableGen.getTimestampField(),
      last_modified_by: this.tableGen.getTextField()
    };

    // Identity fields stay on main; everything else (core + template) goes to
    // _locales. For flat globals, `mergeFields` only injects `last_modified_by`
    // from core (already added above), so the iteration below is just template
    // fields. For repeatable, the full CORE_FIELDS set is included.
    const MAIN_ONLY = new Set(['id', 'created_at', 'deleted_at', 'deleted_by']);
    const allFields = this.mergeFields(definition, coreFields);

    for (const [fieldName, fieldDef] of Object.entries(allFields)) {
      if (MAIN_ONLY.has(fieldName)) continue;
      if (fieldName === 'updated_at' || fieldName === 'last_modified_by') continue;
      if (fieldDef.type === 'array') continue;
      if (fieldDef.type === 'file') continue;
      if (fieldDef.type === 'tags') continue;
      // `reverse` is a read of another entity's relation — no column, no table.
      if (fieldDef.type === 'reverse') continue;

      if (fieldDef.type === 'relation') {
        const relation = fieldDef.relation;
        if (relation && relation.type !== 'many-to-many') {
          const targetTable = this.resolveTargetTable(relation);
          // Self-reference would create a circular dependency at schema emit;
          // mirror the non-localized handling and emit the FK without a constraint.
          if (targetTable === mainTableName || targetTable === tableName) {
            fields[fieldName] = this.tableGen.getTextField();
          } else {
            fields[fieldName] = this.tableGen.getTextField({
              references: { table: targetTable, field: 'id' }
            });
          }
        }
        continue;
      }

      fields[fieldName] = this.buildFieldDefinition(fieldName, fieldDef);
    }

    const indexes = [
      {
        type: 'unique',
        name: `${tableName}_item_locale_unique_idx`,
        columns: [fkField, 'locale']
      }
    ];
    // Slug is optional on globals (flat ones often don't have it; repeatable
    // ones usually do). Only emit the composite slug-locale unique when the
    // template actually defines a slug field.
    if (fields.slug) {
      indexes.push({
        type: 'unique',
        name: `${tableName}_slug_locale_unique_idx`,
        columns: ['slug', 'locale']
      });
    }

    const table = this.tableGen.createMainTable(tableName, fields, entityInfo, indexes);

    this.tableGen.metadata.addRelation({
      fromTable: tableName,
      toTable: mainTableName,
      type: 'many-to-one',
      foreignKey: fkField,
      references: 'id'
    });

    return table;
  }

  /**
   * Create the main global table.
   *
   * `opts.relaxed = true` drops NOT NULL / UNIQUE on content columns — used
   * for the localized main table, where those constraints would block
   * `ALTER TABLE ADD COLUMN` on populated rows during the localized flip.
   */
  createMainGlobalTable(globalSlug, definition, coreFields, entityInfo, opts = {}) {
    const tableName = `global_${globalSlug}`;

    // Merge core fields with template fields based on dataType
    const allFields = this.mergeFields(definition, coreFields);

    // Build table fields, excluding arrays and files (they get separate tables)
    const tableFields = this.buildMainTableFields(allFields, definition, tableName, opts);

    return this.tableGen.createMainTable(tableName, tableFields, entityInfo, undefined, opts);
  }

  /**
   * Identity-only main table for a localized global in steady state.
   * Mirrors the collection version — id + audit columns only. No `author`
   * because globals (unlike collections) don't carry that field in their
   * main shape. Editable content lives entirely on `_locales`.
   */
  createIdentityOnlyMainTable(globalSlug, entityInfo) {
    const tableName = `global_${globalSlug}`;
    const fields = {
      id: this.tableGen.getPrimaryKeyField(),
      created_at: this.tableGen.getTimestampField(),
      deleted_at: this.tableGen.getNullableTimestampField(),
      deleted_by: this.tableGen.getTextField()
    };
    return this.tableGen.createMainTable(tableName, fields, entityInfo);
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
        // Always create relation table for file fields (allows changing multiple flag without migration)
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

    // Create the main array table, passing depth to determine correct foreign key field
    const arrayTable = this.tableGen.createArrayTable(
      arrayTableName,
      parentTable,
      { name: fieldName, ...fieldDef },
      entityInfo,
      depth
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
        } else if (
          itemFieldDef.type === 'relation' &&
          itemFieldDef.relation?.type === 'many-to-many'
        ) {
          console.warn(
            `Warning: many-to-many relation '${itemFieldName}' inside array '${fieldName}' on ${entityInfo.type} '${entityInfo.slug}' is unsupported — no junction table is generated and save/load paths will silently drop values. Model the relation at the parent entity level instead.`
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

        if (relation.type === 'one-to-many') {
          // For one-to-many: register both sides of the relationship

          // From global to target (many-to-one): "Pages belong to Category"
          this.tableGen.metadata.addRelation({
            fromTable: mainTableName,
            toTable: targetTable,
            type: 'many-to-one',
            foreignKey: fieldName,
            references: 'id'
          });

          // From target to global (one-to-many): "Category has many Pages"
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
  buildMainTableFields(allFields, definition, tableName, opts = {}) {
    const fields = {
      id: this.tableGen.getPrimaryKeyField(),
      created_at: this.tableGen.getTimestampField(),
      // updated_at lives canonically on `_locales` for localized
      // globals. Keep it nullable on main when relaxed so the
      // localized flip's ALTER TABLE ADD COLUMN doesn't trip
      // SQLite's NOT NULL guard.
      updated_at: opts.relaxed
        ? this.tableGen.getNullableTimestampField()
        : this.tableGen.getTimestampField(),
      deleted_at: this.tableGen.getNullableTimestampField(),
      deleted_by: this.tableGen.getTextField()
    };

    // Add all merged core+template fields (skip arrays and files - they get separate tables)
    for (const [fieldName, fieldDef] of Object.entries(allFields)) {
      if (fieldDef.type === 'array') continue;

      if (fieldDef.type === 'file') {
        // All file fields use relation tables (no columns on main table)
        continue;
      }

      if (fieldDef.type === 'tags') {
        // Tags are stored via the polymorphic `taggables` join table, not as
        // a column on the entity. Skip so we don't create a phantom column.
        continue;
      }

      // `reverse` is a read of another entity's relation — no column, no table.
      if (fieldDef.type === 'reverse') continue;

      // Handle relation fields that need foreign keys in main table
      if (fieldDef.type === 'relation') {
        const relation = fieldDef.relation;
        if (relation && relation.type !== 'many-to-many') {
          // one-to-one and one-to-many relations add foreign key to main table
          const targetTable = this.resolveTargetTable(relation);

          // Skip foreign key constraint for self-referential tables to avoid circular dependency
          if (targetTable === tableName) {
            fields[fieldName] = this.tableGen.getTextField();
          } else {
            fields[fieldName] = this.tableGen.getTextField({
              references: { table: targetTable, field: 'id' }
            });
          }
        }
        continue; // Don't process as regular field
      }

      fields[fieldName] = this.buildFieldDefinition(fieldName, fieldDef, opts);
    }

    return fields;
  }

  /**
   * Build a single field definition with proper constraints
   */
  buildFieldDefinition(fieldName, fieldDef, opts = {}) {
    const options = {
      notNull: opts.relaxed ? false : fieldDef.required,
      default: fieldDef.default,
      unique: opts.relaxed ? false : fieldName === 'slug'
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
