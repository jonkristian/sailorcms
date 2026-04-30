// Repair `created_at` / `updated_at` / `deleted_at` columns that hold
// millisecond values where the schema expects seconds.
//
// Background: schema columns are `integer({ mode: 'timestamp' })` (seconds).
// A handful of raw-SQL write paths previously bound `Date` / `Date.now()`
// directly, which the libsql driver serializes as milliseconds — pushing
// stored values 1000× too high. Drizzle then multiplies by 1000 on read,
// landing in the year ~58000 instead of the intended date.
//
// Detection: any timestamp value `> 9999999999` (year 2286 in seconds) has
// to be ms-leakage; real seconds-based timestamps for any plausible date
// fall well below that threshold.
//
// Repair: `UPDATE <table> SET <col> = <col> / 1000 WHERE <col> > 9999999999`,
// applied across every `_at`-suffixed integer column in the DB.
//
// Postgres: skipped — driver/column semantics differ.

import path from 'path';
import { existsSync } from 'fs';
import { pathToFileURL } from 'url';

const MS_THRESHOLD = 9999999999n; // year 2286 in seconds

export function registerDbRepairTimestamps(program) {
  program
    .command('db:repair-timestamps')
    .description('Repair timestamp columns containing millisecond values (writes seconds)')
    .option('--dry-run', 'Report affected rows without modifying anything')
    .action(async (options) => {
      const targetDir = process.cwd();

      // Load env
      try {
        const dotenvPath = path.join(targetDir, 'node_modules', 'dotenv', 'lib', 'main.js');
        if (existsSync(dotenvPath)) {
          const { config } = await import(pathToFileURL(dotenvPath).href);
          config({ path: path.join(targetDir, '.env') });
        }
      } catch {}

      const dbUrl = process.env.DATABASE_URL;
      if (!dbUrl) {
        console.error('❌ DATABASE_URL is not set.');
        process.exit(1);
      }

      if (dbUrl.startsWith('postgres')) {
        console.log('ℹ️  Postgres detected — repair is SQLite-only. Nothing to do.');
        return;
      }

      const { createClient } = await import('@libsql/client');
      const client = createClient({
        url: dbUrl,
        authToken: process.env.DATABASE_AUTH_TOKEN
      });

      console.log(
        options.dryRun
          ? '🔍 Dry run — scanning for timestamp columns with ms-leakage…'
          : '🛠️  Repairing timestamp columns with ms-leakage…'
      );

      try {
        // List user tables
        const tables = await client.execute(
          `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> '__drizzle_migrations'`
        );

        let totalAffected = 0;
        const repaired = [];

        for (const row of tables.rows) {
          const tableName = row.name;
          // Get integer-typed `_at` columns
          const cols = await client.execute(`PRAGMA table_info("${tableName}")`);
          const tsCols = cols.rows
            .filter((c) => /_at$/.test(c.name) && /^INTEGER$/i.test(c.type || ''))
            .map((c) => c.name);

          for (const col of tsCols) {
            const countResult = await client.execute({
              sql: `SELECT COUNT(*) AS n FROM "${tableName}" WHERE "${col}" > ?`,
              args: [Number(MS_THRESHOLD)]
            });
            const n = Number(countResult.rows[0].n);
            if (n === 0) continue;

            console.log(`  ${tableName}.${col}: ${n} row(s) affected`);
            totalAffected += n;
            repaired.push({ table: tableName, column: col, rows: n });

            if (!options.dryRun) {
              await client.execute({
                sql: `UPDATE "${tableName}" SET "${col}" = "${col}" / 1000 WHERE "${col}" > ?`,
                args: [Number(MS_THRESHOLD)]
              });
            }
          }
        }

        if (totalAffected === 0) {
          console.log('✅ Nothing to repair — no ms-leakage detected.');
        } else if (options.dryRun) {
          console.log(
            `\n${totalAffected} row(s) would be updated. Re-run without --dry-run to apply.`
          );
        } else {
          console.log(`\n✅ Repaired ${totalAffected} row(s) across ${repaired.length} column(s).`);
        }
      } catch (err) {
        console.error('❌ Repair failed:', err.message);
        process.exit(1);
      } finally {
        client.close?.();
      }
    });
}
