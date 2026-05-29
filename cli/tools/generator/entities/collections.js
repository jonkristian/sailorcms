// Collection table generator - handles content collections like posts, pages, products

export class CollectionGenerator {
  constructor(tableGenerator, stringUtils, opts = {}) {
    this.tableGen = tableGenerator;
    this.toSnakeCase = stringUtils.toSnakeCase;
    // Slugs currently in the transitional (mid-flip) state: emit relaxed full
    // main + _locales for these. Others get steady-state (identity-only main).
    this.transitionalLocalized = opts.transitionalLocalized ?? new Set();
  }

  /**
   * Generate all tables for a collection definition
   */
  generateTables(collectionSlug, definition, coreFields) {
    if (definition.localized) {
      return this.generateLocalizedTables(collectionSlug, definition, coreFields);
    }

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

    // `options.blocks: true` flips block UI on for this collection. The block
    // rows themselves live in `block_<type>` tables with a `collection_id`
    // column referencing the parent — no per-collection junction table needed.

    // Create array and file tables for template fields
    const templateFields = definition.fields || {};
    for (const [fieldName, fieldDef] of Object.entries(templateFields)) {
      if (fieldDef.type === 'array') {
        tables.push(...this.createArrayTables(mainTable.name, fieldName, fieldDef, entityInfo));
      } else if (fieldDef.type === 'file') {
        // Always create relation table for file fields (allows changing multiple flag without migration)
        tables.push(this.createFileTable(mainTable.name, fieldName, fieldDef, entityInfo));
      }
    }

    // Handle relation fields (foreign keys, junction tables)
    const allFields = this.mergeFields(definition, coreFields);
    const relationTables = this.createRelationTables(mainTable.name, allFields, entityInfo);
    tables.push(...relationTables);

    return tables;
  }

