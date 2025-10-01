// Generate Drizzle relation definitions from collected metadata

export class RelationGenerator {
  constructor(metadataCollector) {
    this.metadata = metadataCollector;
  }

  /**
   * Generate all relation definitions for the schema
   */
  generateAllRelations() {
    const relations = [];

    // Group relations by table name to handle multiple relations per table
    const relationsByTable = new Map();

    for (const relation of this.metadata.getAllRelations()) {
      const { fromTable } = relation;

      if (!relationsByTable.has(fromTable)) {
        relationsByTable.set(fromTable, []);
      }
      relationsByTable.get(fromTable).push(relation);
    }

    // Generate one relation definition per table that includes all its relations
    // Exclude file and junction tables since they have their own generators
    for (const [tableName, tableRelations] of relationsByTable.entries()) {
      // Skip file relation tables and junction tables
      const tableMetadata = this.metadata.getTableMetadata(tableName);
      if (tableMetadata?.type === 'file_relation' || tableMetadata?.type === 'junction') {
        continue;
      }

      const relationDef = this.createTableRelationDefinition(tableName, tableRelations);
      if (relationDef !== null) {
        relations.push(relationDef);
      }
    }

    return relations;
  }

  /**
   * Create a complete relation definition for a table including all its relations
   */
  createTableRelationDefinition(tableName, tableRelations) {
    // Validate that the table is registered in metadata
    if (!this.metadata.getTableMetadata(tableName)) {
      console.warn(`Warning: Relation references unknown table '${tableName}' - skipping relation`);
      return null;
    }

    const oneRelations = [];
    const manyRelations = [];

    for (const relation of tableRelations) {
      const { toTable, type, foreignKey, references } = relation;

      // Validate that target table exists
      if (!this.metadata.getTableMetadata(toTable)) {
        console.warn(`Warning: Relation references unknown table '${toTable}' - skipping relation`);
        continue;
      }

      if (type === 'many-to-one') {
        oneRelations.push(`${foreignKey}: one(${toTable}, {
    fields: [${tableName}.${foreignKey}],
    references: [${toTable}.${references}]
  })`);
      } else if (type === 'one-to-many') {
        // For one-to-many, we don't specify fields/references, just the target table
        // Use a different property name to avoid conflicts with many-to-one relations
        const relationName = toTable === tableName ? 'children' : `${foreignKey}_many`;
        manyRelations.push(`${relationName}: many(${toTable})`);
      }
    }

    // Generate the relation definition
    const relationParts = [];
    const destructuredParams = [];

    if (oneRelations.length > 0) {
      destructuredParams.push('one');
      relationParts.push(...oneRelations);
    }

    if (manyRelations.length > 0) {
      destructuredParams.push('many');
      relationParts.push(...manyRelations);
    }

    if (relationParts.length === 0) {
      return null;
    }

    return `export const ${tableName}Relations = relations(${tableName}, ({ ${destructuredParams.join(', ')} }) => ({
  ${relationParts.join(',\n  ')}
}));`;
  }

  /**
   * Create a Drizzle relation definition (legacy - kept for compatibility)
   */
  createRelationDefinition(relation) {
    const { fromTable, toTable, type, foreignKey, references } = relation;

    // Validate that both tables are registered in metadata
    if (!this.metadata.getTableMetadata(fromTable)) {
      console.warn(`Warning: Relation references unknown table '${fromTable}' - skipping relation`);
      return null;
    }
    if (!this.metadata.getTableMetadata(toTable)) {
      console.warn(`Warning: Relation references unknown table '${toTable}' - skipping relation`);
      return null;
    }

    if (type === 'many-to-one') {
      return `export const ${fromTable}Relations = relations(${fromTable}, ({ one }) => ({
  parent: one(${toTable}, {
    fields: [${fromTable}.${foreignKey}],
    references: [${toTable}.${references}]
  })
}));`;
    }

    if (type === 'one-to-many') {
      return `export const ${fromTable}Relations = relations(${fromTable}, ({ many }) => ({
  children: many(${toTable})
}));`;
    }

    if (type === 'many-to-many') {
      // Junction table relations are handled separately
      return null;
    }

    throw new Error(`Unsupported relation type: ${type}`);
  }

  /**
   * Generate file-specific relations
   */
  generateFileRelations() {
    const fileRelationTables = this.metadata.getTablesByType('file_relation');
    const relations = [];

    for (const table of fileRelationTables) {
      const parentTable = table.parent.table;

      relations.push(`export const ${table.name}Relations = relations(${table.name}, ({ one }) => ({
  parent: one(${parentTable}, {
    fields: [${table.name}.parent_id],
    references: [${parentTable}.id]
  }),
  file: one(files, {
    fields: [${table.name}.file_id],
    references: [files.id]
  })
}));`);
    }

    return relations;
  }

  /**
   * Generate junction table relations for many-to-many
   */
  generateJunctionRelations() {
    const junctionTables = this.metadata.getTablesByType('junction');
    const relations = [];

    for (const table of junctionTables) {
      const { fromTable, toTable, fromKey, toKey } = table.junction;

      relations.push(`export const ${table.name}Relations = relations(${table.name}, ({ one }) => ({
  from: one(${fromTable}, {
    fields: [${table.name}.${fromKey}],
    references: [${fromTable}.id]
  }),
  to: one(${toTable}, {
    fields: [${table.name}.${toKey}],
    references: [${toTable}.id]
  })
}));`);
    }

    return relations;
  }

  /**
   * Generate all relations organized by type
   */
  generateOrganizedRelations() {
    // Simple filter to remove null relations
    const filter = (relations) => relations.filter((rel) => rel !== null);

    return {
      standard: filter(this.generateAllRelations()),
      files: filter(this.generateFileRelations()),
      junctions: filter(this.generateJunctionRelations())
    };
  }
}
