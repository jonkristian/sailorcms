// Auto-migrate populated rows when an entity flips to `localized: true`.
//
// Called from `db:update` AFTER drizzle-kit creates the `_locales` sibling.
// For each pending entity:
//
//   1. Seed `_locales` with one row per main row, copying every column that
//      exists in both tables. The seed row is locked to `content.defaultLocale`.
//   2. Re-point child tables (arrays, files, m2m junctions) so their FK
//      columns reference the new `_locales` row id instead of main.id.
//   3. Rewrite `taggables.taggable_type` from `<base>_locales` → `<base>` so
//      existing tag rows survive the unified taggable_type convention.
//
// Skips silently on Postgres (no adapter wired). Idempotent — re-running is
// safe because the INSERT skips main rows that already have a matching
// `_locales` row, and the child / taggables passes are no-ops once converted.

import { randomUUID } from 'crypto';
import { existsSync, readdirSync } from 'fs';
import { pathToFileURL } from 'url';
import path from 'path';
import { sql } from 'drizzle-orm';
import { loadConsumerEnv } from '../utils.js';

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

async function loadSettings(targetDir) {
  const settingsPath = path.join(targetDir, 'src', 'lib', 'sailor', 'templates', 'settings.ts');
  if (!existsSync(settingsPath)) return {};
  const mod = await import(pathToFileURL(settingsPath).href);
  return mod.settings ?? mod.default ?? {};
}

async function loadEntityDefinition(targetDir, kind, slug) {
  const dir = path.join(
    targetDir,
    'src',
    'lib',
    'sailor',
    'templates',
    kind === 'collection' ? 'collections' : 'globals'
  );
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && f !== 'index.ts');
  for (const file of files) {
    const mod = await import(pathToFileURL(path.join(dir, file)).href);
    for (const exp of Object.values(mod)) {
      if (exp && typeof exp === 'object' && exp.slug === slug) return exp;
    }
  }
  return null;
}

async function tableColumns(db, tableName) {
  const result = await db.run(sql.raw(`PRAGMA table_info("${tableName}")`));
  return (result.rows || []).map((r) => r.name);
}

async function tableExists(db, tableName) {
  const result = await db.run(
    sql.raw(`SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`)
  );
  return (result.rows || []).length > 0;
}

function snakeCase(str) {
  return String(str).replace(/[A-Z]/g, (m, i) =>
    i === 0 ? m.toLowerCase() : `_${m.toLowerCase()}`
  );
}

/**
 * Copy main → _locales rows for one entity. Returns the mapping
 * `Map<mainId, localeId>` so callers can re-point child tables.
 */