  /**
   * Generate tables for a localized collection.
   *
   *   - `collection_<slug>`         — full shape (same columns as non-localized).
   *                                   Lets a non-localized → localized flip avoid
   *                                   destructive column drops; content columns
   *                                   become vestigial after data migration and
   *                                   are flagged by `sailor doctor` as cleanable.
   *   - `collection_<slug>_locales` — per-locale editable content + FK back to
   *                                   main. The canonical content store for
   *                                   localized reads/writes.
   *
   * Child tables (arrays, files, m2m junctions) keep the same names as
   * non-localized — no `_locales` segment in their names. Their `parent_id` /
   * `collection_id` columns reference `_locales.id` at runtime; the loaders /
   * persisters resolve that via `_localeId`.
   */
  generateLocalizedTables(collectionSlug, definition, coreFields) {
    const tables = [];
    const entityInfo = { type: 'collection', slug: collectionSlug };

    const isTransitional = this.transitionalLocalized.has(collectionSlug);

    // Main table emission:
    //   - Transitional (mid-flip, set by `db:update` for one cycle): emit the
    //     relaxed full shape so the in-progress data-copy migrator has main
    //     columns to read from. SQLite refuses `ALTER TABLE ADD COLUMN NOT NULL`
    //     on populated rows; relaxing the constraints lets the flip apply.
    //   - Steady-state (default): emit identity-only main. `_locales` is the
    //     sole canonical content store. Drizzle's journal records the column
    //     drops as ordinary migrations — no doctor `--fix`, no drift.
    const mainTable = isTransitional
      ? this.createMainCollectionTable(collectionSlug, definition, coreFields, entityInfo, {
          relaxed: true
        })
      : this.createIdentityOnlyMainTable(collectionSlug, entityInfo);
    tables.push(mainTable);

    // Locales sibling: the canonical per-locale content store.
    const localesTable = this.createLocalizedLocalesTable(
      collectionSlug,
      definition,
      coreFields,
      entityInfo,
      mainTable.name
    );
    tables.push(localesTable);

    // Child tables anchor on main (same naming as non-localized). The runtime
    // convention is "parent_id references _locales.id for localized" — kept
    // out of table names so flipping localized doesn't rename tables.
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
   * Locale sibling table: per-locale editable content. Holds the FK back to main,
   * the locale code, and all editable scalar + FK-relation fields. File fields,
   * array fields, m2m junctions, and the block list all live in separate tables
   * that FK to this row's id (handled by the parent caller).
   */
  createLocalizedLocalesTable(collectionSlug, definition, coreFields, entityInfo, mainTableName) {
    const tableName = `${mainTableName}_locales`;
    const fkField = `${collectionSlug}_id`;

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

    // Core+template fields, minus identity (stays on main) and minus the
    // last_modified_by we already added explicitly above.
    const MAIN_ONLY = new Set(['id', 'created_at', 'deleted_at', 'deleted_by', 'author']);
    const allFields = this.mergeFields(definition, coreFields);

    for (const [fieldName, fieldDef] of Object.entries(allFields)) {
      if (MAIN_ONLY.has(fieldName)) continue;
      if (fieldName === 'updated_at' || fieldName === 'last_modified_by') continue;
      if (fieldDef.type === 'array') continue; // separate table
      if (fieldDef.type === 'file') continue; // separate table
      if (fieldDef.type === 'tags') continue; // polymorphic taggables, no column

      if (fieldDef.type === 'relation') {
        const relation = fieldDef.relation;
        if (relation && relation.type !== 'many-to-many') {
          const targetTable = this.resolveTargetTable(relation);
          fields[fieldName] = this.tableGen.getTextField({
            references: { table: targetTable, field: 'id' }
          });
        }
        continue; // m2m relations get junction tables, not a column
      }

      fields[fieldName] = this.buildFieldDefinition(fieldName, fieldDef);
    }

    // Composite uniques: one row per item per locale, slug unique within a locale.
    const indexes = [
      {
        type: 'unique',
        name: `${tableName}_item_locale_unique_idx`,
        columns: [fkField, 'locale']
      },
      {
        type: 'unique',
        name: `${tableName}_slug_locale_unique_idx`,
        columns: ['slug', 'locale']
      }
    ];

    const table = this.tableGen.createMainTable(tableName, fields, entityInfo, indexes);

    // Register the FK relationship so Drizzle's `relations()` knows about it.
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
   * Create the main collection table.
   *
   * `opts.relaxed = true` drops NOT NULL / UNIQUE on content columns — used
   * for the localized main table, where those constraints would block
   * `ALTER TABLE ADD COLUMN` on populated rows during the localized flip.
   */
  createMainCollectionTable(collectionSlug, definition, coreFields, entityInfo, opts = {}) {
    const tableName = `collection_${collectionSlug}`;

    // Merge core fields with template fields
    const allFields = this.mergeFields(definition, coreFields);

    // Build table fields, excluding relations (they get separate tables/foreign keys)
    const tableFields = this.buildMainTableFields(allFields, definition, opts);

    return this.tableGen.createMainTable(tableName, tableFields, entityInfo, undefined, opts);
  }

  /**
   * Identity-only main table for a localized collection in steady state.
   * Holds the per-item identity fields (id + audit columns + author) — every
   * editable / translatable field lives on the `_locales` sibling. This is
   * what drizzle's journal sees as canonical for localized collections after
   * the initial flip migrator has finished moving data.
   */
  createIdentityOnlyMainTable(collectionSlug, entityInfo) {
    const tableName = `collection_${collectionSlug}`;
    const fields = {
      id: this.tableGen.getPrimaryKeyField(),
      created_at: this.tableGen.getTimestampField(),
      deleted_at: this.tableGen.getNullableTimestampField(),
      deleted_by: this.tableGen.getTextField(),
      // `author` is per-item (original creator) and stays on main — same as
      // collections.js MAIN_ONLY treatment. Other audit fields like
      // `updated_at` / `last_modified_by` are per-translation and live on
      // `_locales`.
      author: this.tableGen.getTextField()
    };
    return this.tableGen.createMainTable(tableName, fields, entityInfo);
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
  buildMainTableFields(allFields, definition, opts = {}) {
    const fields = {
      id: this.tableGen.getPrimaryKeyField(),
      created_at: this.tableGen.getTimestampField(),
      // updated_at lives canonically on `_locales` for localized
      // collections (per-translation modification time). Keep it
      // nullable on main when relaxed so the localized flip's
      // ALTER TABLE ADD COLUMN doesn't trip SQLite's NOT NULL guard.
      updated_at: opts.relaxed
        ? this.tableGen.getNullableTimestampField()
        : this.tableGen.getTimestampField(),
      deleted_at: this.tableGen.getNullableTimestampField(),
      deleted_by: this.tableGen.getTextField()
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
        // All file fields use relation tables (no columns on main table)
        continue;
      }

      if (fieldDef.type === 'tags') {
        // Tags are stored via the polymorphic `taggables` join table, not as
        // a column on the entity. Skip so we don't create a phantom column.
        continue;
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
