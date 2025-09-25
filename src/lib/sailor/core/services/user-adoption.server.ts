import { db } from '../db/index.server';
import * as schema from '../../generated/schema';
import { eq, sql } from 'drizzle-orm';
// Database type removed - using any for flexibility

interface TableInfo {
  tableName: string;
  table: any;
  authorField?: string;
  modifierField?: string;
}

/**
 * Discovers all collection and global tables from schema
 */
export function discoverAllContentTables(): string[] {
  const tables: string[] = [];
  const schemaEntries = Object.entries(schema);

  for (const [exportName, tableDefinition] of schemaEntries) {
    // Skip non-table exports (types, functions, etc.)
    if (!tableDefinition || typeof tableDefinition !== 'object' || !('_' in tableDefinition)) {
      continue;
    }

    // Check if it's a collection or global table (including _items tables)
    const isCollection = exportName.startsWith('collection_');
    const isGlobal = exportName.startsWith('global_');

    if (isCollection || isGlobal) {
      tables.push(exportName);
    }
  }

  return tables.sort(); // Sort for consistent ordering
}

/**
 * Discovers all collection and global tables with author/modifier fields
 */
function discoverContentTables(): TableInfo[] {
  const tables: TableInfo[] = [];

  // Get all exported tables from schema
  const schemaEntries = Object.entries(schema);

  for (const [exportName, tableDefinition] of schemaEntries) {
    // Skip non-table exports (types, functions, etc.)
    if (!tableDefinition || typeof tableDefinition !== 'object' || !('_' in tableDefinition)) {
      continue;
    }

    // Check if it's a collection or global table
    const isCollection = exportName.startsWith('collection_');
    const isGlobal = exportName.startsWith('global_') && !exportName.endsWith('_items');

    if (!isCollection && !isGlobal) {
      continue;
    }

    const table = tableDefinition as any;
    const columns = table._.columns;

    if (!columns) {
      continue;
    }

    // Look for author and modifier fields
    let authorField: string | undefined;
    let modifierField: string | undefined;

    for (const [columnName, columnDef] of Object.entries(columns)) {
      if (columnName === 'author' || columnName === 'created_by') {
        authorField = columnName;
      }
      if (columnName === 'last_modified_by' || columnName === 'updated_by') {
        modifierField = columnName;
      }
    }

    // Only include tables that have at least one user reference field
    if (authorField || modifierField) {
      tables.push({
        tableName: exportName,
        table,
        authorField,
        modifierField
      });
    }
  }

  return tables;
}

/**
 * Transfers content ownership from one user to another
 */
export async function adoptUserContent(fromUserId: string, toUserId: string): Promise<void> {
  const contentTables = discoverContentTables();

  if (contentTables.length === 0) {
    console.warn('No content tables found for user adoption');
    return;
  }

  await db.transaction(async (tx: any) => {
    for (const tableInfo of contentTables) {
      const { table, authorField, modifierField } = tableInfo;

      try {
        // Transfer author ownership if the field exists
        if (authorField) {
          await tx
            .update(table)
            .set({ [authorField]: toUserId })
            .where(eq(table[authorField], fromUserId));
        }

        // Transfer modifier ownership if the field exists
        if (modifierField) {
          await tx
            .update(table)
            .set({ [modifierField]: toUserId })
            .where(eq(table[modifierField], fromUserId));
        }

        console.log(`✅ Transferred ownership in ${tableInfo.tableName}`);
      } catch (error) {
        console.error(`❌ Failed to transfer ownership in ${tableInfo.tableName}:`, error);
        // Continue with other tables rather than failing the entire transaction
      }
    }
  });
}

/**
 * Deletes all content created by a user (cascade delete)
 */
export async function deleteUserContent(userId: string): Promise<void> {
  const contentTables = discoverContentTables();

  if (contentTables.length === 0) {
    console.warn('No content tables found for user content deletion');
    return;
  }

  await db.transaction(async (tx: any) => {
    for (const tableInfo of contentTables) {
      const { table, authorField } = tableInfo;

      // Only delete content if there's an author field (don't delete based on modifier field only)
      if (!authorField) {
        continue;
      }

      try {
        await tx.delete(table).where(eq(table[authorField], userId));
        console.log(`✅ Deleted user content from ${tableInfo.tableName}`);
      } catch (error) {
        console.error(`❌ Failed to delete user content from ${tableInfo.tableName}:`, error);
        // Continue with other tables rather than failing the entire transaction
      }
    }
  });
}

/**
 * Gets a summary of content owned by a user (for UI display)
 */
export async function getUserContentSummary(userId: string): Promise<Record<string, number>> {
  const contentTables = discoverContentTables();
  const summary: Record<string, number> = {};

  for (const tableInfo of contentTables) {
    const { tableName, table, authorField } = tableInfo;

    // Only count content where user is the author
    if (!authorField) {
      continue;
    }

    try {
      const count = await db
        .select({ count: sql<number>`count(*)` })
        .from(table)
        .where(eq(table[authorField], userId));

      const itemCount = count[0]?.count || 0;
      if (itemCount > 0) {
        // Convert table name to human readable (e.g., "collection_posts" -> "Posts")
        const displayName = tableName
          .replace(/^(collection_|global_)/, '')
          .replace(/_/g, ' ')
          .replace(/\b\w/g, (l) => l.toUpperCase());

        summary[displayName] = itemCount;
      }
    } catch (error) {
      console.error(`Failed to count content in ${tableName}:`, error);
    }
  }

  return summary;
}
