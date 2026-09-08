// Sailor doctor — diagnose common consumer-side setup issues.
//
// Each check is a small async function that takes targetDir and returns:
//   { id, label, ok, message, fixable, fix? }
// Fixes are pure side-effects with no return value; they only run when the
// user passes --fix. Reports are read-only by default.
import fs from 'fs-extra';
import path from 'path';
import { existsSync, readdirSync } from 'fs';
import { pathToFileURL } from 'url';
import { sql } from 'drizzle-orm';
import {
  patchSvelteConfig,
  patchViteConfig,
  dedupeNestedSvelteDeps,
  dedupeNestedSailorcmsDeps,
  stripLegacyDbScripts,
  isCorePackage,
  loadConsumerEnv,
  SAILOR_DIRS_RESOLVED_VIA_PACKAGE,
  COMPONENT_DIRS_RESOLVED_VIA_PACKAGE
} from '../utils.js';

const SOURCE_EXTS = new Set(['.svelte', '.ts', '.js', '.tsx', '.jsx', '.mjs', '.cjs']);

async function walkSourceFiles(rootDir, onFile) {
  if (!(await fs.pathExists(rootDir))) return;
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (entry.name === 'node_modules') continue;
    const full = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      await walkSourceFiles(full, onFile);
      continue;
    }
    if (!SOURCE_EXTS.has(path.extname(entry.name))) continue;
    await onFile(full);
  }
}

function buildStaleImportPatterns() {
  // The migrated subtree paths a consumer might still have in user-owned
  // scaffold files (hooks.server.ts, (site)/* routes, customized templates,
  // root configs like drizzle.config.ts). Each entry: [needle, replacement]
  const patterns = [];
  for (const dir of SAILOR_DIRS_RESOLVED_VIA_PACKAGE) {
    patterns.push([`$sailor/${dir}/`, `sailorcms/${dir}/`]);
    patterns.push([`$lib/sailor/${dir}/`, `sailorcms/${dir}/`]);
    // Older scaffolds (e.g. drizzle.config.ts) used the relative form into
    // src/lib/sailor; that path no longer resolves once the subtree migrates.
    patterns.push([`./src/lib/sailor/${dir}/`, `sailorcms/${dir}/`]);
  }
  for (const dir of COMPONENT_DIRS_RESOLVED_VIA_PACKAGE) {
    patterns.push([`$lib/components/${dir}/`, `sailorcms/components/${dir}/`]);
    patterns.push([`./src/lib/components/${dir}/`, `sailorcms/components/${dir}/`]);
  }
  return patterns;
}

// Extra root-level files outside `src/` that may carry stale imports —
// drizzle.config.ts is the only common case today.
const EXTRA_ROOT_FILES = ['drizzle.config.ts'];

async function checkStaleMigratedImports(targetDir) {
  const srcDir = path.join(targetDir, 'src');
  const patterns = buildStaleImportPatterns();
  const hits = []; // { file, line, lineText, needle }

  const inspect = async (full) => {
    const content = await fs.readFile(full, 'utf8');
    let earliestPattern = null;
    for (const [needle] of patterns) {
      if (content.includes(needle)) {
        earliestPattern = needle;
        break;
      }
    }
    if (!earliestPattern) return;
    const lines = content.split('\n');
    let inBlockComment = false;
    for (let i = 0; i < lines.length; i++) {
      // Skip comments. Docblocks routinely show the very import they are
      // documenting — `drizzle-config.ts` explains how a consumer wires it up
      // by quoting the import — and flagging those sends people to rewrite
      // prose that was already correct.
      const trimmed = lines[i].trim();
      const opensBlock = trimmed.includes('/*');
      const closesBlock = trimmed.includes('*/');
      const wasInBlock = inBlockComment;
      if (opensBlock && !closesBlock) inBlockComment = true;
      else if (closesBlock) inBlockComment = false;
      if (wasInBlock || opensBlock || trimmed.startsWith('*') || trimmed.startsWith('//')) continue;

      for (const [needle] of patterns) {
        if (lines[i].includes(needle)) {
          hits.push({
            file: path.relative(targetDir, full),
            line: i + 1,
            lineText: lines[i].trim(),
            needle
          });
          break;
        }
      }
    }
  };

  await walkSourceFiles(srcDir, inspect);
  for (const rel of EXTRA_ROOT_FILES) {
    const full = path.join(targetDir, rel);
    if (await fs.pathExists(full)) await inspect(full);
  }

  if (hits.length === 0) {
    return {
      id: 'imports:stale',
      label: 'Stale migrated-subtree imports',
      ok: true,
      message: 'no stale $sailor/$lib references to migrated subtrees',
      fixable: false
    };
  }

  const fileCount = new Set(hits.map((h) => h.file)).size;
  const detail = hits.slice(0, 10).map((h) => `    ${h.file}:${h.line}  ${h.lineText}`);
  if (hits.length > 10) detail.push(`    … and ${hits.length - 10} more`);

  return {
    id: 'imports:stale',
    label: 'Stale migrated-subtree imports',
    ok: false,
    message: `${hits.length} reference(s) across ${fileCount} file(s) point at moved code\n${detail.join('\n')}`,
    fixable: true,
    fix: async () => {
      const touched = new Set();
      const rewrite = async (full) => {
        let content = await fs.readFile(full, 'utf8');
        let changed = false;
        for (const [needle, replacement] of patterns) {
          if (content.includes(needle)) {
            content = content.split(needle).join(replacement);
            changed = true;
          }
        }
        if (changed) {
          await fs.writeFile(full, content);
          touched.add(path.relative(targetDir, full));
        }
      };
      await walkSourceFiles(srcDir, rewrite);
      for (const rel of EXTRA_ROOT_FILES) {
        const full = path.join(targetDir, rel);
        if (await fs.pathExists(full)) await rewrite(full);
      }
      for (const f of touched) console.log(`  rewrote imports in ${f}`);
    }
  };
}

