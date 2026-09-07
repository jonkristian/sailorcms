// Detect entities whose template has `localized: true` but whose `_locales`
// sibling table doesn't exist in the DB yet. The caller (`db:update`)
// captures this list BEFORE running migrations, then hands it off to the
// i18n migrator AFTER drizzle creates the `_locales` table — at which point
// the migrator copies main rows into `_locales` and re-points child tables.
//
// Postgres is not yet supported — DATABASE_URL pointing at Postgres falls
// through silently. SQLite/Turso (libsql) covers the dominant case for now.

import { existsSync, readdirSync } from 'fs';
import { pathToFileURL } from 'url';
import path from 'path';
import { sql } from 'drizzle-orm';
import { loadConsumerEnv } from '../utils.js';

async function loadDefinitionsFromDir(dir) {
  if (!existsSync(dir)) return {};
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && f !== 'index.ts');
  const defs = {};
  for (const file of files) {
    const mod = await import(pathToFileURL(path.join(dir, file)).href);
    for (const exp of Object.values(mod)) {
      if (
        exp &&
        typeof exp === 'object' &&
        typeof exp.slug === 'string' &&
        exp.fields &&
        typeof exp.fields === 'object'
      ) {
        defs[exp.slug] = exp;
      }
    }
  }
  return defs;
}

async function loadLocalizedCollections(targetDir) {
  const base = path.join(targetDir, 'src', 'lib', 'sailor', 'templates', 'collections');
  const all = await loadDefinitionsFromDir(base);
  return Object.fromEntries(Object.entries(all).filter(([, def]) => def.localized === true));
}

async function loadLocalizedGlobals(targetDir) {
  const base = path.join(targetDir, 'src', 'lib', 'sailor', 'templates', 'globals');
  const all = await loadDefinitionsFromDir(base);
  return Object.fromEntries(Object.entries(all).filter(([, def]) => def.localized === true));
}

/**
 * Open a libsql client against the consumer's DATABASE_URL. Returns null on
 * Postgres (caller treats null as "skip detection") so we don't crash the
 * happy path on non-SQLite backends.
 */
async function openLibsqlClient(targetDir) {
  await loadConsumerEnv(targetDir);
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return null;
  if (dbUrl.startsWith('postgres')) return null;

  const { createClient } = await import('@libsql/client');
  const { drizzle } = await import('drizzle-orm/libsql');
  const url = dbUrl.startsWith('file:') || dbUrl.startsWith('libsql:') ? dbUrl : `file:${dbUrl}`;
  const client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
  return drizzle(client);
}

async function sqliteTableExists(db, tableName) {
  const result = await db.run(
    sql.raw(`SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`)
  );
  return (result.rows || []).length > 0;
}

async function countRows(db, tableName) {
  try {
    const result = await db.run(sql.raw(`SELECT COUNT(*) AS n FROM "${tableName}"`));
    const row = result.rows?.[0];
    if (!row) return 0;
    // libsql returns rows as objects with column names; n could be number or string
    return Number(row.n ?? row[0] ?? 0);
  } catch {
    // Table doesn't exist or other error — treat as zero for migration purposes
    return 0;
  }
}

/**
 * Detect collections needing the localization migration.
 *
 * Returns an array of `{ slug, mainTable, localesTable, rowCount }` for each
 * collection where the template has `localized: true` but the DB doesn't
 * have the `_locales` sibling table yet. Empty array means nothing to do.
 *
 * Returns `null` on Postgres (or when DATABASE_URL is unset) — caller should
 * treat null as "skip" and proceed with the normal db:update flow.
 */
export async function detectLocalizedMigrations(targetDir) {
  const localizedCollections = await loadLocalizedCollections(targetDir);
  const localizedGlobals = await loadLocalizedGlobals(targetDir);

  if (
    Object.keys(localizedCollections).length === 0 &&
    Object.keys(localizedGlobals).length === 0
  ) {
    return [];
  }

  const db = await openLibsqlClient(targetDir);
  if (!db) return null;

  const needed = [];

  // Same detection logic for collections and globals — only the table prefix differs.
  const checkEntity = async (kind, slug) => {
    const prefix = kind === 'collection' ? 'collection_' : 'global_';
    const mainTable = `${prefix}${slug}`;
    const localesTable = `${mainTable}_locales`;

    const mainExists = await sqliteTableExists(db, mainTable);
    if (!mainExists) return;

    const localesExists = await sqliteTableExists(db, localesTable);
    if (localesExists) return;

    const rowCount = await countRows(db, mainTable);
    needed.push({ kind, slug, mainTable, localesTable, rowCount });
  };

  for (const slug of Object.keys(localizedCollections)) await checkEntity('collection', slug);
  for (const slug of Object.keys(localizedGlobals)) await checkEntity('global', slug);

  return needed;
}

/**
 * Pretty-print the pending list so the operator sees what's about to run
 * before the migrator kicks in.
 */
export function printPendingMigrations(migrations) {
  const total = migrations.reduce((sum, m) => sum + m.rowCount, 0);
  console.log('');
  console.log(
    `i18n auto-migration queued: ${migrations.length} entit${migrations.length === 1 ? 'y' : 'ies'}, ${total} row(s):`
  );
  for (const m of migrations) {
    const rows = `${m.rowCount} row${m.rowCount === 1 ? '' : 's'}`;
    const label = `${m.kind}:${m.slug}`;
    console.log(`  • ${label.padEnd(32)} ${rows}`);
  }
  console.log('');
}
