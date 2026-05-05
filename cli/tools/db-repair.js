// Repair schema drift between the live DB and src/lib/sailor/generated/schema.ts.
//
// Background: when a project upgrades from push-based syncing to migrate-based
// (0.4.0), runMigrations bootstraps __drizzle_migrations by recording the
// journal head as "applied" — without verifying the DB schema actually matches
// that state. If the DB was behind (e.g., new template fields were added but
// never pushed), drizzle.migrate() then thinks everything is up to date and
// skips the migrations that would have added the missing columns.
//
// db:repair detects column-level drift, applies ALTER TABLE ADD COLUMN for
// any column present in schema.ts but missing from the DB, then sets up the
// __drizzle_migrations bootstrap row so future migrate() runs work normally.
//
// Scope:
//   - Adds missing columns (most common drift after a default-fix migration)
//   - Whole-table drift is reported but not auto-created (needs manual review)
//   - Postgres skipped — that path uses drizzle-kit push, no bootstrap problem

import path from 'path';
import { existsSync, readFileSync } from 'fs';
import fs from 'fs-extra';
import crypto from 'node:crypto';
import { createConsumerLibsqlClient } from '../utils.js';

export function registerDbRepair(program) {
  program
    .command('db:repair')
    .description(
      'Apply missing columns from schema.ts to the live DB and reconcile migration tracking'
    )
    .option('--dry-run', 'Report drift without modifying anything')
    .action(async (options) => {
      const targetDir = process.cwd();

      const { client, skipped, skipReason } = await createConsumerLibsqlClient(targetDir, {
        skipPostgres:
          'Postgres detected — repair is SQLite/Turso-only. Use `drizzle-kit push` instead.'
      }).catch((err) => {
        console.error(`❌ ${err.message}`);
        process.exit(1);
      });
      if (skipped) {
        console.log(`ℹ️  ${skipReason}`);
        return;
      }

      const schemaPath = path.join(targetDir, 'src/lib/sailor/generated/schema.ts');
      if (!existsSync(schemaPath)) {
        console.error(
          `❌ schema.ts not found at ${schemaPath}. Run \`npx sailor db:update\` first.`
        );
        process.exit(1);
      }

      const expected = parseSchemaFile(readFileSync(schemaPath, 'utf-8'));
      if (expected.size === 0) {
        console.error('❌ Could not parse any tables from schema.ts.');
        process.exit(1);
      }

      console.log(
        options.dryRun ? '🔍 Dry run — scanning for schema drift…' : '🛠️  Repairing schema drift…'
      );

      try {
        const dbTables = new Set(
          (
            await client.execute(
              `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%' AND name NOT LIKE 'search_index_fts%'`
            )
          ).rows.map((r) => r.name)
        );

        const missingTables = [];
        const alters = []; // { table, column, sql }

        for (const [tableName, columns] of expected) {
          if (!dbTables.has(tableName)) {
            missingTables.push(tableName);
            continue;
          }
          const actualCols = new Set(
            (await client.execute(`PRAGMA table_info("${tableName}")`)).rows.map((r) => r.name)
          );
          for (const col of columns) {
            if (!actualCols.has(col.name)) {
              alters.push({
                table: tableName,
                column: col.name,
                sql: buildAlterAddColumn(tableName, col)
              });
            }
          }
        }

        if (missingTables.length === 0 && alters.length === 0) {
          console.log('✅ No drift detected — DB schema matches schema.ts.');
        } else {
          if (alters.length > 0) {
            console.log(`\nMissing columns (${alters.length}):`);
            for (const a of alters) console.log(`  ${a.table}.${a.column}`);
          }
          if (missingTables.length > 0) {
            console.log(`\n⚠️  Missing tables (${missingTables.length}):`);
            for (const t of missingTables) console.log(`  ${t}`);
            console.log(
              '   Tables cannot be auto-created safely — they likely need fresh migrations or seed data. Run `npx sailor db:update` after addressing these.'
            );
          }

          if (!options.dryRun && alters.length > 0) {
            console.log('\nApplying ALTER TABLE statements…');
            for (const a of alters) {
              await client.execute(a.sql);
              console.log(`  ✓ ${a.table}.${a.column}`);
            }
          }
        }

        // Reconcile __drizzle_migrations so future drizzle.migrate() works.
        // Only touch it when empty — once populated, drizzle owns it.
        if (!options.dryRun) {
          await client.execute(
            `CREATE TABLE IF NOT EXISTS __drizzle_migrations (id INTEGER PRIMARY KEY, hash text NOT NULL, created_at numeric)`
          );
          const { rows: countRow } = await client.execute(
            'SELECT COUNT(*) as count FROM __drizzle_migrations'
          );
          if (Number(countRow[0].count) === 0) {
            const journalPath = path.join(targetDir, 'drizzle', 'meta', '_journal.json');
            if (await fs.pathExists(journalPath)) {
              const journal = await fs.readJson(journalPath);
              if (journal.entries?.length) {
                const latest = journal.entries[journal.entries.length - 1];
                const sqlPath = path.join(targetDir, 'drizzle', `${latest.tag}.sql`);
                const hash = crypto
                  .createHash('sha256')
                  .update(await fs.readFile(sqlPath, 'utf-8'))
                  .digest('hex');
                await client.execute({
                  sql: 'INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)',
                  args: [hash, latest.when]
                });
                console.log(
                  `\n📋 Recorded ${latest.tag} as the migration high-water mark (was empty).`
                );
              }
            }
          }
        }

        if (alters.length > 0 && !options.dryRun) {
          console.log(`\n✅ Repaired ${alters.length} column(s).`);
        } else if (alters.length > 0 && options.dryRun) {
          console.log(
            `\n${alters.length} ALTER statement(s) would run. Re-run without --dry-run to apply.`
          );
        }
      } catch (err) {
        console.error('❌ Repair failed:', err.message);
        process.exit(1);
      } finally {
        client.close?.();
      }
    });
}