async function checkScaffoldRouteClash(targetDir) {
  const routesDir = path.join(targetDir, 'src', 'routes');
  const siteDir = path.join(routesDir, '(site)');
  const conflicts = [];
  if (await fs.pathExists(path.join(siteDir, '+page.svelte'))) {
    if (await fs.pathExists(path.join(routesDir, '+page.svelte'))) {
      conflicts.push('src/routes/+page.svelte');
    }
  }
  if (await fs.pathExists(path.join(siteDir, '+layout.svelte'))) {
    if (await fs.pathExists(path.join(routesDir, '+layout.svelte'))) {
      conflicts.push('src/routes/+layout.svelte');
    }
  }

  if (conflicts.length === 0) {
    return {
      id: 'routes:scaffold-clash',
      label: 'sv-create scaffold clash with (site)/',
      ok: true,
      message: 'no top-level scaffold conflicting with (site)/',
      fixable: false
    };
  }

  return {
    id: 'routes:scaffold-clash',
    label: 'sv-create scaffold clash with (site)/',
    ok: false,
    message: `top-level scaffold collides with (site)/ — SvelteKit can't generate a route table\n${conflicts.map((c) => `    ${c}`).join('\n')}`,
    fixable: true,
    fix: async () => {
      for (const rel of conflicts) {
        await fs.remove(path.join(targetDir, rel));
        console.log(`  removed ${rel}`);
      }
    }
  };
}

async function checkSvelteConfig(targetDir) {
  const configPath = path.join(targetDir, 'svelte.config.js');
  if (!(await fs.pathExists(configPath))) {
    return {
      id: 'config:svelte',
      label: 'svelte.config.js patches',
      ok: false,
      message: 'svelte.config.js not found',
      fixable: false
    };
  }
  const content = await fs.readFile(configPath, 'utf8');
  const { applied, manual } = patchSvelteConfig(content);
  if (applied.length === 0 && manual.length === 0) {
    return {
      id: 'config:svelte',
      label: 'svelte.config.js patches',
      ok: true,
      message: 'all sailor patches applied',
      fixable: false
    };
  }
  const lines = [];
  if (applied.length > 0) lines.push(`    auto-fixable: ${applied.join(', ')}`);
  for (const m of manual) lines.push(`    manual: ${m.name} — ${m.hint}`);
  return {
    id: 'config:svelte',
    label: 'svelte.config.js patches',
    ok: false,
    message: `svelte.config.js missing required sailor bits\n${lines.join('\n')}`,
    fixable: applied.length > 0,
    fix: async () => {
      const fresh = await fs.readFile(configPath, 'utf8');
      const { content: patched, applied: appliedNow } = patchSvelteConfig(fresh);
      if (appliedNow.length > 0) {
        await fs.writeFile(configPath, patched);
        console.log(`  svelte.config.js: ${appliedNow.join(', ')}`);
      }
    }
  };
}

async function checkViteConfig(targetDir) {
  const configPath = path.join(targetDir, 'vite.config.ts');
  if (!(await fs.pathExists(configPath))) {
    return {
      id: 'config:vite',
      label: 'vite.config.ts patches',
      ok: false,
      message: 'vite.config.ts not found',
      fixable: false
    };
  }
  const content = await fs.readFile(configPath, 'utf8');
  const { applied, manual } = patchViteConfig(content);
  if (applied.length === 0 && manual.length === 0) {
    return {
      id: 'config:vite',
      label: 'vite.config.ts patches',
      ok: true,
      message: 'all sailor patches applied',
      fixable: false
    };
  }
  const lines = [];
  if (applied.length > 0) lines.push(`    auto-fixable: ${applied.join(', ')}`);
  for (const m of manual) lines.push(`    manual: ${m.name} — ${m.hint}`);
  return {
    id: 'config:vite',
    label: 'vite.config.ts patches',
    ok: false,
    message: `vite.config.ts missing required sailor plugins\n${lines.join('\n')}`,
    fixable: applied.length > 0,
    fix: async () => {
      const fresh = await fs.readFile(configPath, 'utf8');
      const { content: patched, applied: appliedNow } = patchViteConfig(fresh);
      if (appliedNow.length > 0) {
        await fs.writeFile(configPath, patched);
        console.log(`  vite.config.ts: ${appliedNow.join(', ')}`);
      }
    }
  };
}

async function checkLegacyDbScripts(targetDir) {
  const packageJsonPath = path.join(targetDir, 'package.json');
  if (!(await fs.pathExists(packageJsonPath))) {
    return {
      id: 'scripts:legacy-db',
      label: 'Legacy db:* scripts in package.json',
      ok: true,
      message: 'no package.json',
      fixable: false
    };
  }
  const packageJson = await fs.readJson(packageJsonPath);
  const legacy = {
    'db:generate': 'npx sailor db:generate && drizzle-kit generate',
    'db:push': 'drizzle-kit push',
    'db:update': 'npm run db:generate && npm run db:push && npx sailor db:seed'
  };
  const found = Object.entries(legacy).filter(([name, val]) => packageJson.scripts?.[name] === val);
  if (found.length === 0) {
    return {
      id: 'scripts:legacy-db',
      label: 'Legacy db:* scripts in package.json',
      ok: true,
      message: 'no legacy scripts present',
      fixable: false
    };
  }
  return {
    id: 'scripts:legacy-db',
    label: 'Legacy db:* scripts in package.json',
    ok: false,
    message: `legacy script(s) shadow npx sailor: ${found.map(([n]) => n).join(', ')}`,
    fixable: true,
    fix: async () => {
      const removed = await stripLegacyDbScripts(targetDir);
      for (const name of removed) console.log(`  package.json: removed scripts.${name}`);
    }
  };
}

