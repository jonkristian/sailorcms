// SvelteKit remote functions for user management
import { command, getRequestEvent } from '$app/server';
import { db } from '$sailor/core/db/index.server';
import { sql } from 'drizzle-orm';
import * as schema from '$sailor/generated/schema';
import { log } from '$sailor/core/utils/logger';

/**
 * Bulk delete users with optional content adoption
 */
export const bulkDeleteUsers = command(
  'unchecked',
  async ({ ids, adoptingUserId }: { ids: string[]; adoptingUserId?: string }) => {
    const { locals } = getRequestEvent();

    // Authentication and route-level ACL handled by hooks
    // Additional admin check for user deletion
    if (locals.user!.role !== 'admin') {
      return { success: false, error: 'Admin access required' };
    }

    if (!ids || ids.length === 0) {
      return { success: false, error: 'No user IDs provided' };
    }

    // Prevent admin from deleting themselves
    if (ids.includes(locals.user!.id)) {
      return { success: false, error: 'Cannot delete your own account' };
    }

    // If adopting user is provided, verify they exist and aren't being deleted
    if (adoptingUserId && ids.includes(adoptingUserId)) {
      return { success: false, error: 'Cannot adopt content to a user being deleted' };
    }

    try {
      await db.transaction(async (tx: any) => {
        // Get all collection and global tables from generated schema
        const tableEntries = Object.entries(schema).filter(([name, table]) => {
          return (
            (name.startsWith('collection_') || name.startsWith('global_')) &&
            table &&
            typeof table === 'object' &&
            !name.includes('Relations')
          ); // Exclude relation tables
        });

        for (const userId of ids) {
          if (adoptingUserId) {
            // Transfer content to adopting user
            for (const [schemaName, tableSchema] of tableEntries) {
              try {
                // Check if table has author column from schema
                if ('author' in tableSchema) {
                  await tx.run(sql`
                    UPDATE ${sql.identifier(schemaName)}
                    SET author = ${adoptingUserId}
                    WHERE author = ${userId}
                  `);
                }

                // Check if table has last_modified_by column from schema
                if ('last_modified_by' in tableSchema) {
                  await tx.run(sql`
                    UPDATE ${sql.identifier(schemaName)}
                    SET last_modified_by = ${adoptingUserId}
                    WHERE last_modified_by = ${userId}
                  `);
                }
              } catch (e: unknown) {
                log.error(`Error updating table ${schemaName}`, { schemaName, error: e });
              }
            }
          } else {
            // Cascade delete all content created by this user
            for (const [schemaName, tableSchema] of tableEntries) {
              try {
                // Check if table has author column from schema
                if ('author' in tableSchema) {
                  await tx.run(sql`
                    DELETE FROM ${sql.identifier(schemaName)}
                    WHERE author = ${userId}
                  `);
                }
              } catch (e: unknown) {
                log.warn(`Skipping table ${schemaName}`, { schemaName, error: e });
              }
            }
          }

          // Always delete auth data
          try {
            await tx.run(sql`DELETE FROM sessions WHERE user_id = ${userId}`);
            await tx.run(sql`DELETE FROM accounts WHERE user_id = ${userId}`);
          } catch (e: any) {
            log.error('Error deleting auth data', { error: e });
          }
        }

        // Delete the users
        await tx.run(sql`DELETE FROM users WHERE id IN ${ids}`);
      });

      const message = adoptingUserId
        ? `${ids.length} user${ids.length === 1 ? '' : 's'} deleted and content transferred successfully`
        : `${ids.length} user${ids.length === 1 ? '' : 's'} deleted successfully`;

      return { success: true, message, deletedCount: ids.length };
    } catch (error) {
      log.error('Failed to delete users', { error });
      return { success: false, error: 'Failed to delete users' };
    }
  }
);
