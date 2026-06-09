// `sailor content:purge-locale <code>` — destructive cleanup for a locale
// that was removed from `content.i18n.locales`. Deletes every `_locales` row
// matching that code across localized collections + globals, then sweeps the
// polymorphic side tables (`taggables`, `search_index`, `search_index_fts`)
// that point at the now-orphaned rows.
//
// Why this exists: removing a locale from settings is data-preserving on
// purpose (you might be reconfiguring). When you actually want the data gone,
// this is the path. Doctor's `i18n:orphan-locales` check surfaces drift; this
// CLI is the action.
//
// SQLite/libsql only — Postgres falls through with a clear message.

import { existsSync, readdirSync } from 'fs';
import { pathToFileURL } from 'url';
import path from 'path';
import readline from 'readline';
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

async function loadLocalizedEntities(targetDir) {
  const base = path.join(targetDir, 'src', 'lib', 'sailor', 'templates');
  const collections = await loadDefinitionsFromDir(path.join(base, 'collections'));
  const globals = await loadDefinitionsFromDir(path.join(base, 'globals'));
  const out = [];
  for (const [slug, def] of Object.entries(collections)) {
    if (def.localized === true) out.push({ kind: 'collection', slug });
  }
  for (const [slug, def] of Object.entries(globals)) {
    if (def.localized === true) out.push({ kind: 'global', slug });
  }
  return out;
}

async function loadSettings(targetDir) {
  const settingsPath = path.join(targetDir, 'src', 'lib', 'sailor', 'templates', 'settings.ts');
  if (!existsSync(settingsPath)) return {};
  const mod = await import(pathToFileURL(settingsPath).href);
  return mod.settings ?? mod.default ?? {};
}

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

async function tableExists(db, tableName) {
  const r = await db.run(
    sql.raw(`SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`)
  );
  return (r.rows || []).length > 0;
}

async function fetchLocaleRowIds(db, localesTable, locale) {
  const r = await db.run(
    sql.raw(`SELECT id FROM "${localesTable}" WHERE locale = '${locale.replace(/'/g, "''")}'`)
  );
  return (r.rows || []).map((row) => row.id);
}

async function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