async function checkNestedAcorn(targetDir) {
  const nested = path.join(targetDir, 'node_modules', 'svelte', 'node_modules');
  if (!(await fs.pathExists(nested))) {
    return {
      id: 'deps:nested-acorn',
      label: 'Duplicate acorn nested under svelte',
      ok: true,
      message: 'clean',
      fixable: false
    };
  }
  return {
    id: 'deps:nested-acorn',
    label: 'Duplicate acorn nested under svelte',
    ok: false,
    message:
      'node_modules/svelte/node_modules/ exists — bun non-registry installs nest acorn here, breaking @sveltejs/acorn-typescript',
    fixable: true,
    fix: async () => {
      await dedupeNestedSvelteDeps(targetDir);
    }
  };
}

async function checkNestedSailorcmsDeps(targetDir) {
  const nested = path.join(targetDir, 'node_modules', 'sailorcms', 'node_modules');
  if (!(await fs.pathExists(nested))) {
    return {
      id: 'deps:nested-sailorcms',
      label: 'Duplicate framework deps nested under sailorcms',
      ok: true,
      message: 'clean',
      fixable: false
    };
  }
  // Highlight the most painful duplicates if present.
  const danger = [];
  for (const dep of ['@sveltejs/kit', 'svelte', 'vite', '@sveltejs/vite-plugin-svelte']) {
    if (await fs.pathExists(path.join(nested, dep))) danger.push(dep);
  }
  return {
    id: 'deps:nested-sailorcms',
    label: 'Duplicate framework deps nested under sailorcms',
    ok: false,
    message:
      `node_modules/sailorcms/node_modules/ exists — bun non-registry installs copy sailor's devDeps tree here. ` +
      `When admin code resolved from the package imports framework modules, it picks up these nested copies` +
      (danger.length > 0 ? ` (notably: ${danger.join(', ')})` : '') +
      `, causing duplicate-instance bugs (e.g. SvelteKit redirects 500 instead of 302 because Redirect class identity differs across instances).`,
    fixable: true,
    fix: async () => {
      await dedupeNestedSailorcmsDeps(targetDir);
    }
  };
}

