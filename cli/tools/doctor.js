// Sailor doctor — diagnose common consumer-side setup issues.
//
// Each check is a small async function that takes targetDir and returns:
//   { id, label, ok, message, fixable, fix? }
// Fixes are pure side-effects with no return value; they only run when the
// user passes --fix. Reports are read-only by default.
import fs from 'fs-extra';
import path from 'path';
import {
  patchSvelteConfig,
  patchViteConfig,
  dedupeNestedSvelteDeps,
  dedupeNestedSailorcmsDeps,
  stripLegacyDbScripts,
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
  // scaffold files (hooks.server.ts, (site)/* routes, customized templates).
  // Each entry: [needle, replacement]
  const patterns = [];
  for (const dir of SAILOR_DIRS_RESOLVED_VIA_PACKAGE) {
    patterns.push([`$sailor/${dir}/`, `sailorcms/${dir}/`]);
    patterns.push([`$lib/sailor/${dir}/`, `sailorcms/${dir}/`]);
  }
  for (const dir of COMPONENT_DIRS_RESOLVED_VIA_PACKAGE) {
    patterns.push([`$lib/components/${dir}/`, `sailorcms/components/${dir}/`]);
  }
  return patterns;
}

async function checkStaleMigratedImports(targetDir) {
  const srcDir = path.join(targetDir, 'src');
  const patterns = buildStaleImportPatterns();
  const hits = []; // { file, line, lineText, needle }

  await walkSourceFiles(srcDir, async (full) => {
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
    for (let i = 0; i < lines.length; i++) {
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
  });

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
      await walkSourceFiles(srcDir, async (full) => {
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
      });
      for (const f of touched) console.log(`  🔧 rewrote imports in ${f}`);
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
        console.log(`  🗑  removed ${rel}`);
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
        console.log(`  🔧 svelte.config.js: ${appliedNow.join(', ')}`);
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
        console.log(`  🔧 vite.config.ts: ${appliedNow.join(', ')}`);
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
      for (const name of removed) console.log(`  🗑  package.json: removed scripts.${name}`);
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

const CHECKS = [
  checkStaleMigratedImports,
  checkScaffoldRouteClash,
  checkSvelteConfig,
  checkViteConfig,
  checkLegacyDbScripts,
  checkNestedAcorn,
  checkNestedSailorcmsDeps,
  checkDbLocked
];

export function registerDoctor(program) {
  program
    .command('doctor')
    .description('Diagnose common Sailor CMS consumer-side setup issues')
    .option('--fix', 'Auto-apply fixes for fixable issues')
    .action(async (options) => {
      const targetDir = process.cwd();
      console.log(`\nSailor doctor — ${path.basename(targetDir)}\n`);

      const results = [];
      for (const check of CHECKS) {
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
        const mark = r.ok ? '✓' : '✗';
        const tag = r.fixable && !r.ok ? ' (fixable)' : '';
        console.log(`${mark} ${r.label}${tag}`);
        console.log(`  ${r.message}`);
        console.log('');
      }

      const failing = results.filter((r) => !r.ok);
      const fixable = failing.filter((r) => r.fixable);

      if (failing.length === 0) {
        console.log('All checks passed.');
        return;
      }

      if (!options.fix) {
        console.log(
          `${failing.length} issue(s) found, ${fixable.length} fixable. Re-run with --fix to apply.`
        );
        process.exit(failing.length === fixable.length ? 0 : 1);
      }

      if (fixable.length === 0) {
        console.log(`${failing.length} issue(s) found, none auto-fixable.`);
        process.exit(1);
      }

      console.log(`Applying ${fixable.length} fix(es):\n`);
      for (const r of fixable) {
        console.log(`→ ${r.label}`);
        try {
          await r.fix();
        } catch (err) {
          console.error(`  ✗ fix failed: ${err?.message || err}`);
        }
        console.log('');
      }
      const unfixed = failing.length - fixable.length;
      console.log(
        unfixed === 0
          ? '✅ All fixable issues resolved.'
          : `✅ Applied ${fixable.length} fix(es); ${unfixed} issue(s) need manual attention.`
      );
      if (unfixed > 0) process.exit(1);
    });
}