async function seedLocales(db, m, defaultLocale) {
  const fkField = `${m.slug}_id`;

  const mainCols = await tableColumns(db, m.mainTable);
  const localesCols = await tableColumns(db, m.localesTable);

  // Columns to copy: present in both tables, minus identity / FK / locale.
  const IDENTITY = new Set([
    'id',
    'created_at',
    'deleted_at',
    'deleted_by',
    'updated_at',
    fkField,
    'locale'
  ]);
  const copyCols = mainCols.filter((c) => localesCols.includes(c) && !IDENTITY.has(c));

  // Existing _locales rows: skip those main ids.
  const existing = await db.run(
    sql.raw(
      `SELECT "${fkField}" AS main_id FROM "${m.localesTable}" WHERE locale = '${defaultLocale}'`
    )
  );
  const alreadySeeded = new Set((existing.rows || []).map((r) => r.main_id));

  const selectCols = ['id', ...copyCols].map((c) => `"${c}"`).join(', ');
  const mainRowsRes = await db.run(sql.raw(`SELECT ${selectCols} FROM "${m.mainTable}"`));
  const mainRows = mainRowsRes.rows || [];

  const mapping = new Map();
  const nowSec = Math.floor(Date.now() / 1000);

  for (const row of mainRows) {
    if (alreadySeeded.has(row.id)) {
      // Already migrated — recover mapping from DB so child re-pointing works.
      const r = await db.run(
        sql.raw(
          `SELECT id FROM "${m.localesTable}" WHERE "${fkField}" = '${row.id}' AND locale = '${defaultLocale}' LIMIT 1`
        )
      );
      const localeId = r.rows?.[0]?.id;
      if (localeId) mapping.set(row.id, localeId);
      continue;
    }

    const localeId = randomUUID();
    const insertCols = ['id', fkField, 'locale'];
    const insertVals = [`'${localeId}'`, `'${row.id}'`, `'${defaultLocale}'`];

    if (localesCols.includes('updated_at')) {
      insertCols.push('updated_at');
      insertVals.push(String(nowSec));
    }

    for (const col of copyCols) {
      insertCols.push(col);
      const v = row[col];
      if (v === null || v === undefined) {
        insertVals.push('NULL');
      } else if (typeof v === 'number') {
        insertVals.push(String(v));
      } else {
        const s = String(v).replace(/'/g, "''");
        insertVals.push(`'${s}'`);
      }
    }

    await db.run(
      sql.raw(
        `INSERT INTO "${m.localesTable}" (${insertCols.map((c) => `"${c}"`).join(', ')}) VALUES (${insertVals.join(', ')})`
      )
    );
    mapping.set(row.id, localeId);
  }

  return mapping;
}

/**
 * Re-point child tables (arrays, files, junctions) from main.id → _locales.id.
 * For each main id that we just seeded, UPDATE the child rows that reference it.
 */
async function repointChildren(db, m, mapping, def) {
  if (mapping.size === 0) return;

  const childPrefix = m.mainTable; // collection_<slug> or global_<slug>
  const fkColumn = m.kind === 'collection' ? 'collection_id' : 'global_id';

  // Walk template fields to enumerate child tables.
  const tasks = [];

  for (const [fieldName, fieldDef] of Object.entries(def.fields || {})) {
    const snake = snakeCase(fieldName);
    if (fieldDef.type === 'array' || fieldDef.type === 'file') {
      tasks.push({ table: `${childPrefix}_${snake}`, col: 'parent_id' });
    } else if (fieldDef.type === 'relation' && fieldDef.relation?.type === 'many-to-many') {
      tasks.push({ table: `junction_${m.slug}_${snake}`, col: fkColumn });
    }
  }

  for (const t of tasks) {
    if (!(await tableExists(db, t.table))) continue;
    for (const [mainId, localeId] of mapping) {
      await db.run(
        sql.raw(`UPDATE "${t.table}" SET "${t.col}" = '${localeId}' WHERE "${t.col}" = '${mainId}'`)
      );
    }
  }
}

/**
 * Convert any old `<base>_locales` taggable_type rows to the unified `<base>`
 * convention. One-shot global rewrite — safe to re-run.
 */
async function unifyTaggableTypes(db) {
  if (!(await tableExists(db, 'taggables'))) return;
  await db.run(
    sql.raw(
      `UPDATE "taggables" SET taggable_type = REPLACE(taggable_type, '_locales', '')
       WHERE taggable_type LIKE 'collection_%_locales'
          OR taggable_type LIKE 'global_%_locales'`
    )
  );
}

export async function runI18nMigrations(targetDir, pendingMigrations) {
  if (!pendingMigrations || pendingMigrations.length === 0) return;

  const db = await openLibsqlClient(targetDir);
  if (!db) return;

  const settings = await loadSettings(targetDir);
  const defaultLocale = settings.content?.defaultLocale;
  if (!defaultLocale) {
    throw new Error(
      'i18n migration: `content.defaultLocale` is not set in templates/settings.ts. ' +
        'Set it before flipping a populated entity to `localized: true`.'
    );
  }

  let totalSeeded = 0;
  for (const m of pendingMigrations) {
    // _locales must now exist (drizzle created it). Skip defensively if not.
    if (!(await tableExists(db, m.localesTable))) {
      console.warn(`  ⚠️  ${m.localesTable} missing — skipping ${m.kind}:${m.slug}`);
      continue;
    }
    const def = await loadEntityDefinition(targetDir, m.kind, m.slug);
    if (!def) {
      console.warn(`  ⚠️  template for ${m.kind}:${m.slug} not found — skipping`);
      continue;
    }
    const mapping = await seedLocales(db, m, defaultLocale);
    await repointChildren(db, m, mapping, def);
    totalSeeded += mapping.size;
    console.log(`  • ${m.kind}:${m.slug} — seeded ${mapping.size} row(s) into ${m.localesTable}`);
  }

  await unifyTaggableTypes(db);

  if (totalSeeded > 0) {
    console.log(
      `✅ i18n migration: ${totalSeeded} row(s) copied to default locale '${defaultLocale}'.`
    );
    console.log('   Run `sailor doctor` to review vestigial content columns on main tables.');
  }
}