async function checkDbLocked(targetDir) {
  // Read-only diagnostic — no fix.
  let dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    try {
      const envPath = path.join(targetDir, '.env');
      if (await fs.pathExists(envPath)) {
        const env = await fs.readFile(envPath, 'utf8');
        const match = env.match(/^DATABASE_URL\s*=\s*(.+)$/m);
        if (match) dbUrl = match[1].trim().replace(/^["']|["']$/g, '');
      }
    } catch {
      /* ignore */
    }
  }
  if (!dbUrl || dbUrl.startsWith('postgres') || dbUrl.startsWith('libsql://')) {
    return {
      id: 'db:locked',
      label: 'sailor.sqlite locked by another process',
      ok: true,
      message: 'not a local SQLite DB — skipping',
      fixable: false
    };
  }
  // Local sqlite: file:./sailor.sqlite or ./sailor.sqlite
  const dbPath = dbUrl.replace(/^file:/, '');
  const absPath = path.isAbsolute(dbPath) ? dbPath : path.join(targetDir, dbPath);
  if (!(await fs.pathExists(absPath))) {
    return {
      id: 'db:locked',
      label: 'sailor.sqlite locked by another process',
      ok: true,
      message: 'DB file not present yet',
      fixable: false
    };
  }
  // Try a short-timeout write probe via libsql.
  try {
    const libsqlPath = path.join(
      targetDir,
      'node_modules',
      '@libsql',
      'client',
      'lib-esm',
      'node.js'
    );
    if (!(await fs.pathExists(libsqlPath))) {
      return {
        id: 'db:locked',
        label: 'sailor.sqlite locked by another process',
        ok: true,
        message: '@libsql/client not installed yet — skipping probe',
        fixable: false
      };
    }
    const { createClient } = await import(libsqlPath);
    const client = createClient({ url: `file:${absPath}` });
    // PRAGMA user_version=user_version is a no-op write that requires the
    // write lock — same signal as a real migration without mutating state.
    await Promise.race([
      client.execute('PRAGMA user_version = user_version'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 1500))
    ]);
    client.close();
    return {
      id: 'db:locked',
      label: 'sailor.sqlite locked by another process',
      ok: true,
      message: 'writable',
      fixable: false
    };
  } catch (err) {
    const msg = String(err?.message || err);
    if (msg.includes('SQLITE_BUSY') || msg === 'TIMEOUT' || msg.includes('database is locked')) {
      return {
        id: 'db:locked',
        label: 'sailor.sqlite locked by another process',
        ok: false,
        message:
          'DB write lock held — likely a dev server is running. Stop `bun dev` before running CLI commands that mutate schema.',
        fixable: false
      };
    }
    return {
      id: 'db:locked',
      label: 'sailor.sqlite locked by another process',
      ok: true,
      message: `probe failed (${msg}) — assuming OK`,
      fixable: false
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// i18n vestigial-columns check
//
// Localized entities keep their main table additive: the same columns are
// emitted whether or not `localized: true` is set, so flipping the flag is
// non-destructive. After the data migrator copies main → _locales those
// content columns on main go unused — `_locales` becomes the canonical
// store. This check lists them and offers --fix to drop them via SQLite
// `ALTER TABLE DROP COLUMN` (3.35+).
// ─────────────────────────────────────────────────────────────────────────────

const I18N_MAIN_KEEP = new Set(['id', 'created_at', 'deleted_at', 'deleted_by']);

async function loadLocalizedEntities(targetDir) {
  const out = [];
  for (const kind of ['collection', 'global']) {
    const dir = path.join(
      targetDir,
      'src',
      'lib',
      'sailor',
      'templates',
      kind === 'collection' ? 'collections' : 'globals'
    );
    if (!existsSync(dir)) continue;
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && f !== 'index.ts');
    for (const file of files) {
      const mod = await import(pathToFileURL(path.join(dir, file)).href);
      for (const exp of Object.values(mod)) {
        if (
          exp &&
          typeof exp === 'object' &&
          typeof exp.slug === 'string' &&
          exp.localized === true
        ) {
          out.push({ kind, slug: exp.slug });
        }
      }
    }
  }
  return out;
}

async function openLibsqlClientForDoctor(targetDir) {
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

async function tableExistsForDoctor(db, tableName) {
  const r = await db.run(
    sql.raw(`SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`)
  );
  return (r.rows || []).length > 0;
}

async function columnsForDoctor(db, tableName) {
  const r = await db.run(sql.raw(`PRAGMA table_info("${tableName}")`));
  return (r.rows || []).map((row) => row.name);
}

async function checkI18nVestigialColumns(targetDir) {
  const entities = await loadLocalizedEntities(targetDir);
  if (entities.length === 0) {
    return {
      id: 'i18n:vestigial-main-columns',
      label: 'Localized main tables: vestigial content columns',
      ok: true,
      message: 'no localized entities — skipping',
      fixable: false
    };
  }

  const db = await openLibsqlClientForDoctor(targetDir);
  if (!db) {
    return {
      id: 'i18n:vestigial-main-columns',
      label: 'Localized main tables: vestigial content columns',
      ok: true,
      message: 'DATABASE_URL unset or Postgres — skipping (sqlite/libsql only)',
      fixable: false
    };
  }

  const findings = []; // { kind, slug, mainTable, vestigial: [colName] }

  for (const e of entities) {
    const mainTable = `${e.kind === 'collection' ? 'collection_' : 'global_'}${e.slug}`;
    const localesTable = `${mainTable}_locales`;
    if (!(await tableExistsForDoctor(db, mainTable))) continue;
    if (!(await tableExistsForDoctor(db, localesTable))) continue;

    const mainCols = await columnsForDoctor(db, mainTable);
    const localesCols = new Set(await columnsForDoctor(db, localesTable));
    const fkField = `${e.slug}_id`;

    const vestigial = mainCols.filter(
      (c) => localesCols.has(c) && !I18N_MAIN_KEEP.has(c) && c !== fkField && c !== 'locale'
    );
    if (vestigial.length > 0) findings.push({ ...e, mainTable, vestigial });
  }

  if (findings.length === 0) {
    return {
      id: 'i18n:vestigial-main-columns',
      label: 'Localized main tables: vestigial content columns',
      ok: true,
      message: 'no vestigial content columns on localized main tables',
      fixable: false
    };
  }

  const detail = findings.map(
    (f) => `    ${f.mainTable} — ${f.vestigial.length} column(s): ${f.vestigial.join(', ')}`
  );

  return {
    id: 'i18n:vestigial-main-columns',
    label: 'Localized main tables: vestigial content columns',
    ok: false,
    // Informational only — fixable: false. db:update's two-phase flow now
    // drops vestigial columns as part of regular drizzle migrations (recorded
    // in __drizzle_migrations), so this check should only find anything on
    // databases that pre-date the two-phase landing OR were partially
    // migrated. The remedy is `npx sailor db:update` (re-runs phase 2),
    // not an out-of-band DROP — that's what caused the schema-drift loop
    // we're moving away from. Detail kept for debugging visibility.
    message:
      `${findings.length} localized main table(s) carry content columns shadowed by _locales\n${detail.join('\n')}\n` +
      `    Remedy: re-run \`npx sailor db:update\` — phase 2 will drop these via a normal drizzle migration.`,
    fixable: false
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// i18n orphan-locale check
//
// Removing a locale from `content.i18n.locales` is intentionally non-destructive
// (data preservation). This check surfaces drift between configured locales
// and `_locales` rows actually in the DB — the remedy is the destructive
// `npx sailor content:purge-locale <code>` CLI, not an auto-fix.
// ─────────────────────────────────────────────────────────────────────────────

async function loadConfiguredLocales(targetDir) {
  const settingsPath = path.join(targetDir, 'src', 'lib', 'sailor', 'templates', 'settings.ts');
  if (!existsSync(settingsPath)) return null;
  try {
    const mod = await import(pathToFileURL(settingsPath).href);
    const settings = mod.settings ?? mod.default ?? {};
    const locales = settings?.content?.i18n?.locales;
    return Array.isArray(locales) ? locales : null;
  } catch {
    return null;
  }
}

async function distinctLocalesInTable(db, tableName) {
  try {
    const r = await db.run(sql.raw(`SELECT DISTINCT locale FROM "${tableName}"`));
    return (r.rows || []).map((row) => row.locale).filter((v) => typeof v === 'string' && v);
  } catch {
    return [];
  }
}

async function checkI18nOrphanLocales(targetDir) {
  const entities = await loadLocalizedEntities(targetDir);
  if (entities.length === 0) {
    return {
      id: 'i18n:orphan-locales',
      label: 'Localized _locales rows with codes outside content.i18n.locales',
      ok: true,
      message: 'no localized entities — skipping',
      fixable: false
    };
  }

  const configured = await loadConfiguredLocales(targetDir);
  if (!configured) {
    return {
      id: 'i18n:orphan-locales',
      label: 'Localized _locales rows with codes outside content.i18n.locales',
      ok: true,
      message: 'content.i18n.locales not readable from settings.ts — skipping',
      fixable: false
    };
  }

  const db = await openLibsqlClientForDoctor(targetDir);
  if (!db) {
    return {
      id: 'i18n:orphan-locales',
      label: 'Localized _locales rows with codes outside content.i18n.locales',
      ok: true,
      message: 'DATABASE_URL unset or Postgres — skipping (sqlite/libsql only)',
      fixable: false
    };
  }

  const configuredSet = new Set(configured);
  const orphansByLocale = new Map(); // locale → Array<{ kind, slug, table }>

  for (const e of entities) {
    const mainTable = `${e.kind === 'collection' ? 'collection_' : 'global_'}${e.slug}`;
    const localesTable = `${mainTable}_locales`;
    if (!(await tableExistsForDoctor(db, localesTable))) continue;

    const present = await distinctLocalesInTable(db, localesTable);
    for (const code of present) {
      if (configuredSet.has(code)) continue;
      const bucket = orphansByLocale.get(code) ?? [];
      bucket.push({ ...e, table: localesTable });
      orphansByLocale.set(code, bucket);
    }
  }

  if (orphansByLocale.size === 0) {
    return {
      id: 'i18n:orphan-locales',
      label: 'Localized _locales rows with codes outside content.i18n.locales',
      ok: true,
      message: 'no orphan locale rows',
      fixable: false
    };
  }

  const detail = [];
  for (const [code, entries] of orphansByLocale) {
    const labels = entries.map((e) => `${e.kind}:${e.slug}`).join(', ');
    detail.push(`    '${code}' — in: ${labels}`);
  }

  return {
    id: 'i18n:orphan-locales',
    label: 'Localized _locales rows with codes outside content.i18n.locales',
    ok: false,
    message:
      `${orphansByLocale.size} locale code(s) present in DB but missing from content.i18n.locales\n${detail.join('\n')}\n` +
      `    Remedy: \`npx sailor content:purge-locale <code>\` per orphan locale (destructive — review first).`,
    fixable: false
  };
}

// Flat (singleton) globals are keyed by convention: the single row's `id` must
// equal the global's `slug`. `getGlobals('<slug>')` looks the row up by that id,
// so a seeded/imported row with a different id silently resolves to null. This
// surfaces those mismatches (the fix — rewriting a PK + repointing child FKs —
// is left manual).
async function loadFlatGlobals(targetDir) {
  const out = [];
  const dir = path.join(targetDir, 'src', 'lib', 'sailor', 'templates', 'globals');
  if (!existsSync(dir)) return out;
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && f !== 'index.ts');
  for (const file of files) {
    const mod = await import(pathToFileURL(path.join(dir, file)).href);
    for (const exp of Object.values(mod)) {
      if (
        exp &&
        typeof exp === 'object' &&
        typeof exp.slug === 'string' &&
        exp.dataType === 'flat'
      ) {
        out.push({ slug: exp.slug });
      }
    }
  }
  return out;
}

async function checkFlatGlobalIdMismatch(targetDir) {
  const id = 'globals:flat-id-mismatch';
  const label = 'Flat (singleton) global rows whose id ≠ slug';
  const flats = await loadFlatGlobals(targetDir);
  if (flats.length === 0) {
    return { id, label, ok: true, message: 'no flat globals — skipping', fixable: false };
  }
  const db = await openLibsqlClientForDoctor(targetDir);
  if (!db) {
    return {
      id,
      label,
      ok: true,
      message: 'DATABASE_URL unset or Postgres — skipping (sqlite/libsql only)',
      fixable: false
    };
  }

  const offenders = [];
  for (const g of flats) {
    const table = `global_${g.slug}`;
    if (!(await tableExistsForDoctor(db, table))) continue;
    const r = await db.run(sql.raw(`SELECT id FROM "${table}" WHERE id <> '${g.slug}'`));
    for (const row of r.rows || []) offenders.push({ slug: g.slug, rowId: row.id });
  }

  if (offenders.length === 0) {
    return { id, label, ok: true, message: 'all flat global rows keyed by slug', fixable: false };
  }

  const detail = offenders
    .map((o) => `    global '${o.slug}' — row id '${o.rowId}' (expected '${o.slug}')`)
    .join('\n');
  return {
    id,
    label,
    ok: false,
    message:
      `${offenders.length} flat global row(s) whose id ≠ slug — \`getGlobals('<slug>')\` resolves to null for these\n${detail}\n` +
      `    A flat global is a singleton: its row id must equal its slug. Re-seed/import with id = slug (or update the row id + any child-table FKs).`,
    fixable: false
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy content `status` values
//
// The stored vocabulary is 'published' | 'draft' ('all' is a query-side filter,
// never written to a row). 0.2.0-era installs wrote 'active', which matches
// neither: every content read applies `eq(status, 'published')` by default, so
// those rows resolve to null/[] with no error anywhere — a `{#if}` renders
// nothing and the page still returns 200. Flat globals ignore status entirely,
// so a broken install can look half-working. NULL fails the same way.
//
// No sailor command migrates these (db:repair covers schema, db:repair-timestamps
// covers epoch drift), so the remedy is a reviewed UPDATE per table.
// ─────────────────────────────────────────────────────────────────────────────

const VALID_CONTENT_STATUS = new Set(['published', 'draft']);

// Content tables are `collection_<slug>` / `global_<slug>` (plus their `_locales`
// side tables). The prefix filter is what keeps `users.status` ('active' is
// legitimate there), `search_index.status`, and `mail_events.status` out of
// scope — those carry unrelated vocabularies.
async function contentTablesWithStatus(db) {
  const r = await db.run(
    sql.raw(
      `SELECT name FROM sqlite_master WHERE type='table' ` +
        `AND (name LIKE 'collection\\_%' ESCAPE '\\' OR name LIKE 'global\\_%' ESCAPE '\\') ` +
        `ORDER BY name`
    )
  );
  const out = [];
  for (const row of r.rows || []) {
    const cols = await columnsForDoctor(db, row.name);
    if (cols.includes('status')) out.push(row.name);
  }
  return out;
}

/**
 * Junction rows whose owning or target row is gone.
 *
 * Until 0.9.4 a permanent delete removed the entity but not its junction
 * edges, so purged items leave edges behind that still read as real: counts,
 * relation filters and reverse panels all report items that no longer exist.
 * A category can look non-empty while being entirely empty.
 *
 * Read-only. The remedy is a plain DELETE, but it is emitted for review rather
 * than run, since this writes to a consumer's content database.
 */
async function checkOrphanedJunctionRows(targetDir) {
  const id = 'content:orphaned-junctions';
  const label = 'Junction rows pointing at deleted content';
  const db = await openLibsqlClientForDoctor(targetDir);
  if (!db) {
    return {
      id,
      label,
      ok: true,
      message: 'DATABASE_URL unset or Postgres — skipping (sqlite/libsql only)',
      fixable: false
    };
  }

  const listed = await db.run(
    sql.raw(
      `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'junction_%' ORDER BY name`
    )
  );
  const junctions = (listed.rows || []).map((row) => row.name);
  if (junctions.length === 0) {
    return { id, label, ok: true, message: 'no junction tables — skipping', fixable: false };
  }

  const offenders = [];
  for (const junction of junctions) {
    const cols = await columnsForDoctor(db, junction);
    // The owner column is whichever `<kind>_id` this junction carries; the
    // table it points at is not derivable from the name, so only the owner
    // side is checked here. That is where purge debris accumulates.
    const ownerKey = ['collection_id', 'global_id', 'block_id'].find((c) => cols.includes(c));
    if (!ownerKey) continue;

    // `junction_<slug>_<field>` — the owner table is `<kind>_<slug>`, and slug
    // may itself contain underscores, so try the longest prefix that exists.
    const kind = ownerKey.replace('_id', '');
    const rest = junction.slice('junction_'.length).split('_');
    let ownerTable = null;
    for (let take = rest.length - 1; take >= 1; take--) {
      const candidate = `${kind}_${rest.slice(0, take).join('_')}`;
      const exists = await db.run(
        sql.raw(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='${candidate}' LIMIT 1`)
      );
      if ((exists.rows || []).length > 0) {
        ownerTable = candidate;
        break;
      }
    }
    if (!ownerTable) continue;

    const r = await db.run(
      sql.raw(
        `SELECT COUNT(*) AS n FROM "${junction}" j ` +
          `LEFT JOIN "${ownerTable}" o ON o.id = j."${ownerKey}" WHERE o.id IS NULL`
      )
    );
    const n = Number(r.rows?.[0]?.n) || 0;
    if (n > 0) offenders.push({ junction, ownerTable, ownerKey, count: n });
  }

  if (offenders.length === 0) {
    return {
      id,
      label,
      ok: true,
      message: `no orphaned junction rows (${junctions.length} junction(s) scanned)`,
      fixable: false
    };
  }

  const total = offenders.reduce((n, o) => n + o.count, 0);
  const detail = offenders.map((o) => `    ${o.junction} — ${o.count} row(s)`);
  const deletes = offenders.map(
    (o) =>
      `      DELETE FROM "${o.junction}" WHERE "${o.ownerKey}" NOT IN (SELECT id FROM "${o.ownerTable}");`
  );

  return {
    id,
    label,
    ok: false,
    message:
      `${total} junction row(s) point at content that no longer exists — these still read as ` +
      `real relations, so counts and filters over-report\n${detail.join('\n')}\n` +
      `    Remedy — back up first (\`npx sailor db:backup\`), then review and run:\n${deletes.join('\n')}\n` +
      `    Purging no longer leaves these behind as of 0.9.4; this is existing debris.`,
    fixable: false
  };
}

async function checkLegacyContentStatus(targetDir) {
  const id = 'content:legacy-status';
  const label = 'Content rows with status outside published|draft';
  const db = await openLibsqlClientForDoctor(targetDir);
  if (!db) {
    return {
      id,
      label,
      ok: true,
      message: 'DATABASE_URL unset or Postgres — skipping (sqlite/libsql only)',
      fixable: false
    };
  }

  const tables = await contentTablesWithStatus(db);
  if (tables.length === 0) {
    return {
      id,
      label,
      ok: true,
      message: 'no content tables with a status column — skipping',
      fixable: false
    };
  }

  const offenders = [];
  for (const table of tables) {
    const r = await db.run(sql.raw(`SELECT status, COUNT(*) AS n FROM "${table}" GROUP BY status`));
    for (const row of r.rows || []) {
      if (typeof row.status === 'string' && VALID_CONTENT_STATUS.has(row.status)) continue;
      offenders.push({ table, value: row.status, count: Number(row.n) || 0 });
    }
  }

  if (offenders.length === 0) {
    return {
      id,
      label,
      ok: true,
      message: `all content status values in published|draft (${tables.length} table(s) scanned)`,
      fixable: false
    };
  }

  const rows = offenders.reduce((n, o) => n + o.count, 0);
  const detail = offenders.map(
    (o) => `    ${o.table} — ${o.value === null ? 'NULL' : `'${o.value}'`} × ${o.count} row(s)`
  );
  const updates = offenders.map(
    (o) =>
      `      UPDATE "${o.table}" SET status = 'published' WHERE status ` +
      `${o.value === null ? 'IS NULL' : `= '${o.value}'`};`
  );

  return {
    // Informational only. The right target ('published' vs 'draft') depends on
    // what the legacy value meant in that install, so this stays a reviewed
    // UPDATE rather than a --fix that writes to a consumer's content DB.
    id,
    label,
    ok: false,
    message:
      `${rows} content row(s) carry a status outside published|draft — these read as invisible ` +
      `(every query filters status = 'published' by default)\n${detail.join('\n')}\n` +
      `    Remedy — back up first (\`npx sailor db:backup\`), then review and run:\n${updates.join('\n')}\n` +
      `    Map each value deliberately: 'published' is assumed above, but a legacy 'inactive'/'hidden' likely means 'draft'.`,
    fixable: false
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// better-auth account issuer
//
// better-auth <=1.6 identified a linked account by (provider_id, account_id).
// 1.7 scopes identity by a new `issuer` field and looks accounts up with
// (issuer, account_id), so a row written before 1.7 is invisible to it — OAuth
// sign-in fails and the account reads as unlinked. Sailor generates the
// `accounts` table itself, so neither `db:update` nor better-auth's own
// migrator backfills it; `npx sailor db:repair-accounts` does.
// ─────────────────────────────────────────────────────────────────────────────

async function checkAccountIssuer(targetDir) {
  const id = 'auth:account-issuer';
  const label = 'better-auth accounts.issuer populated';
  const db = await openLibsqlClientForDoctor(targetDir);
  if (!db) {
    return {
      id,
      label,
      ok: true,
      message: 'DATABASE_URL unset or Postgres — skipping (sqlite/libsql only)',
      fixable: false
    };
  }
  if (!(await tableExistsForDoctor(db, 'accounts'))) {
    return { id, label, ok: true, message: 'no accounts table — skipping', fixable: false };
  }

  const cols = await columnsForDoctor(db, 'accounts');
  if (!cols.includes('issuer')) {
    return {
      id,
      label,
      ok: false,
      message:
        "accounts.issuer column is missing — better-auth >=1.7 can't resolve any linked account\n" +
        '    Remedy: `npx sailor db:update` to add the column, then `npx sailor db:repair-accounts` to backfill it.',
      fixable: false
    };
  }

  const r = await db.run(
    sql.raw(
      `SELECT provider_id, COUNT(*) AS n FROM accounts ` +
        `WHERE issuer IS NULL OR issuer = '' GROUP BY provider_id`
    )
  );
  const rows = r.rows || [];
  if (rows.length === 0) {
    return { id, label, ok: true, message: 'every account row has an issuer', fixable: false };
  }

  const total = rows.reduce((n, row) => n + (Number(row.n) || 0), 0);
  const detail = rows.map((row) => `    ${row.provider_id} — ${Number(row.n) || 0} row(s)`);
  return {
    id,
    label,
    ok: false,
    message:
      `${total} account row(s) have no issuer — invisible to better-auth >=1.7 (OAuth sign-in fails, ` +
      `accounts read as unlinked)\n${detail.join('\n')}\n` +
      '    Remedy: `npx sailor db:repair-accounts` (add `--dry-run` to preview).',
    fixable: false
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// better-auth credential account_id
//
// Every better-auth path that creates a credential account writes
// `accountId: user.id`, and 1.7's email sign-in resolves the row with
// (provider_id, issuer, account_id === user.id). A row holding anything else
// is invisible to that lookup, so the user can never sign in — and the error
// is the same INVALID_EMAIL_OR_PASSWORD a wrong password gives, so it reads as
// a forgotten password rather than a broken row.
// ─────────────────────────────────────────────────────────────────────────────

async function checkCredentialAccountId(targetDir) {
  const id = 'auth:credential-account-id';
  const label = 'credential accounts.account_id matches the user id';
  const db = await openLibsqlClientForDoctor(targetDir);
  if (!db) {
    return {
      id,
      label,
      ok: true,
      message: 'DATABASE_URL unset or Postgres — skipping (sqlite/libsql only)',
      fixable: false
    };
  }
  if (!(await tableExistsForDoctor(db, 'accounts'))) {
    return { id, label, ok: true, message: 'no accounts table — skipping', fixable: false };
  }

  const r = await db.run(
    sql.raw(
      `SELECT a.user_id AS user_id, a.account_id AS account_id, u.email AS email ` +
        `FROM accounts a LEFT JOIN users u ON u.id = a.user_id ` +
        `WHERE a.provider_id = 'credential' AND a.account_id <> a.user_id`
    )
  );
  const rows = r.rows || [];
  if (rows.length === 0) {
    return {
      id,
      label,
      ok: true,
      message: 'every credential account_id matches its user id',
      fixable: false
    };
  }

  const detail = rows.map(
    (row) => `    ${row.email ?? row.user_id} — account_id '${row.account_id}'`
  );
  return {
    id,
    label,
    ok: false,
    message:
      `${rows.length} credential account(s) have a mismatched account_id — better-auth >=1.7 ` +
      `can't resolve them, so those users can never sign in\n${detail.join('\n')}\n` +
      '    Remedy: `npx sailor db:repair-accounts` (add `--dry-run` to preview).',
    fixable: false
  };
}

/**
 * Checks that only make sense where sailor is a *dependency*. Run inside the
 * sailorcms repo itself they report problems that cannot exist: the library is
 * not installed into itself, so there is no `vite.config.ts` patch to apply and
 * no nested copy to dedupe. Reporting them there trains you to ignore doctor's
 * output, which is worse than not running the check.
 */
const CONSUMER_ONLY_CHECKS = new Set([
  checkScaffoldRouteClash,
  checkSvelteConfig,
  checkViteConfig,
  checkLegacyDbScripts,
  checkNestedSailorcmsDeps
]);

const CHECKS = [
  checkStaleMigratedImports,
  checkScaffoldRouteClash,
  checkSvelteConfig,
  checkViteConfig,
  checkLegacyDbScripts,
  checkNestedAcorn,
  checkNestedSailorcmsDeps,
  checkDbLocked,
  checkI18nVestigialColumns,
  checkI18nOrphanLocales,
  checkFlatGlobalIdMismatch,
  checkLegacyContentStatus,
  checkOrphanedJunctionRows,
  checkAccountIssuer,
  checkCredentialAccountId
];

// Tiny ANSI color helpers. Respects NO_COLOR (https://no-color.org/) and
// non-TTY output (pipes, CI logs without TTY) — falls through to plain text.
const useColor = process.stdout.isTTY && !process.env.NO_COLOR && process.env.TERM !== 'dumb';
const c = {
  green: (s) => (useColor ? `\x1b[32m${s}\x1b[0m` : s),
  red: (s) => (useColor ? `\x1b[31m${s}\x1b[0m` : s),
  yellow: (s) => (useColor ? `\x1b[33m${s}\x1b[0m` : s),
  cyan: (s) => (useColor ? `\x1b[36m${s}\x1b[0m` : s),
  dim: (s) => (useColor ? `\x1b[2m${s}\x1b[0m` : s),
  bold: (s) => (useColor ? `\x1b[1m${s}\x1b[0m` : s)
};

export function registerDoctor(program) {
  program
    .command('doctor')
    .description('Diagnose common Sailor CMS consumer-side setup issues')
    .option('--fix', 'Auto-apply fixes for fixable issues')
    .action(async (options) => {
      const targetDir = process.cwd();
      console.log(
        `\n${c.bold(c.cyan('Sailor doctor'))} ${c.dim('—')} ${path.basename(targetDir)}\n`
      );

      // Read the package name rather than the folder name — a consumer may well
      // have cloned into a directory called `sailorcms`.
      let isSailorItself = false;
      try {
        const pkg = await fs.readJson(path.join(targetDir, 'package.json'));
        isSailorItself = pkg?.name === 'sailorcms';
      } catch {
        // No package.json, or unreadable — treat it as a consumer and run everything.
      }
      if (isSailorItself) {
        console.log(
          `${c.dim('  sailorcms repo — skipping checks that only apply where sailor is installed')}\n`
        );
      }

      const results = [];
      for (const check of CHECKS) {
        if (isSailorItself && CONSUMER_ONLY_CHECKS.has(check)) continue;
        try {
          results.push(await check(targetDir));
        } catch (err) {
          results.push({
            id: check.name,
            label: check.name,
            ok: false,
            message: `check threw: ${err?.message || err}`,
            fixable: false
          });
        }
      }

      for (const r of results) {
        const mark = r.ok ? c.green('✓') : c.red('✗');
        const tag = r.fixable && !r.ok ? c.yellow(' (fixable)') : '';
        const label = r.ok ? r.label : c.bold(r.label);
        console.log(`${mark} ${label}${tag}`);
        console.log(`  ${c.dim(r.message)}`);
        console.log('');
      }

      const failing = results.filter((r) => !r.ok);
      const fixable = failing.filter((r) => r.fixable);

      if (failing.length === 0) {
        console.log(c.green(c.bold('All checks passed.')));
        return;
      }

      if (!options.fix) {
        console.log(
          `${c.bold(`${failing.length} issue(s) found`)}, ${c.yellow(`${fixable.length} fixable`)}. Re-run with ${c.cyan('--fix')} to apply.`
        );
        process.exit(failing.length === fixable.length ? 0 : 1);
      }

      if (fixable.length === 0) {
        console.log(c.red(`${failing.length} issue(s) found, none auto-fixable.`));
        process.exit(1);
      }

      // Block --fix when running inside the sailorcms package itself: fixes
      // like `dedupeNestedSailorcmsDeps` delete `node_modules/sailorcms/node_modules`,
      // which in the upstream repo IS the dev workspace's framework installs —
      // running it here breaks the working tree. Read-only diagnostics above
      // already ran and are fine to surface.
      if (await isCorePackage(targetDir)) {
        console.log(
          c.yellow(
            'Detected sailorcms package source — `doctor --fix` is for consumer installs only.'
          )
        );
        console.log(
          c.dim(
            '  These fixes would touch this repo`s own node_modules/config. Resolve any drift via git instead.'
          )
        );
        process.exit(1);
      }

      console.log(`${c.bold(`Applying ${fixable.length} fix(es):`)}\n`);
      for (const r of fixable) {
        console.log(c.cyan(`→ ${r.label}`));
        try {
          await r.fix();
        } catch (err) {
          console.error(`  ${c.red('✗ fix failed:')} ${err?.message || err}`);
        }
        console.log('');
      }
      const unfixed = failing.length - fixable.length;
      console.log(
        unfixed === 0
          ? c.green(c.bold('✅ All fixable issues resolved.'))
          : `${c.green(`✅ Applied ${fixable.length} fix(es)`)}; ${c.yellow(`${unfixed} issue(s) need manual attention.`)}`
      );
      if (unfixed > 0) process.exit(1);
    });
}
