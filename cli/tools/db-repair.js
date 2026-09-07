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
import { TIMESTAMP_REPAIR } from './db-repair-timestamps.js';
import { ACCOUNT_ISSUER_REPAIR, CREDENTIAL_ACCOUNT_ID_REPAIR } from './db-repair-accounts.js';

export const SCHEMA_REPAIR = {
  id: 'schema',
  label: 'schema drift (missing tables/columns vs schema.ts)',
  run: runSchemaRepair
};

/**
 * Apply schema drift repairs. Shared by the standalone `db:repair` command and
 * `db:repair --all`, so it neither opens nor closes the client and never calls
 * process.exit.
 *
 * Returns { status: 'ok' | 'would-change' | 'changed' | 'refused', rows }.
 */
export async function runSchemaRepair({ client, targetDir, dryRun = false }) {
  const schemaPath = path.join(targetDir, 'src/lib/sailor/generated/schema.ts');
  if (!existsSync(schemaPath)) {
    console.error(`❌ schema.ts not found at ${schemaPath}. Run \`npx sailor db:update\` first.`);
    return { status: 'refused', rows: 0 };
  }

  const expected = parseSchemaFile(readFileSync(schemaPath, 'utf-8'));
  if (expected.size === 0) {
    console.error('❌ Could not parse any tables from schema.ts.');
    return { status: 'refused', rows: 0 };
  }

  console.log(dryRun ? '🔍 Dry run — scanning for schema drift…' : '🛠️  Repairing schema drift…');

  {
    const dbTables = new Set(
      (
        await client.execute(
          `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%' AND name NOT LIKE 'search_index_fts%'`
        )
      ).rows.map((r) => r.name)
    );

    const missingTables = []; // { name, columns, indexes }
    const alters = []; // { table, column, sql }

    for (const [tableName, { columns, indexes }] of expected) {
      if (!dbTables.has(tableName)) {
        missingTables.push({ name: tableName, columns, indexes });
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
      if (missingTables.length > 0) {
        console.log(`\nMissing tables (${missingTables.length}):`);
        for (const t of missingTables) console.log(`  ${t.name} (${t.indexes.length} indexes)`);
      }
      if (alters.length > 0) {
        console.log(`\nMissing columns (${alters.length}):`);
        for (const a of alters) console.log(`  ${a.table}.${a.column}`);
      }

      if (!dryRun) {
        // Create missing tables first — column-add ALTERs may target tables
        // that didn't exist a moment ago (rare, but defensive).
        if (missingTables.length > 0) {
          console.log('\nCreating missing tables…');
          for (const t of missingTables) {
            await client.execute(buildCreateTable(t.name, t.columns));
            for (const idx of t.indexes) {
              await client.execute(buildCreateIndex(t.name, idx));
            }
            console.log(`  ✓ ${t.name} (${t.indexes.length} indexes)`);
          }
        }
        if (alters.length > 0) {
          console.log('\nApplying ALTER TABLE statements…');
          for (const a of alters) {
            await client.execute(a.sql);
            console.log(`  ✓ ${a.table}.${a.column}`);
          }
        }
      }
    }

    // Reconcile __drizzle_migrations so future drizzle.migrate() works.
    // Only touch it when empty — once populated, drizzle owns it.
    if (!dryRun) {
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

    if (alters.length > 0 && !dryRun) {
      console.log(`\n✅ Repaired ${alters.length} column(s).`);
    } else if (alters.length > 0 && dryRun) {
      console.log(
        `\n${alters.length} ALTER statement(s) would run. Re-run without --dry-run to apply.`
      );
    }

    const changes = alters.length + missingTables.length;
    if (changes === 0) return { status: 'ok', rows: 0 };
    return { status: dryRun ? 'would-change' : 'changed', rows: changes };
  }
}

// Ordered: schema first — the data repairs below may target columns the schema
// pass has just added (accounts.issuer is exactly that case).
const REPAIR_STEPS = [
  SCHEMA_REPAIR,
  TIMESTAMP_REPAIR,
  ACCOUNT_ISSUER_REPAIR,
  CREDENTIAL_ACCOUNT_ID_REPAIR
];

async function runAllRepairs({ client, targetDir, dryRun }) {
  const results = [];
  let pendingUpstream = false;
  for (const step of REPAIR_STEPS) {
    console.log(`\n${'─'.repeat(60)}\n▶ ${step.label}\n`);
    let result;
    try {
      result = await step.run({ client, targetDir, dryRun });
    } catch (err) {
      console.error(`❌ ${step.id} failed: ${err.message}`);
      result = { status: 'failed', rows: 0 };
    }
    // A dry run applies nothing, so a later step can refuse on a precondition
    // an earlier *pending* step would have satisfied (accounts.issuer needs the
    // column the schema pass is about to add). That's not a failure — report it
    // as deferred so a healthy upgrade path doesn't dry-run as broken.
    if (dryRun && result.status === 'refused' && pendingUpstream) {
      console.log('   ↑ expected in --dry-run: an earlier pending repair provides this.');
      result = { status: 'deferred', rows: 0 };
    }
    if (result.status === 'would-change' || result.status === 'changed') pendingUpstream = true;
    results.push({ step, ...result });
  }

  console.log(`\n${'─'.repeat(60)}\nSummary:`);
  const mark = {
    ok: '✓',
    changed: '✓',
    'would-change': '•',
    deferred: '•',
    refused: '✗',
    failed: '✗',
    skipped: '–'
  };
  for (const r of results) {
    const detail =
      r.status === 'changed'
        ? `${r.rows} change(s) applied`
        : r.status === 'would-change'
          ? `${r.rows} change(s) pending`
          : r.status === 'deferred'
            ? 'deferred — runs once the pending repairs above are applied'
            : r.status;
    console.log(`  ${mark[r.status] ?? '?'} ${r.step.id}: ${detail}`);
  }

  const blocked = results.filter((r) => r.status === 'refused' || r.status === 'failed');
  const pending = results.filter((r) => r.status === 'would-change');
  if (dryRun && (pending.length > 0 || results.some((r) => r.status === 'deferred'))) {
    console.log('\nRe-run without --dry-run to apply.');
  }
  return blocked.length === 0;
}

export function registerDbRepair(program) {
  program
    .command('db:repair')
    .description(
      'Apply missing columns from schema.ts to the live DB and reconcile migration tracking'
    )
    .option('--dry-run', 'Report drift without modifying anything')
    .option('--all', 'Also run the data repairs (timestamps, accounts.issuer) in dependency order')
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

      try {
        if (options.all) {
          const ok = await runAllRepairs({ client, targetDir, dryRun: options.dryRun });
          if (!ok) process.exit(1);
          return;
        }
        const result = await runSchemaRepair({ client, targetDir, dryRun: options.dryRun });
        if (result.status === 'refused') process.exit(1);
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
  for (const [tableName, { columns }] of expected) {
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
 * Parse a generated schema.ts file. Returns
 *   Map<sqliteTableName, { columns: Column[], indexes: Index[] }>
 * where Column = { name, type, mode?, default?, notNull, unique, primaryKey }
 * and Index = { name, columns: string[], unique: boolean }.
 *
 * Relies on the predictable shape produced by our schema generator — one column
 * per line, `<prop>: text('<col>')…` or `<prop>: integer('<col>'[, …])…`, and
 * an optional 3rd-arg index callback `(table) => [index('…').on(table.col), …]`.
 */
function parseSchemaFile(text) {
  const result = new Map();
  // Match both the 2-arg form `sqliteTable('Y', { … })` and the 3-arg index
  // form `sqliteTable('Y', { … }, (table) => [ … ])`. Whitespace allowed after
  // the opening `(` (generator emits the name on its own line for tables with
  // index callbacks). Group 3 captures the optional index body.
  const tableRegex =
    /export const \w+ = sqliteTable\(\s*['"](\w+)['"]\s*,\s*\{([\s\S]*?)\n\s*\}(?:\s*,\s*\(\s*\w+\s*\)\s*=>\s*\[([\s\S]*?)\n\s*\])?\s*\)/g;
  let tm;
  while ((tm = tableRegex.exec(text))) {
    const [, sqlTableName, body, indexBody] = tm;
    const cols = [];
    for (const line of body.split('\n')) {
      const col = parseColumnLine(line);
      if (col) cols.push(col);
    }
    const indexes = indexBody ? parseIndexes(indexBody) : [];
    result.set(sqlTableName, { columns: cols, indexes });
  }
  return result;
}

/**
 * Parse the 3rd-arg index callback body of a sqliteTable definition. Matches
 * entries like `index('name').on(table.col1, table.col2)` and
 * `uniqueIndex('name').on(...)`. Returns Index[] with name, columns, unique.
 */
function parseIndexes(indexBody) {
  const indexes = [];
  const entryRegex = /(uniqueIndex|index)\(['"](\w+)['"]\)\.on\(([^)]+)\)/g;
  let m;
  while ((m = entryRegex.exec(indexBody))) {
    const [, kind, name, onArgs] = m;
    const columns = onArgs
      .split(',')
      .map((s) =>
        s
          .trim()
          .replace(/^table\./, '')
          .replace(/[`'"]/g, '')
      )
      .filter(Boolean);
    indexes.push({ name, columns, unique: kind === 'uniqueIndex' });
  }
  return indexes;
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
  const primaryKey = /\.primaryKey\(\)/.test(line);

  return { name, type, mode, default: defaultValue, notNull, unique, primaryKey };
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

/**
 * Emit a CREATE TABLE statement for a parsed table definition. Honors
 * primaryKey / notNull / unique / default per column. Skips `$defaultFn` — the
 * application layer (drizzle) supplies those at insert time.
 */
function buildCreateTable(tableName, columns) {
  const lines = columns.map((col) => {
    const sqlType = col.type === 'integer' ? 'INTEGER' : 'TEXT';
    let s = `  "${col.name}" ${sqlType}`;
    if (col.primaryKey) s += ' PRIMARY KEY';
    if (col.notNull && !col.primaryKey) s += ' NOT NULL';
    if (col.unique && !col.primaryKey) s += ' UNIQUE';
    if (col.default !== undefined) {
      const literal =
        typeof col.default === 'string' ? `'${col.default.replace(/'/g, "''")}'` : col.default;
      s += ` DEFAULT ${literal}`;
    }
    return s;
  });
  return `CREATE TABLE "${tableName}" (\n${lines.join(',\n')}\n)`;
}

/**
 * Emit a CREATE [UNIQUE] INDEX statement for a parsed index definition.
 */
function buildCreateIndex(tableName, idx) {
  const unique = idx.unique ? 'UNIQUE ' : '';
  const cols = idx.columns.map((c) => `"${c}"`).join(', ');
  return `CREATE ${unique}INDEX "${idx.name}" ON "${tableName}"(${cols})`;
}
