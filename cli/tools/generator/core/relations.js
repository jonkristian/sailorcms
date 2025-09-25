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

    // Generate relations from collected metadata
    for (const relation of this.metadata.getAllRelations()) {
      relations.push(this.createRelationDefinition(relation));
    }

    return relations;
  }

  /**
   * Create a Drizzle relation definition
   */
  createRelationDefinition(relation) {
    const { fromTable, toTable, type, foreignKey, references } = relation;

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
    // Deduplicate relation names to avoid conflicts
    const used = new Set();
    const filter = (relations) =>
      relations.filter((rel) => {
        if (!rel) return false;
        const name = rel.match(/export const (\w+)Relations/)?.[1];
        if (!name) return true;
        if (used.has(name)) return false;
        used.add(name);
        return true;
      });

    return {
      standard: filter(this.generateAllRelations()),
      files: filter(this.generateFileRelations()),
      junctions: filter(this.generateJunctionRelations())
    };
  }
}
