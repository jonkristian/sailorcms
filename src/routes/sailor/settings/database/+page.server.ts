import { error } from '@sveltejs/kit';
import { db, collectionTypes, blockTypes, globalTypes } from '$sailor/core/db/index.server';
import { sql } from 'drizzle-orm';
import * as schema from '$sailor/generated/schema';

interface TableInfo {
  name: string;
  columns: unknown[];
  rowCount: number;
}

interface RowCountRow {
  count: number;
}

function getTableType(tableName: string): string {
  if (tableName.startsWith('global_')) return 'Global';
  if (tableName.startsWith('collection_')) return 'Collection';
  if (tableName.startsWith('block_')) return 'Block';
  return 'System';
}

function sortTablesByType(tables: TableInfo[]): TableInfo[] {
  const typeOrder = ['System', 'Collection', 'Global', 'Block'];
  return tables.sort((a, b) => {
    const typeA = getTableType(a.name);
    const typeB = getTableType(b.name);
    const orderA = typeOrder.indexOf(typeA);
    const orderB = typeOrder.indexOf(typeB);

    // If same type, sort alphabetically by name
    if (orderA === orderB) {
      return a.name.localeCompare(b.name);
    }

    return orderA - orderB;
  });
}

async function getTableInfo(): Promise<TableInfo[]> {
  // Get all table names from our Drizzle schema (database-agnostic)
  const tableNames = Object.keys(schema).filter((key) => {
    const table = (schema as Record<string, unknown>)[key];
    return table && typeof table === 'object' && 'getSQL' in table; // This is a table object
  });

  // Build all table info queries in parallel using actual table names
  const tableInfoQueries = tableNames.map(async (tableName) => {
    // Get row count using Drizzle (database-agnostic)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const table = (schema as any)[tableName];
    let rowCount;
    try {
      const result = await db.select({ count: sql`COUNT(*)` }).from(table);
      rowCount = { rows: [{ count: result[0]?.count || 0 }] };
    } catch {
      rowCount = { rows: [{ count: 0 }] };
    }

    // Get the actual database table name from the Drizzle table object
    const actualTableName = table[Symbol.for('drizzle:Name')] || table._.name || tableName;

    return {
      name: actualTableName,
      columns: [], // Column info not needed for basic table listing
      rowCount: Number((rowCount.rows[0] as unknown as RowCountRow).count)
    };
  });

  // Execute all table info queries in parallel
  const tableInfo = await Promise.all(tableInfoQueries);

  // Sort tables by type
  return sortTablesByType(tableInfo);
}

export const load = async () => {
  // Authentication and admin authorization handled by hooks

  // Get all data in parallel for better performance
  const [tableSchemas, collectionTypesData, blockTypesData, globalTypesData] = await Promise.all([
    getTableInfo(),
    db.select().from(collectionTypes).all(),
    db.select().from(blockTypes).all(),
    db.select().from(globalTypes).all()
  ]);

  return {
    tables: tableSchemas,
    collectionTypes: collectionTypesData,
    blockTypes: blockTypesData,
    globalTypes: globalTypesData
  };
};