/**
 * Compute drift between schema.ts and a live libsql client. Returns:
 *   { missingTables: string[], missingColumns: { table: string, column: string }[] }
 * Used by both the CLI and runMigrations' bootstrap-safety check.
 */
export async function detectSchemaDrift(client, schemaPath) {
  if (!existsSync(schemaPath)) return { missingTables: [], missingColumns: [] };
  const expected = parseSchemaFile(readFileSync(schemaPath, 'utf-8'));
  const dbTables = new Set(
    (
      await client.execute(
        `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%' AND name NOT LIKE 'search_index_fts%'`
      )
    ).rows.map((r) => r.name)
  );
  const missingTables = [];
  const missingColumns = [];
  for (const [tableName, columns] of expected) {
    if (!dbTables.has(tableName)) {
      missingTables.push(tableName);
      continue;
    }
    const actualCols = new Set(
      (await client.execute(`PRAGMA table_info("${tableName}")`)).rows.map((r) => r.name)
    );
    for (const col of columns) {
      if (!actualCols.has(col.name)) missingColumns.push({ table: tableName, column: col.name });
    }
  }
  return { missingTables, missingColumns };
}

/**
 * Parse a generated schema.ts file. Returns Map<sqliteTableName, Column[]> where
 * Column = { name, type, mode?, default?, notNull, unique }.
 *
 * Relies on the predictable shape produced by our schema generator — one column
 * per line, `<prop>: text('<col>')…` or `<prop>: integer('<col>'[, …])…`.
 */
function parseSchemaFile(text) {
  const result = new Map();
  // Match: export const X = sqliteTable('Y', { ... });
  const tableRegex = /export const \w+ = sqliteTable\(['"](\w+)['"]\s*,\s*\{([\s\S]*?)\n\}\)/g;
  let tm;
  while ((tm = tableRegex.exec(text))) {
    const [, sqlTableName, body] = tm;
    const cols = [];
    for (const line of body.split('\n')) {
      const col = parseColumnLine(line);
      if (col) cols.push(col);
    }
    result.set(sqlTableName, cols);
  }
  return result;
}

function parseColumnLine(line) {
  // Match: text('name')... or integer('name'[, { mode: 'X' }])...
  const textMatch = line.match(/:\s*text\(['"](\w+)['"]\)/);
  const intMatch = line.match(
    /:\s*integer\(['"](\w+)['"](?:\s*,\s*\{\s*mode:\s*['"](\w+)['"]\s*\})?\)/
  );
  if (!textMatch && !intMatch) return null;
  const name = (textMatch || intMatch)[1];
  const type = textMatch ? 'text' : 'integer';
  const mode = intMatch ? intMatch[2] : undefined;

  // Defaults: .default(value) — value is a JSON-ish literal
  let defaultValue;
  const defaultMatch = line.match(/\.default\(([^)]+)\)/);
  if (defaultMatch) {
    const raw = defaultMatch[1].trim();
    if (raw === 'true') defaultValue = 1;
    else if (raw === 'false') defaultValue = 0;
    else if (/^-?\d+(\.\d+)?$/.test(raw)) defaultValue = Number(raw);
    else if (/^['"].*['"]$/.test(raw)) defaultValue = raw.slice(1, -1);
    // Skip $defaultFn — those are runtime-only, not column defaults
  }

  const notNull = /\.notNull\(\)/.test(line);
  const unique = /\.unique\(\)/.test(line);

  return { name, type, mode, default: defaultValue, notNull, unique };
}

function buildAlterAddColumn(tableName, col) {
  const sqlType = col.type === 'integer' ? 'INTEGER' : 'TEXT';
  let stmt = `ALTER TABLE "${tableName}" ADD COLUMN "${col.name}" ${sqlType}`;
  if (col.default !== undefined) {
    const literal =
      typeof col.default === 'string' ? `'${col.default.replace(/'/g, "''")}'` : col.default;
    stmt += ` DEFAULT ${literal}`;
  }
  // Note: we deliberately don't emit NOT NULL — SQLite requires a DEFAULT for
  // NOT NULL ADD COLUMN, and adding NOT NULL after the fact on possibly-existing
  // rows is risky. The application layer will handle null tolerance.
  return stmt;
}
