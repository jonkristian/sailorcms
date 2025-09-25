// Schema generation metadata collector
// Tracks table relationships explicitly instead of inferring from names

export class MetadataCollector {
  constructor() {
    this.metadata = new Map();
    this.relations = [];
  }

  /**
   * Register a table with its metadata
   */
  registerTable(tableName, metadata) {
    this.metadata.set(tableName, {
      name: tableName,
      ...metadata
    });
  }

  /**
   * Add a relation between two tables
   */
  addRelation(relationDef) {
    this.relations.push(relationDef);
  }

  /**
   * Get metadata for a specific table
   */
  getTableMetadata(tableName) {
    return this.metadata.get(tableName);
  }

  /**
   * Get all relations for generating Drizzle relation definitions
   */
  getAllRelations() {
    return this.relations;
  }

  /**
   * Get all tables of a specific type
   */
  getTablesByType(type) {
    return Array.from(this.metadata.values()).filter((meta) => meta.type === type);
  }

  /**
   * Get all tables for a specific entity
   */
  getTablesForEntity(entityType, entitySlug) {
    return Array.from(this.metadata.values()).filter(
      (meta) => meta.entity?.type === entityType && meta.entity?.slug === entitySlug
    );
  }

  /**
   * Validate that all relations reference existing tables
   */
  validateRelations() {
    const errors = [];
    const tableNames = new Set(this.metadata.keys());

    for (const relation of this.relations) {
      if (!tableNames.has(relation.fromTable)) {
        errors.push(`Relation references non-existent table: ${relation.fromTable}`);
      }
      if (!tableNames.has(relation.toTable)) {
        errors.push(`Relation references non-existent table: ${relation.toTable}`);
      }
    }

    if (errors.length > 0) {
      throw new Error(`Schema validation failed:\n${errors.join('\n')}`);
    }
  }

  /**
   * Clear all collected metadata (for testing)
   */
  reset() {
    this.metadata.clear();
    this.relations = [];
  }
}