export function registerContentPurgeLocale(program) {
  program
    .command('content:purge-locale <code>')
    .description(
      'Delete every translation row (and orphan tags/search rows) for a locale code. Use after removing the locale from content.i18n.locales.'
    )
    .option('-y, --yes', 'Skip the confirmation prompt')
    .option(
      '--force',
      'Allow purging a locale that is still listed in content.i18n.locales (destructive; double-check first)'
    )
    .action(async (code, options) => {
      const targetDir = process.cwd();

      if (!code || typeof code !== 'string' || !code.trim()) {
        console.error('❌ Missing or empty locale code.');
        process.exit(1);
      }
      const locale = code.trim();

      const settings = await loadSettings(targetDir);
      const configuredLocales = settings?.content?.i18n?.locales ?? [];
      const defaultLocale = settings?.content?.i18n?.default ?? null;

      if (locale === defaultLocale) {
        console.error(
          `❌ Refusing to purge the default locale ('${locale}'). Change content.i18n.default first.`
        );
        process.exit(1);
      }
      if (configuredLocales.includes(locale) && !options.force) {
        console.error(
          `❌ '${locale}' is still listed in content.i18n.locales. Remove it from settings first, or re-run with --force to purge anyway.`
        );
        process.exit(1);
      }

      const db = await openLibsqlClient(targetDir);
      if (!db) {
        console.error(
          '❌ DATABASE_URL is unset or points at a Postgres backend — content:purge-locale is SQLite/libsql only for now.'
        );
        process.exit(1);
      }

      const entities = await loadLocalizedEntities(targetDir);
      if (entities.length === 0) {
        console.log('No localized entities declared — nothing to purge.');
        return;
      }

      // First pass: enumerate what we'd delete, so the operator sees the
      // blast radius before confirming.
      const plan = []; // { kind, slug, localesTable, taggableType, ids }
      for (const e of entities) {
        const prefix = e.kind === 'collection' ? 'collection_' : 'global_';
        const localesTable = `${prefix}${e.slug}_locales`;
        if (!(await tableExists(db, localesTable))) continue;
        const ids = await fetchLocaleRowIds(db, localesTable, locale);
        if (ids.length === 0) continue;
        plan.push({
          ...e,
          localesTable,
          taggableType: `${prefix}${e.slug}`.replace(/_$/, ''),
          ids
        });
      }

      // Search index rows live on `search_index.locale`; FTS row is a mirror.
      // Count separately so the summary is honest about everything we touch.
      let searchIndexCount = 0;
      if (await tableExists(db, 'search_index')) {
        const r = await db.run(
          sql.raw(
            `SELECT COUNT(*) AS n FROM search_index WHERE locale = '${locale.replace(/'/g, "''")}'`
          )
        );
        searchIndexCount = Number(r.rows?.[0]?.n ?? 0);
      }

      const totalLocaleRows = plan.reduce((sum, p) => sum + p.ids.length, 0);
      if (totalLocaleRows === 0 && searchIndexCount === 0) {
        console.log(`No rows found for locale '${locale}'. Nothing to do.`);
        return;
      }

      console.log('');
      console.log(`The following rows will be DELETED for locale '${locale}':`);
      for (const p of plan) {
        const label = `${p.kind}:${p.slug}`;
        console.log(`  • ${label.padEnd(32)} ${p.ids.length} translation row(s)`);
      }
      if (searchIndexCount > 0) {
        console.log(`  • ${'search_index'.padEnd(32)} ${searchIndexCount} row(s)`);
      }
      console.log('');
      console.log(
        '  Cascade: tag rows (taggables) pointing at the purged _locales ids will also be removed.'
      );
      console.log('  File junctions and array-row tables with ON DELETE CASCADE clean themselves.');
      console.log('');

      if (!options.yes) {
        const answer = await prompt(`Type the locale code '${locale}' to confirm: `);
        if (answer.trim() !== locale) {
          console.log('Aborted.');
          process.exit(1);
        }
      }

      // Deletes. taggables first (uses captured ids), then _locales, then
      // search_index + FTS. taggables is polymorphic — no FK cascade — so we
      // sweep it explicitly per entity.
      let taggableDeleted = 0;
      let localeRowsDeleted = 0;
      let searchRowsDeleted = 0;

      for (const p of plan) {
        if (await tableExists(db, 'taggables')) {
          const idList = p.ids.map((id) => `'${String(id).replace(/'/g, "''")}'`).join(',');
          const tr = await db.run(
            sql.raw(
              `DELETE FROM taggables WHERE taggable_type = '${p.taggableType.replace(/'/g, "''")}' AND taggable_id IN (${idList})`
            )
          );
          taggableDeleted += Number(tr.rowsAffected ?? 0);
        }
        const dr = await db.run(
          sql.raw(`DELETE FROM "${p.localesTable}" WHERE locale = '${locale.replace(/'/g, "''")}'`)
        );
        localeRowsDeleted += Number(dr.rowsAffected ?? p.ids.length);
      }

      if (await tableExists(db, 'search_index')) {
        const sr = await db.run(
          sql.raw(`DELETE FROM search_index WHERE locale = '${locale.replace(/'/g, "''")}'`)
        );
        searchRowsDeleted = Number(sr.rowsAffected ?? 0);
      }
      if (await tableExists(db, 'search_index_fts')) {
        try {
          await db.run(
            sql.raw(`DELETE FROM search_index_fts WHERE locale = '${locale.replace(/'/g, "''")}'`)
          );
        } catch (err) {
          // FTS5 virtual tables can fail in unusual ways on older sqlite; the
          // base index is authoritative and search:reindex can rebuild FTS.
          console.warn(`  ⚠ search_index_fts cleanup skipped: ${err?.message || err}`);
        }
      }

      console.log('');
      console.log('✅ Purge complete:');
      console.log(`   ${localeRowsDeleted} translation row(s)`);
      console.log(`   ${taggableDeleted} tag link(s)`);
      console.log(`   ${searchRowsDeleted} search_index row(s)`);
      console.log('');
      console.log(
        '   Run `npx sailor search:reindex` if you want to rebuild the FTS table from scratch.'
      );
    });
}
