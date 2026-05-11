import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Subdirectories under `src/lib/components/` that are resolved from the
 * `sailorcms` package's `exports` map (e.g. `sailorcms/components/sailor/*`)
 * instead of being copied into the consumer's tree.
 *
 * Two effects on `setupSailorFiles` / `updateSailorCoreFiles`:
 *   1. The copy filter skips these subdirs entirely so a fresh `core:init`
 *      doesn't write them to the consumer.
 *   2. After copy, any stale copies left from a previous sailor version are
 *      removed from the consumer's tree so vite resolves the package version.
 *
 * Append to this list as more component subtrees migrate from the
 * copy-and-paste distribution model to package-resolved imports.
 */
export const COMPONENT_DIRS_RESOLVED_VIA_PACKAGE = ['sailor', 'ui'];

/**
 * Subdirectories under `src/lib/sailor/` that are resolved from the package's
 * `exports` map (e.g. `sailorcms/styles/*`, eventually `sailorcms/core/*`,
 * `sailorcms/utils/*`, etc.) instead of being copied into the consumer's tree.
 *
 * Same recipe as `COMPONENT_DIRS_RESOLVED_VIA_PACKAGE` but anchored at
 * `src/lib/sailor/` rather than `src/lib/components/`. Append entries here as
 * each subtree migrates from copy-and-paste distribution to package-resolved
 * imports.
 */
export const SAILOR_DIRS_RESOLVED_VIA_PACKAGE = [
  'styles',
  'core',
  'utils',
  'remote',
  'composables',
  'scripts',
  'assets'
];

async function pruneStalePackageExportedComponents(targetComponentsDir) {
  for (const dir of COMPONENT_DIRS_RESOLVED_VIA_PACKAGE) {
    const stale = path.join(targetComponentsDir, dir);
    if (await fs.pathExists(stale)) {
      await fs.remove(stale);
      console.log(`🧹 Removed stale components/${dir}/ (now resolved from sailorcms package).`);
    }
  }
}

async function pruneStalePackageExportedSailorDirs(targetSailorDir) {
  for (const dir of SAILOR_DIRS_RESOLVED_VIA_PACKAGE) {
    const stale = path.join(targetSailorDir, dir);
    if (await fs.pathExists(stale)) {
      await fs.remove(stale);
      console.log(`🧹 Removed stale sailor/${dir}/ (now resolved from sailorcms package).`);
    }
  }
}

function packageExportedComponentsFilter(mainComponentsDir) {
  return (src) => {
    const rel = path.relative(mainComponentsDir, src).split(path.sep).join('/');
    if (rel === '') return true;
    const top = rel.split('/')[0];
    return !COMPONENT_DIRS_RESOLVED_VIA_PACKAGE.includes(top);
  };
}

function packageExportedSailorDirsFilter(mainSailorDir) {
  return (src) => {
    const rel = path.relative(mainSailorDir, src).split(path.sep).join('/');
    if (rel === '') return true;
    const top = rel.split('/')[0];
    return !SAILOR_DIRS_RESOLVED_VIA_PACKAGE.includes(top);
  };
}

// Remove files/dirs in `tgtDir` that no longer exist in `srcDir`. Recurses into
// matching subdirs. `skip` accepts bare entry names ("templates") or POSIX-style
// relative paths from the top-level call ("i18n/messages") — both forms are left
// untouched in the target.
async function cleanDir(srcDir, tgtDir, skip = [], relPath = '') {
  if (!(await fs.pathExists(tgtDir))) return;
  const srcEntries = (await fs.pathExists(srcDir)) ? new Set(await fs.readdir(srcDir)) : new Set();
  const tgtEntries = await fs.readdir(tgtDir);
  for (const entry of tgtEntries) {
    const entryRel = relPath ? `${relPath}/${entry}` : entry;
    if (skip.includes(entry) || skip.includes(entryRel)) continue;
    const srcPath = path.join(srcDir, entry);
    const tgtPath = path.join(tgtDir, entry);
    if (!srcEntries.has(entry)) {
      await fs.remove(tgtPath);
      console.log(`🧹 Removed obsolete: ${tgtPath}`);
      continue;
    }
    const stat = await fs.stat(tgtPath);
    if (stat.isDirectory()) {
      await cleanDir(srcPath, tgtPath, skip, entryRel);
    }
  }
}

/**
 * Mirror sailor's source files into the consumer's tree. Single
 * implementation backing both `core:init` and `core:update` — the two flows
 * share most operations (copy sailor lib, prune package-exported subdirs,
 * copy components with the same filter, copy lib/hooks) and differ in a few
 * specific places that are mode-branched here:
 *
 *   - **init** copies app.html / app.d.ts / app.css, hooks.server.ts /
 *     hooks.client.ts (interactively, --force-aware), the templates dir
 *     (only if missing), then sets up routes and patches the consumer's
 *     vite.config / svelte.config / package.json (`setupConfigFiles`).
 *   - **update** preserves the consumer's templates / generated via the
 *     copy filter, overwrites `i18n/messages` (sailor-authored admin
 *     strings, shipped per-release), runs `cleanDir` to drop files
 *     removed from sailor's source, and calls `updateRoutes` (which
 *     itself calls `cleanDir` on routes/sailor).
 *
 * `setupSailorFiles` and `updateSailorCoreFiles` are kept as thin wrappers
 * for backwards compatibility with cms-init.js / cms-update.js.
 */
async function mirrorSailorIntoConsumer({ targetDir, mode, force = false }) {
  const mainProjectDir = path.join(__dirname, '..');
  const targetSrcDir = path.join(targetDir, 'src');
  await fs.ensureDir(targetSrcDir);
  const isInit = mode === 'init';

  if (isInit) {
    // App files — `app.html` / `app.d.ts` always overwrite, `app.css`
    // preserved unless --force (consumer may have customized).
    for (const file of ['app.html', 'app.d.ts']) {
      const src = path.join(mainProjectDir, 'src', file);
      const tgt = path.join(targetSrcDir, file);
      if (await fs.pathExists(src)) {
        await fs.copy(src, tgt, { overwrite: true });
      }
    }
    const appCssSrc = path.join(mainProjectDir, 'src', 'app.css');
    const appCssTgt = path.join(targetSrcDir, 'app.css');
    if (await fs.pathExists(appCssSrc)) {
      if ((await fs.pathExists(appCssTgt)) && !force) {
        console.log('⚠️ app.css exists - manually update or use --force to overwrite');
      } else {
        await fs.copy(appCssSrc, appCssTgt, { overwrite: true });
      }
    }

    // hooks.server.ts / hooks.client.ts — preserved unless --force (consumer
    // typically wires their own auth / app-level hooks here).
    for (const f of ['hooks.server.ts', 'hooks.client.ts']) {
      const src = path.join(mainProjectDir, 'src', f);
      const tgt = path.join(targetSrcDir, f);
      if (await fs.pathExists(src)) {
        if ((await fs.pathExists(tgt)) && !force) {
          console.log(`⚠️ ${f} exists - manually add auth or use --force`);
        } else {
          await fs.copy(src, tgt, { overwrite: true });
        }
      }
    }
  }

  // Sailor lib — common shape, mode-specific skip-list. Init only excludes
  // templates (they're copied separately, only if absent). Update excludes
  // anything that's per-consumer or generated.
  const mainSailorDir = path.join(mainProjectDir, 'src', 'lib', 'sailor');
  const targetLibDir = path.join(targetSrcDir, 'lib');
  const targetSailorDir = path.join(targetLibDir, 'sailor');

  if (await fs.pathExists(mainSailorDir)) {
    // `i18n/messages` is sailor-authored (admin strings only — toasts, sidebar,
    // dashboard labels) and ships per-release, same model as `core/` or `utils/`.
    // Always overwrite so new keys reach consumers without a manual merge.
    // `i18n/paraglide` is compiled output — regenerated on next dev/build start.
    const skipPaths = isInit
      ? [path.join('sailor', 'templates')]
      : [path.join('sailor', 'templates'), path.join('sailor', 'generated')];
    const sailorPkgFilter = packageExportedSailorDirsFilter(mainSailorDir);
    await fs.copy(mainSailorDir, targetSailorDir, {
      overwrite: true,
      filter: (src) => {
        for (const skip of skipPaths) {
          if (src.includes(skip)) return false;
        }
        return sailorPkgFilter(src);
      }
    });
    await pruneStalePackageExportedSailorDirs(targetSailorDir);

    if (!isInit) {
      console.log('📝 Updated sailor core files');

      // Remove files/folders in targetSailorDir that no longer exist in mainSailorDir
      await cleanDir(mainSailorDir, targetSailorDir, ['templates', 'generated']);
    }
  }

  if (isInit) {
    // Templates: copy only if absent (or --force). After init, the consumer
    // owns this directory.
    const mainTemplatesDir = path.join(mainSailorDir, 'templates');
    const targetTemplatesDir = path.join(targetSailorDir, 'templates');
    if (await fs.pathExists(mainTemplatesDir)) {
      const templatesExist = await fs.pathExists(targetTemplatesDir);
      if (!templatesExist || force) {
        await fs.copy(mainTemplatesDir, targetTemplatesDir, { overwrite: true });
        if (force && templatesExist) {
          console.log('⚠️ Overwrote existing templates directory due to --force flag.');
        } else {
          console.log('✅ Copied templates directory.');
        }
      } else {
        console.log(
          '⚠️ Templates directory already exists in target. Skipping to preserve user customizations. Use --force to overwrite.'
        );
      }
    }
  }

  // Components — CMS-managed subfolders (ui/ and sailor/) get cleaned on
  // update so files removed from the reference are also removed locally.
  // Any other user subfolders under components/ are left alone.
  const mainComponentsDir = path.join(mainProjectDir, 'src', 'lib', 'components');
  const targetComponentsDir = path.join(targetLibDir, 'components');
  if (await fs.pathExists(mainComponentsDir)) {
    await fs.copy(mainComponentsDir, targetComponentsDir, {
      overwrite: true,
      filter: packageExportedComponentsFilter(mainComponentsDir)
    });
    await pruneStalePackageExportedComponents(targetComponentsDir);
    if (!isInit) {
      for (const sub of ['ui', 'sailor']) {
        await cleanDir(path.join(mainComponentsDir, sub), path.join(targetComponentsDir, sub));
      }
    }
  }

  // lib/hooks — same in both modes.
  const mainHooksDir = path.join(mainProjectDir, 'src', 'lib', 'hooks');
  const targetHooksDir = path.join(targetLibDir, 'hooks');
  if (await fs.pathExists(mainHooksDir)) {
    await fs.copy(mainHooksDir, targetHooksDir, { overwrite: true });
  }

  if (isInit) {
    await setupRoutes(targetDir);
    const cfgResult = await setupConfigFiles(targetDir, force);
    return { manual: cfgResult?.manual || [] };
  }

  await updateRoutes(targetDir);
  return { manual: [] };
}

export async function setupSailorFiles(targetDir, force = false) {
  return await mirrorSailorIntoConsumer({ targetDir, mode: 'init', force });
}

export async function updateSailorCoreFiles(targetDir) {
  await mirrorSailorIntoConsumer({ targetDir, mode: 'update' });
}

export async function setupRoutes(targetDir) {
  const routesDir = path.join(targetDir, 'src', 'routes');
  const sailorRoutesDir = path.join(routesDir, 'sailor');
  await fs.ensureDir(sailorRoutesDir);
  const mainProjectRoutesDir = path.join(__dirname, '..', 'src', 'routes');
  if (await fs.pathExists(mainProjectRoutesDir)) {
    await fs.copy(mainProjectRoutesDir, routesDir, { overwrite: true });
  }
}

export async function updateRoutes(targetDir) {
  const routesDir = path.join(targetDir, 'src', 'routes');
  const sailorRoutesDir = path.join(routesDir, 'sailor');
  await fs.ensureDir(sailorRoutesDir);
  const mainProjectRoutesDir = path.join(__dirname, '..', 'src', 'routes');
  if (await fs.pathExists(mainProjectRoutesDir)) {
    const mainSailorRoutesDir = path.join(mainProjectRoutesDir, 'sailor');
    if (await fs.pathExists(mainSailorRoutesDir)) {
      await fs.copy(mainSailorRoutesDir, sailorRoutesDir, { overwrite: true });
      // Remove route files that no longer exist in the reference
      await cleanDir(mainSailorRoutesDir, sailorRoutesDir);
    }
  }
}

export async function setupConfigFiles(targetDir, force = false) {
  const mainProjectDir = path.join(__dirname, '..');
  const manual = [];

  // Merge drizzle.config.ts instead of overwriting
  await mergeDrizzleConfig(targetDir, mainProjectDir, force);

  // Merge vite.config.ts instead of overwriting
  const viteResult = await mergeViteConfig(targetDir, mainProjectDir, force);
  if (viteResult?.manual) manual.push(...viteResult.manual);

  // Create .env.sailor example file with Sailor CMS specific variables
  const envSource = path.join(mainProjectDir, '.env.example');
  const envSailorTarget = path.join(targetDir, '.env.sailor');
  const envTarget = path.join(targetDir, '.env');
  if (await fs.pathExists(envSource)) {
    await fs.copy(envSource, envSailorTarget);
    console.log('📝 Created .env.sailor - copy variables to your .env file');

    // Bootstrap a real .env if the consumer doesn't have one yet, with a freshly
    // generated BETTER_AUTH_SECRET so they can boot the admin without manual setup.
    if (!(await fs.pathExists(envTarget))) {
      const secret = crypto.randomBytes(32).toString('base64');
      const sailorContent = await fs.readFile(envSailorTarget, 'utf8');
      const seeded = sailorContent.replace(
        /^BETTER_AUTH_SECRET=.*$/m,
        `BETTER_AUTH_SECRET=${secret}`
      );
      await fs.writeFile(envTarget, seeded);
      console.log('🔐 Created .env with a generated BETTER_AUTH_SECRET');
    }
  }

  const svelteResult = await updateSvelteConfig(targetDir);
  if (svelteResult?.manual) manual.push(...svelteResult.manual);

  // Copy components.json for shadcn-svelte configuration
  const componentsJsonSource = path.join(mainProjectDir, 'components.json');
  const componentsJsonTarget = path.join(targetDir, 'components.json');
  if (await fs.pathExists(componentsJsonSource)) {
    await fs.copy(componentsJsonSource, componentsJsonTarget, { overwrite: true });
    console.log('✅ Updated components.json');
  }

  return { manual };
}

async function mergeDrizzleConfig(targetDir, mainProjectDir, force = false) {
  const drizzleConfigSource = path.join(mainProjectDir, 'drizzle.config.ts');
  const drizzleConfigTarget = path.join(targetDir, 'drizzle.config.ts');

  if (!(await fs.pathExists(drizzleConfigSource))) {
    return;
  }

  const sourceContent = await fs.readFile(drizzleConfigSource, 'utf8');

  if ((await fs.pathExists(drizzleConfigTarget)) && !force) {
    console.log('⚠️ drizzle.config.ts exists - manually configure or use --force');
    return;
  }

  await fs.writeFile(drizzleConfigTarget, sourceContent);
}

async function mergeViteConfig(targetDir, mainProjectDir, force = false) {
  const viteConfigSource = path.join(mainProjectDir, 'vite.config.ts');
  const viteConfigTarget = path.join(targetDir, 'vite.config.ts');

  if (!(await fs.pathExists(viteConfigSource))) {
    return;
  }

  const sourceContent = await fs.readFile(viteConfigSource, 'utf8');

  if ((await fs.pathExists(viteConfigTarget)) && !force) {
    const existingContent = await fs.readFile(viteConfigTarget, 'utf8');
    const { content: patched, applied, manual } = patchViteConfig(existingContent);
    if (applied.length > 0) {
      await fs.writeFile(viteConfigTarget, patched);
      console.log(`✅ Updated vite.config.ts: ${applied.join(', ')}`);
    }
    return { applied, manual: manual.map((m) => ({ file: 'vite.config.ts', ...m })) };
  }

  await fs.writeFile(viteConfigTarget, sourceContent);
  return { applied: ['copied default'], manual: [] };
}

/**
 * Idempotently inject the Tailwind and Paraglide vite plugins into a
 * consumer's `vite.config.ts`. Both plugins are required for Sailor's admin:
 * Tailwind powers the styling and `paraglideVitePlugin` compiles the i18n
 * messages that the admin imports from `$sailor/i18n/paraglide`. Without
 * paraglide registered, Vite's dep-optimizer fails on the admin entry chain
 * (stale `$sailor/i18n/paraglide/runtime.js`), which surfaces as parse errors
 * in unrelated downstream modules like `bits-ui`.
 *
 * Returns { content, applied, manual } so callers can log what changed and
 * what needs the user's attention.
 */
export function patchViteConfig(content) {
  let updated = content;
  const applied = [];
  const manual = [];

  const hasTailwindImport = /from\s+['"]@tailwindcss\/vite['"]/.test(updated);
  const hasTailwindPlugin = /tailwindcss\(\)/.test(updated);
  if (!hasTailwindImport || !hasTailwindPlugin) {
    if (!hasTailwindImport) {
      updated = updated.replace(
        /(import\s+\{\s*sveltekit\s*\}\s+from\s+['"]@sveltejs\/kit\/vite['"];?)/,
        `$1\nimport tailwindcss from '@tailwindcss/vite';`
      );
    }
    if (!hasTailwindPlugin) {
      // Insert before sveltekit() in the plugins array
      const before = updated;
      updated = updated.replace(/(\bplugins\s*:\s*\[\s*)(sveltekit\(\))/, `$1tailwindcss(), $2`);
      if (updated === before) {
        manual.push({
          name: '@tailwindcss/vite',
          hint: "Add `tailwindcss()` to your plugins array and `import tailwindcss from '@tailwindcss/vite';` at the top."
        });
      }
    }
    if (!manual.find((m) => m.name === '@tailwindcss/vite')) applied.push('Tailwind CSS');
  }

  const hasParaglideImport = /from\s+['"]@inlang\/paraglide-js['"]/.test(updated);
  const hasParaglidePlugin = /paraglideVitePlugin\s*\(/.test(updated);
  if (!hasParaglideImport || !hasParaglidePlugin) {
    if (!hasParaglideImport) {
      updated = updated.replace(
        /(import\s+\{\s*sveltekit\s*\}\s+from\s+['"]@sveltejs\/kit\/vite['"];?)/,
        `$1\nimport { paraglideVitePlugin } from '@inlang/paraglide-js';`
      );
    }
    if (!hasParaglidePlugin) {
      const pluginCall = `paraglideVitePlugin({ project: './src/lib/sailor/project.inlang', outdir: './src/lib/sailor/i18n/paraglide' })`;
      const before = updated;
      // Try inserting after tailwindcss() if present, otherwise before sveltekit()
      updated = updated.replace(/(tailwindcss\(\)\s*,\s*)(sveltekit\(\))/, `$1${pluginCall}, $2`);
      if (updated === before) {
        updated = updated.replace(/(\bplugins\s*:\s*\[\s*)(sveltekit\(\))/, `$1${pluginCall}, $2`);
      }
      if (updated === before) {
        manual.push({
          name: 'paraglideVitePlugin',
          hint: `Add \`${pluginCall}\` to your plugins array (before sveltekit()) and \`import { paraglideVitePlugin } from '@inlang/paraglide-js';\` at the top. Required for the Sailor admin's i18n.`
        });
      }
    }
    if (!manual.find((m) => m.name === 'paraglideVitePlugin')) applied.push('Paraglide i18n');
  }

  // 3. resolve.dedupe — force a single instance of @sveltejs/kit and svelte
  //    across the consumer's app code and sailor's admin code (resolved from
  //    node_modules/sailorcms). Vite externalizes node_modules for SSR by
  //    default, so without this each side evaluates the framework separately;
  //    `throw redirect()` from a sailor hook then fails the consumer-side
  //    `instanceof Redirect` check (different class identity from a different
  //    module evaluation) and 500s with a stringified-redirect body instead
  //    of 302'ing.
  const REQUIRED_DEDUPE = ['@sveltejs/kit', 'svelte'];
  const dedupeMatch = updated.match(/dedupe\s*:\s*\[([^\]]*)\]/);
  if (dedupeMatch) {
    const inner = dedupeMatch[1];
    const missing = REQUIRED_DEDUPE.filter(
      (m) => !inner.includes(`'${m}'`) && !inner.includes(`"${m}"`)
    );
    if (missing.length > 0) {
      const trimmed = inner.replace(/\s+$/, '').replace(/,\s*$/, '');
      const additions = missing.map((m) => `'${m}'`).join(', ');
      const newInner = trimmed.trim() ? `${trimmed}, ${additions}` : additions;
      updated = updated.replace(dedupeMatch[0], `dedupe: [${newInner}]`);
      applied.push('resolve.dedupe');
    }
  } else if (/\bresolve\s*:\s*\{/.test(updated)) {
    // resolve block exists but no dedupe — splice in
    const before = updated;
    updated = updated.replace(
      /(\bresolve\s*:\s*\{)/,
      `$1\n    dedupe: ['${REQUIRED_DEDUPE.join("', '")}'],`
    );
    if (updated !== before) applied.push('resolve.dedupe');
    else {
      manual.push({
        name: 'resolve.dedupe',
        hint: `Add \`dedupe: ['@sveltejs/kit', 'svelte']\` inside your existing \`resolve\` block in vite.config.ts. Required so sailor's admin code (resolved from node_modules/sailorcms) and your app code share a single SvelteKit / svelte instance — without this, redirects from sailor hooks 500 instead of 302 because Vite evaluates the framework twice.`
      });
    }
  } else {
    // No resolve block at all — insert one after the plugins array.
    const before = updated;
    updated = updated.replace(
      /(\bplugins\s*:\s*\[[\s\S]*?\])\s*,?/,
      `$1,\n  resolve: {\n    dedupe: ['${REQUIRED_DEDUPE.join("', '")}']\n  },`
    );
    if (updated === before) {
      manual.push({
        name: 'resolve.dedupe',
        hint: `Add \`resolve: { dedupe: ['@sveltejs/kit', 'svelte'] }\` to your defineConfig in vite.config.ts. Required so sailor's admin code (resolved from node_modules/sailorcms) and your app code share a single SvelteKit / svelte instance — without this, redirects from sailor hooks 500 instead of 302 because Vite evaluates the framework twice.`
      });
    } else {
      applied.push('resolve.dedupe');
    }
  }

  // 4. ssr.noExternal — bundle sailor's admin code through Vite's SSR
  //    pipeline instead of letting Node load it from node_modules. Lets
  //    `$sailor/...` aliases inside sailor's package code resolve via the
  //    consumer's Vite config (where `kit.alias.$sailor` points at the
  //    consumer's `src/lib/sailor`, which holds generated/, templates/,
  //    i18n/, etc. — the consumer-owned resources sailor's package code
  //    references). Without this the SSR module loader externalizes sailor,
  //    Node loads it without alias awareness, and imports like
  //    `$sailor/generated/schema` from sailor's core fail at runtime.
  if (!/ssr\s*:\s*\{[^}]*noExternal[^}]*['"]sailorcms['"]/.test(updated)) {
    const noExternalMatch = updated.match(/ssr\s*:\s*\{([\s\S]*?)\}/);
    if (noExternalMatch && /noExternal\s*:\s*\[/.test(noExternalMatch[1])) {
      // ssr.noExternal exists but doesn't include 'sailorcms' — splice in
      const before = updated;
      updated = updated.replace(/(noExternal\s*:\s*\[)([^\]]*)(\])/, (_m, open, inner, close) => {
        const trimmed = inner.replace(/\s+$/, '').replace(/,\s*$/, '');
        const additions = trimmed.trim() ? `${trimmed}, 'sailorcms'` : `'sailorcms'`;
        return `${open}${additions}${close}`;
      });
      if (updated !== before) applied.push('ssr.noExternal');
    } else if (/\bssr\s*:\s*\{/.test(updated)) {
      // ssr block exists without noExternal — inject it
      const before = updated;
      updated = updated.replace(/(\bssr\s*:\s*\{)/, `$1\n    noExternal: ['sailorcms'],`);
      if (updated !== before) applied.push('ssr.noExternal');
    } else {
      // No ssr block — add one
      const before = updated;
      updated = updated.replace(
        /(\bplugins\s*:\s*\[[\s\S]*?\])\s*,?/,
        `$1,\n  ssr: {\n    noExternal: ['sailorcms']\n  },`
      );
      if (updated === before) {
        manual.push({
          name: 'ssr.noExternal',
          hint: `Add \`ssr: { noExternal: ['sailorcms'] }\` to your defineConfig in vite.config.ts. Required so sailor's admin code (resolved from node_modules/sailorcms) goes through Vite's SSR transform pipeline — without this, the \`$sailor/...\` aliases inside sailor's package code don't resolve and dev mode 500s on first request.`
        });
      } else {
        applied.push('ssr.noExternal');
      }
    }
  }

  // 5. optimizeDeps — exclude sailorcms (so its source goes through Vite's
  //    dev module pipeline instead of esbuild prebundle, which doesn't know
  //    about Vite aliases or how to handle TS in `.svelte.ts` rune-state
  //    files). Include the highlight.js subpaths sailor uses so Vite picks
  //    up their ESM exports condition for proper named-export interop.
  if (!/optimizeDeps\s*:\s*\{[^}]*exclude[^}]*['"]sailorcms['"]/.test(updated)) {
    const optMatch = updated.match(/optimizeDeps\s*:\s*\{([\s\S]*?)\}/);
    if (optMatch && /\bexclude\s*:\s*\[/.test(optMatch[1])) {
      // optimizeDeps.exclude exists but doesn't include 'sailorcms' — splice in
      const before = updated;
      updated = updated.replace(
        /(optimizeDeps\s*:\s*\{[\s\S]*?\bexclude\s*:\s*\[)([^\]]*)(\])/,
        (_m, open, inner, close) => {
          const trimmed = inner.replace(/\s+$/, '').replace(/,\s*$/, '');
          const additions = trimmed.trim() ? `${trimmed}, 'sailorcms'` : `'sailorcms'`;
          return `${open}${additions}${close}`;
        }
      );
      if (updated !== before) applied.push('optimizeDeps.exclude');
    } else if (/\boptimizeDeps\s*:\s*\{/.test(updated)) {
      // optimizeDeps exists without exclude — inject
      const before = updated;
      updated = updated.replace(
        /(\boptimizeDeps\s*:\s*\{)/,
        `$1\n    exclude: ['sailorcms'],\n    include: ['highlight.js/lib/core', 'highlight.js/lib/languages/json'],`
      );
      if (updated !== before) applied.push('optimizeDeps.exclude');
    } else {
      // No optimizeDeps block — add one
      const before = updated;
      updated = updated.replace(
        /(\bplugins\s*:\s*\[[\s\S]*?\])\s*,?/,
        `$1,\n  optimizeDeps: {\n    exclude: ['sailorcms'],\n    include: ['highlight.js/lib/core', 'highlight.js/lib/languages/json']\n  },`
      );
      if (updated === before) {
        manual.push({
          name: 'optimizeDeps',
          hint: `Add \`optimizeDeps: { exclude: ['sailorcms'], include: ['highlight.js/lib/core', 'highlight.js/lib/languages/json'] }\` to your defineConfig in vite.config.ts. Required so esbuild prebundle skips sailor's source (which uses Vite-only features like \`$sailor\` aliases and \`.svelte.ts\` rune state files) and Vite picks up highlight.js's ESM exports condition.`
        });
      } else {
        applied.push('optimizeDeps.exclude');
      }
    }
  }

  return { content: updated, applied, manual };
}

export async function updateSvelteConfig(targetDir) {
  const configPath = path.join(targetDir, 'svelte.config.js');
  if (!(await fs.pathExists(configPath))) {
    console.log('⚠️ svelte.config.js not found, skipping Sailor configuration');
    return { applied: [], manual: [] };
  }
  const existingContent = await fs.readFile(configPath, 'utf8');
  const { content: patched, applied, manual } = patchSvelteConfig(existingContent);
  if (applied.length > 0) {
    await fs.writeFile(configPath, patched);
    console.log(`✅ Updated svelte.config.js: ${applied.join(', ')}`);
  }
  return {
    applied,
    manual: manual.map((m) => ({ file: 'svelte.config.js', ...m }))
  };
}

/**
 * Idempotently inject Sailor's required svelte.config.js bits:
 *   - `$sailor` alias (so admin code can import `$sailor/...`)
 *   - `vitePreprocess({ script: true })` preprocessor (so `<script lang="ts">`
 *     in shipped .svelte files like `@lucide/svelte` and `bits-ui` parses;
 *     without this, every TS-typed component in node_modules fails with
 *     "Unexpected token" during Vite's optimize-svelte step)
 *   - `compilerOptions.runes: true` and `compilerOptions.experimental.async: true`
 *     (sailor relies on runes mode and async components)
 *
 * Returns { content, applied, manual } so the caller can log changes.
 */
export function patchSvelteConfig(content) {
  let updated = content;
  const applied = [];
  const manual = [];

  // 1. Aliases: $sailor + sailorcms/* subpaths.
  //
  // Sailor's admin code lives in node_modules/sailorcms/... but consumers
  // import from `sailorcms/components/sailor/X`, `sailorcms/core/X`, etc.
  // TypeScript's `moduleResolution: bundler` is supposed to resolve these
  // through the package's `exports` map and probe `.ts` extensions, but in
  // practice it doesn't reliably probe TS sources through wildcard exports
  // (the package would need shipped `.d.ts` files). Until sailor publishes
  // pre-built declarations, we mirror the resolution into kit.alias so TS
  // sees the paths via the consumer's tsconfig, and Vite gets a redundant
  // (but harmless) alias that matches its exports-map result.
  const REQUIRED_ALIASES = [
    ['$sailor', 'src/lib/sailor'],
    ['sailorcms/components/sailor/*', 'node_modules/sailorcms/src/lib/components/sailor/*'],
    ['sailorcms/components/ui/*', 'node_modules/sailorcms/src/lib/components/ui/*'],
    ['sailorcms/composables/*', 'node_modules/sailorcms/src/lib/sailor/composables/*'],
    ['sailorcms/core/*', 'node_modules/sailorcms/src/lib/sailor/core/*'],
    ['sailorcms/remote/*', 'node_modules/sailorcms/src/lib/sailor/remote/*'],
    ['sailorcms/scripts/*', 'node_modules/sailorcms/src/lib/sailor/scripts/*'],
    ['sailorcms/assets/*', 'node_modules/sailorcms/src/lib/sailor/assets/*'],
    ['sailorcms/utils/*', 'node_modules/sailorcms/src/lib/sailor/utils/*'],
    ['sailorcms/styles/*', 'node_modules/sailorcms/src/lib/sailor/styles/*']
  ];

  if (!/\balias\s*:\s*\{/.test(updated)) {
    // No alias block at all — synthesize one with all required entries.
    const aliasLines = REQUIRED_ALIASES.map(([k, v]) => `      '${k}': '${v}'`).join(',\n');
    const aliasBlock = `alias: {\n${aliasLines}\n    }`;
    const before = updated;
    if (/\bkit\s*:\s*\{/.test(updated)) {
      updated = updated.replace(
        /(kit:\s*\{[^}]*adapter:\s*adapter\(\)[^}]*)(\})/s,
        `$1,\n    ${aliasBlock}\n  $2`
      );
    } else {
      updated = updated.replace(
        /(const\s+config\s*=\s*\{)/,
        `$1\n  kit: {\n    adapter: adapter(),\n    ${aliasBlock}\n  },`
      );
    }
    if (updated !== before) applied.push('kit.alias');
    else
      manual.push({
        name: 'kit.alias',
        hint: `Add \`alias: { ${REQUIRED_ALIASES.map(([k]) => `'${k}': ...`).join(', ')} }\` inside \`kit: {}\`.`
      });
  } else {
    // Alias block exists — splice in any missing entries.
    const missing = REQUIRED_ALIASES.filter(
      ([k]) => !new RegExp(`['"]${k.replace(/[$/*]/g, '\\$&')}['"]`).test(updated)
    );
    if (missing.length > 0) {
      const before = updated;
      const additions = missing.map(([k, v]) => `      '${k}': '${v}'`).join(',\n');
      // Insert at the start of the alias block so longer-prefix entries
      // come first — matters for Vite's resolve order with overlapping keys.
      updated = updated.replace(/(\balias\s*:\s*\{\s*\n?)/, `$1${additions},\n`);
      if (updated !== before) applied.push(`kit.alias (${missing.length} entries)`);
      else
        manual.push({
          name: 'kit.alias',
          hint: `Add the following entries to your kit.alias object: ${missing.map(([k]) => k).join(', ')}.`
        });
    }
  }

  // 2. vitePreprocess({ script: true })
  if (!/vitePreprocess\s*\(/.test(updated)) {
    if (!/from\s+['"]@sveltejs\/vite-plugin-svelte['"]/.test(updated)) {
      const before = updated;
      updated = updated.replace(
        /(import\s+adapter\s+from\s+['"][^'"]+['"];?)/,
        `$1\nimport { vitePreprocess } from '@sveltejs/vite-plugin-svelte';`
      );
      if (updated === before) {
        // No adapter import to anchor on — prepend
        updated = `import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';\n${updated}`;
      }
    }
    const before = updated;
    if (/\bkit\s*:\s*\{/.test(updated)) {
      // Insert `preprocess: ...` immediately before `kit: {`
      updated = updated.replace(
        /(\n\s*)(kit\s*:\s*\{)/,
        `$1preprocess: vitePreprocess({ script: true }),$1$2`
      );
    } else {
      updated = updated.replace(
        /(const\s+config\s*=\s*\{)/,
        `$1\n  preprocess: vitePreprocess({ script: true }),`
      );
    }
    if (updated !== before) applied.push('vitePreprocess (TS support)');
    else
      manual.push({
        name: 'vitePreprocess',
        hint: 'Add `preprocess: vitePreprocess({ script: true })` to your config and `import { vitePreprocess } from \'@sveltejs/vite-plugin-svelte\';` at the top. Required so <script lang="ts"> in node_modules .svelte files parses.'
      });
  } else if (!/vitePreprocess\s*\([^)]*script\s*:\s*true/.test(updated)) {
    // vitePreprocess(...) is present but missing `script: true` — upgrade in place.
    // Without `script: true`, <script lang="ts"> in shipped .svelte files (sailor admin
    // chrome, lucide, bits-ui) doesn't get TS-stripped, and the svelte parser fails
    // with "Unexpected token" on the first identifier in the script block.
    const before = updated;
    if (/vitePreprocess\s*\(\s*\)/.test(updated)) {
      // Empty call — replace with explicit { script: true }
      updated = updated.replace(/vitePreprocess\s*\(\s*\)/, 'vitePreprocess({ script: true })');
    } else if (/vitePreprocess\s*\(\s*\{[^}]*\}\s*\)/.test(updated)) {
      // Has options object — splice script: true in
      updated = updated.replace(/vitePreprocess\s*\(\s*\{([^}]*)\}\s*\)/, (_m, inner) => {
        const trimmed = inner.trim().replace(/,$/, '');
        return `vitePreprocess({ script: true${trimmed ? `, ${trimmed}` : ''} })`;
      });
    }
    if (updated !== before) applied.push('vitePreprocess (added script: true)');
    else
      manual.push({
        name: 'vitePreprocess script: true',
        hint: 'Your existing `vitePreprocess(...)` call is missing `script: true`. Change it to `vitePreprocess({ script: true })` so <script lang="ts"> in node_modules .svelte files parses.'
      });
  }

  // 3. compilerOptions: { runes: true, experimental: { async: true } }
  // `experimental.async` is required by SvelteKit's remote functions —
  // `query()` / `command()` use `hydratable(...)` internally, which throws
  // `experimental_async_required` at runtime if the flag is off. So even
  // though sailor's own components don't use top-level `await`, we still
  // need the flag for the framework's RPC plumbing to work.
  if (!/\bcompilerOptions\s*:/.test(updated)) {
    const compilerBlock = `compilerOptions: {\n    runes: true,\n    experimental: {\n      async: true\n    }\n  }`;
    const before = updated;
    // Insert at the end of the top-level config object — before the closing `};`
    updated = updated.replace(
      /(\n\}\s*;?\s*\n*export\s+default\s+config\s*;?)/,
      `,\n  ${compilerBlock}$1`
    );
    if (updated === before) {
      // Fallback: insert before `}` that closes `const config = {`
      updated = updated.replace(
        /(,?\s*)(\n\};?)(\s*export\s+default\s+config)/,
        `,\n  ${compilerBlock}$2$3`
      );
    }
    if (updated !== before) applied.push('compilerOptions (runes + async)');
    else
      manual.push({
        name: 'compilerOptions',
        hint: 'Add `compilerOptions: { runes: true, experimental: { async: true } }` to your config object.'
      });
  } else {
    if (!/\brunes\s*:\s*true\b/.test(updated)) {
      // compilerOptions exists but runes isn't flat `true`. The current `sv create`
      // scaffold writes a function form that excludes `node_modules` from runes
      // mode — but shipped Svelte 5 packages like @lucide/svelte and bits-ui use
      // runes (`$props()`) in their .svelte source, so compiling them in legacy
      // mode breaks SSR with `<thing> is not defined` errors. Force flat `true`.
      const before = updated;
      updated = updated.replace(
        /^(\s*)runes\s*:\s*[^\n]+?$/m,
        (_m, indent) => `${indent}runes: true,`
      );
      if (updated !== before) applied.push('compilerOptions.runes (forced flat true)');
      else
        manual.push({
          name: 'compilerOptions.runes',
          hint: 'Change `compilerOptions.runes` to a flat `true` (sv create writes a function form that excludes node_modules — sailor needs runes mode for shipped Svelte 5 packages like @lucide/svelte).'
        });
    }

    // Ensure compilerOptions.experimental.async is true. SvelteKit's remote
    // functions use `hydratable(...)` internally and throw `experimental_async_required`
    // at runtime if the flag is off — and the previous branches don't add it
    // when `compilerOptions` already exists (e.g. `sv create` wrote `{ runes: ... }`).
    if (!/\basync\s*:\s*true\b/.test(updated)) {
      const before = updated;
      // Match the compilerOptions block specifically (not kit.experimental).
      const coMatch = /\bcompilerOptions\s*:\s*\{/.exec(updated);
      if (coMatch) {
        const coStart = coMatch.index + coMatch[0].length;
        let depth = 1;
        let i = coStart;
        while (i < updated.length && depth > 0) {
          const c = updated[i];
          if (c === '{') depth++;
          else if (c === '}') depth--;
          if (depth === 0) break;
          i++;
        }
        if (depth === 0) {
          const coContent = updated.slice(coStart, i);
          const expMatch = /\bexperimental\s*:\s*\{([\s\S]*?)\}/.exec(coContent);
          if (expMatch) {
            const expGlobalStart = coStart + expMatch.index;
            const expGlobalEnd = expGlobalStart + expMatch[0].length;
            const innerTrimmed = expMatch[1].trim().replace(/,$/, '');
            const replacement = `experimental: { async: true${innerTrimmed ? `, ${innerTrimmed}` : ''} }`;
            updated = updated.slice(0, expGlobalStart) + replacement + updated.slice(expGlobalEnd);
          } else {
            const tail = updated.slice(0, i).trimEnd();
            const needsComma = tail[tail.length - 1] !== ',' && tail[tail.length - 1] !== '{';
            const block = `${needsComma ? ',' : ''}\n    experimental: {\n      async: true\n    }\n  `;
            updated = updated.slice(0, i) + block + updated.slice(i);
          }
        }
      }
      if (updated !== before) applied.push('compilerOptions.experimental.async');
      else
        manual.push({
          name: 'compilerOptions.experimental.async',
          hint: 'Add `experimental: { async: true }` inside the `compilerOptions:` block. SvelteKit remote functions (`query`, `command`) use `hydratable()` internally which requires this flag.'
        });
    }
  }

  // 4. kit.experimental.remoteFunctions: true
  // Sailor uses SvelteKit remote functions (`*.remote.ts`) for all admin RPC.
  // Without this flag, every remote import errors with "An impossible situation
  // occurred" + "To enable remote functions, add the following to your
  // svelte.config.js" at vite-transform time.
  if (!/\bremoteFunctions\s*:\s*true\b/.test(updated)) {
    const before = updated;
    const kit = findKitBlockRange(updated);
    if (kit) {
      const kitContent = updated.slice(kit.contentStart, kit.contentEnd);
      const expMatch = /\bexperimental\s*:\s*\{([\s\S]*?)\}/.exec(kitContent);
      if (expMatch) {
        // Splice remoteFunctions: true into existing experimental object
        const expGlobalStart = kit.contentStart + expMatch.index;
        const expGlobalEnd = expGlobalStart + expMatch[0].length;
        const innerTrimmed = expMatch[1].trim().replace(/,$/, '');
        const replacement = `experimental: { remoteFunctions: true${innerTrimmed ? `, ${innerTrimmed}` : ''} }`;
        updated = updated.slice(0, expGlobalStart) + replacement + updated.slice(expGlobalEnd);
      } else {
        // Append experimental block before kit's closing `}`
        const insertAt = kit.contentEnd;
        const tail = updated.slice(0, insertAt).trimEnd();
        const needsComma = tail[tail.length - 1] !== ',' && tail[tail.length - 1] !== '{';
        const block = `${needsComma ? ',' : ''}\n\t\texperimental: {\n\t\t\tremoteFunctions: true\n\t\t}\n\t`;
        updated = updated.slice(0, insertAt) + block + updated.slice(insertAt);
      }
    }
    if (updated !== before) applied.push('kit.experimental.remoteFunctions');
    else
      manual.push({
        name: 'kit.experimental.remoteFunctions',
        hint: 'Add `experimental: { remoteFunctions: true }` inside the `kit:` block. Sailor uses SvelteKit remote functions (*.remote.ts) which require this flag.'
      });
  }

  return { content: updated, applied, manual };
}

/**
 * Find the byte range of the `kit: { ... }` block's contents in a svelte config.
 * Returns `{ contentStart, contentEnd }` where `contentEnd` is the index of the
 * matching closing `}` (so the contents are `text.slice(contentStart, contentEnd)`).
 * Walks brace depth so nested objects (like `experimental: {}`) don't terminate
 * the search early. Returns null if no `kit: {` is found or braces don't balance.
 */
function findKitBlockRange(text) {
  const m = /\bkit\s*:\s*\{/.exec(text);
  if (!m) return null;
  const contentStart = m.index + m[0].length;
  let depth = 1;
  let i = contentStart;
  while (i < text.length && depth > 0) {
    const c = text[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    if (depth === 0) return { contentStart, contentEnd: i };
    i++;
  }
  return null;
}

/**
 * Workaround for a bun-specific install quirk that breaks the Svelte compiler.
 *
 * Triggers for ANY non-registry install of sailorcms — `file:../sailorcms`,
 * `github:user/sailorcms`, `https://github.com/...`, etc. For these protocols
 * bun re-resolves sailor's `package.json` transitives from scratch, separately
 * from the consumer's existing resolution. When the freshly-resolved svelte
 * matches acorn at one version (e.g. 8.15.0 from `^8.12.1`) while the
 * consumer's top-level acorn is a different version (e.g. 8.16.0, pinned
 * higher by espree's `^8.16.0`), bun nests rather than hoists, leaving an
 * older `acorn` under `node_modules/svelte/node_modules/acorn`.
 *
 * Two acorn instances then load into the same process: the one
 * `@sveltejs/acorn-typescript`'s tsPlugin extends, and the one svelte's
 * parser actually calls into. tsPlugin's TypeScript-parsing extensions get
 * grafted onto the wrong instance, so any `<script lang="ts">` in shipped
 * .svelte files (lucide, bits-ui, the consumer's own routes after sailor
 * copies its admin chrome) fails with `Unexpected token`. npm-registry
 * installs of sailor would have lockfile info to align resolutions across
 * the tree and largely sidestep this — so this is also one of the
 * motivations for eventually publishing sailor to npm.
 *
 * The nested copy gets recreated on every `bun install`, so we strip it
 * after every CLI-driven install. Surgical: only removes
 * `node_modules/svelte/node_modules`, which only contains the duplicate
 * acorn anyway. Module resolution falls through to top-level `node_modules`
 * after removal, which is what we want.
 *
 * Caveat: this only runs from sailor's CLI. CI/PaaS pipelines that just call
 * `bun install` (Coolify nixpacks, Vercel, Netlify, GitHub Actions) skip
 * this entirely and will hit the parse error at build time. Workarounds
 * there: switch the install command to `npm install` (npm doesn't nest the
 * same way) or add a postinstall script in the consumer's package.json
 * that runs the same `rm -rf`.
 */
export async function dedupeNestedSvelteDeps(targetDir) {
  const nested = path.join(targetDir, 'node_modules', 'svelte', 'node_modules');
  if (!(await fs.pathExists(nested))) return false;
  await fs.remove(nested);
  console.log(
    'ℹ️  Removed nested node_modules/svelte/node_modules (bun non-registry-install dedup workaround).'
  );
  return true;
}

/**
 * Strip the nested `node_modules` tree under `node_modules/sailorcms/`.
 *
 * Same root cause as `dedupeNestedSvelteDeps`, different blast radius. When
 * sailor is installed via `file:` or `github:` (i.e. anything other than a
 * proper npm registry install), bun copies the package's full installed
 * state — including its devDependencies tree — into
 * `node_modules/sailorcms/node_modules/`. Once admin code is resolved from
 * the package (`sailorcms/core/...`) rather than copied into the consumer's
 * tree, that nested tree becomes load-bearing in the bad way: imports from
 * sailor's package code walk up looking for `node_modules/<dep>` and find
 * the nested copies first.
 *
 * The most painful manifestation: nested `@sveltejs/kit` means sailor's
 * hooks throw `redirect()` instances of the nested kit's `Redirect` class.
 * The consumer's outer kit catches them but `instanceof Redirect` fails
 * (different class identity from a different module instance), so the
 * redirect falls through to `coalesce_to_error` and surfaces as a 500 with
 * a stringified-redirect message instead of an actual 302. Same shape with
 * `svelte` (two svelte runtimes), `vite`, `@sveltejs/vite-plugin-svelte`.
 *
 * Removing the entire nested tree is safe because sailor's runtime imports
 * resolve up to the consumer's top-level `node_modules` after this — which
 * is what we want for single framework instances. Recreated on every
 * `bun install`, so we strip after every CLI-driven install.
 *
 * Same CI/PaaS caveat as `dedupeNestedSvelteDeps`: only fires from sailor's
 * CLI, so deploy pipelines that just run `bun install` need to either run
 * `npx sailor doctor --fix` post-install or switch to `npm install`.
 */
export async function dedupeNestedSailorcmsDeps(targetDir) {
  const nested = path.join(targetDir, 'node_modules', 'sailorcms', 'node_modules');
  if (!(await fs.pathExists(nested))) return false;
  await fs.remove(nested);
  console.log(
    'ℹ️  Removed nested node_modules/sailorcms/node_modules (bun non-registry-install dedup workaround).'
  );
  return true;
}

/**
 * Print a loud, end-of-run banner for any config edits the patcher couldn't
 * apply automatically. Used by `core:init` and `core:update` so manual steps
 * don't get lost in the middle of normal status output.
 */
export function printManualActionBanner(manual) {
  if (!manual || manual.length === 0) return;
  console.warn('');
  console.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.warn('⚠️  MANUAL ACTION REQUIRED');
  console.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.warn(
    "Sailor couldn't auto-patch the following config(s). Apply by hand before running `bun dev`:"
  );
  console.warn('');
  for (const m of manual) {
    const file = m.file ? `${m.file} — ` : '';
    console.warn(`  • ${file}${m.name}`);
    console.warn(`      ${m.hint}`);
  }
  console.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.warn('');
}

/**
 * Remove legacy db:* scripts that older `core:init` versions wrote into
 * package.json. Older inits installed a `db:update` that chained
 * `drizzle-kit push`, which breaks on additive column changes against Turso.
 * The CLI now owns the update flow; these scripts are inert at best and
 * misleading at worst. Only exact matches are removed so user customizations
 * are preserved. Returns the list of script names removed.
 */
export async function stripLegacyDbScripts(targetDir) {
  const packageJsonPath = path.join(targetDir, 'package.json');
  if (!(await fs.pathExists(packageJsonPath))) return [];

  const packageJson = await fs.readJson(packageJsonPath);
  if (!packageJson.scripts) return [];

  const legacy = {
    'db:generate': 'npx sailor db:generate && drizzle-kit generate',
    'db:push': 'drizzle-kit push',
    'db:update': 'npm run db:generate && npm run db:push && npx sailor db:seed'
  };

  const removed = [];
  for (const [name, value] of Object.entries(legacy)) {
    if (packageJson.scripts[name] === value) {
      delete packageJson.scripts[name];
      removed.push(name);
    }
  }

  if (removed.length > 0) {
    await fs.writeJson(packageJsonPath, packageJson, { spaces: 2 });
  }
  return removed;
}

/**
 * Restore drizzle scaffolding (`drizzle.config.ts` + `drizzle/meta/_journal.json`)
 * if missing. Lets users wipe `drizzle/` and `sailor.sqlite` for a clean rebuild
 * without falling back to `core:init` (which also reinstalls deps and copies
 * templates). Both files are recoverable: the config is a one-line re-export
 * from the sailor library, and the journal is just an empty seed that
 * `drizzle-kit generate` populates on its first run.
 *
 * Returns the list of files restored so the caller can log it.
 */
export async function ensureDrizzleScaffold(targetDir) {
  const restored = [];

  const drizzleConfigTarget = path.join(targetDir, 'drizzle.config.ts');
  if (!(await fs.pathExists(drizzleConfigTarget))) {
    const mainProjectDir = path.join(__dirname, '..');
    const drizzleConfigSource = path.join(mainProjectDir, 'drizzle.config.ts');
    if (await fs.pathExists(drizzleConfigSource)) {
      await fs.copy(drizzleConfigSource, drizzleConfigTarget);
      restored.push('drizzle.config.ts');
    }
  }

  const journalPath = path.join(targetDir, 'drizzle', 'meta', '_journal.json');
  if (!(await fs.pathExists(journalPath))) {
    await fs.ensureDir(path.dirname(journalPath));
    const dialect = process.env.DATABASE_URL?.startsWith('postgres') ? 'postgresql' : 'sqlite';
    await fs.writeJson(journalPath, { version: '7', dialect, entries: [] }, { spaces: 0 });
    restored.push('drizzle/meta/_journal.json');
  }

  return restored;
}

/**
 * If DATABASE_URL points to a local SQLite file, make sure its parent directory
 * exists. Called before any CLI step that hands off to drizzle-kit / libsql.
 */
export async function ensureDbDir(targetDir) {
  await loadConsumerEnv(targetDir);
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || !dbUrl.startsWith('file:')) return;
  const filePath = dbUrl.replace(/^file:/, '');
  const absolute = path.isAbsolute(filePath) ? filePath : path.join(targetDir, filePath);
  const dir = path.dirname(absolute);
  await fs.ensureDir(dir);
}

export async function updateViteConfig(targetDir) {
  const configPath = path.join(targetDir, 'vite.config.ts');
  if (!(await fs.pathExists(configPath))) {
    console.log('⚠️ vite.config.ts not found, skipping Vite plugin configuration');
    return { applied: [], manual: [] };
  }

  const existingContent = await fs.readFile(configPath, 'utf8');
  const { content: patched, applied, manual } = patchViteConfig(existingContent);
  if (applied.length > 0) {
    await fs.writeFile(configPath, patched);
    console.log(`✅ Updated vite.config.ts: ${applied.join(', ')}`);
  }
  return {
    applied,
    manual: manual.map((m) => ({ file: 'vite.config.ts', ...m }))
  };
}

export async function setupDatabase(targetDir) {
  // Ensure drizzle directory exists and initialize it
  await fs.ensureDir(path.join(targetDir, 'drizzle', 'meta'));

  // Create initial journal file for drizzle-kit
  const journalPath = path.join(targetDir, 'drizzle', 'meta', '_journal.json');
  if (!(await fs.pathExists(journalPath))) {
    await fs.writeJson(journalPath, {
      version: '7',
      dialect: 'sqlite',
      entries: []
    });
  }

  await generateSchema(targetDir);
  execSync('npx drizzle-kit generate', { cwd: targetDir, stdio: 'pipe' });
  execSync('npx drizzle-kit push', { cwd: targetDir, stdio: 'pipe' });
  const pkgSeeder = path.join(targetDir, 'node_modules', 'sailorcms', 'cli', 'tools', 'db-seed.js');
  const localSeeder = path.join(__dirname, 'tools', 'db-seed.js');
  const seederPath = (await fs.pathExists(pkgSeeder)) ? pkgSeeder : localSeeder;
  execSync(`node ${seederPath}`, { cwd: targetDir, stdio: 'pipe' });
  console.log('✅ Database setup complete');
}

export async function generateSchema(targetDir) {
  // Check required files exist in consumer project
  const requiredFiles = [
    'src/lib/sailor/templates/blocks/index.ts',
    'src/lib/sailor/templates/collections/index.ts',
    'src/lib/sailor/templates/globals/index.ts',
    'drizzle.config.ts'
  ];

  for (const file of requiredFiles) {
    if (!(await fs.pathExists(path.join(targetDir, file)))) {
      throw new Error(`Required file missing: ${file}. Please run "npx sailor core:init" first.`);
    }
  }

  // Use the CLI command (it now auto-detects and uses tsx when needed)
  execSync('npx sailor db:generate', {
    cwd: targetDir,
    stdio: 'inherit'
  });
}

export async function detectPackageManager(targetDir) {
  // Check bun first — bun.lock (text, Bun ≥1.2) or bun.lockb (legacy binary)
  const lockFiles = [
    { file: 'bun.lock', manager: 'bun' },
    { file: 'bun.lockb', manager: 'bun' },
    { file: 'pnpm-lock.yaml', manager: 'pnpm' },
    { file: 'yarn.lock', manager: 'yarn' },
    { file: 'package-lock.json', manager: 'npm' }
  ];
  for (const { file, manager } of lockFiles) {
    if (await fs.pathExists(path.join(targetDir, file))) {
      return manager;
    }
  }
  const packageJsonPath = path.join(targetDir, 'package.json');
  if (await fs.pathExists(packageJsonPath)) {
    const packageJson = await fs.readJson(packageJsonPath);
    if (packageJson.packageManager) {
      return packageJson.packageManager.split('@')[0];
    }
  }
  return 'npm';
}

export function getInstallCommand(packageManager) {
  switch (packageManager) {
    case 'yarn':
      return 'yarn install';
    case 'pnpm':
      return 'pnpm install';
    case 'bun':
      return 'bun install';
    default:
      return 'npm install';
  }
}

export async function trackInstalledDependencies(targetDir) {
  const trackingFile = path.join(targetDir, '.sailor-deps.json');

  // Read from CMS source package.json, not target project package.json
  const mainProjectDir = path.join(__dirname, '..');
  const mainPackageJsonPath = path.join(mainProjectDir, 'package.json');
  const mainPackageJson = await fs.readJson(mainPackageJsonPath);

  const installedDeps = {
    dependencies: {
      // Add sailorcms itself as a tracked dependency
      sailorcms: mainPackageJson.version,
      ...(mainPackageJson.dependencies || {})
    },
    devDependencies: mainPackageJson.devDependencies || {},
    timestamp: new Date().toISOString()
  };

  await fs.writeJson(trackingFile, installedDeps, { spaces: 2 });
}

// Create a Drizzle client for CLI commands using the consumer app's generated schema
export async function getConsumerSchemaOrFail(targetDir) {
  const schemaPath = path.join(targetDir, 'src', 'lib', 'sailor', 'generated', 'schema.ts');
  if (!(await fs.pathExists(schemaPath))) {
    throw new Error(
      'Generated schema not found at src/lib/sailor/generated/schema.ts. Run "npx sailor db:update" first.'
    );
  }
  // Dynamic import of consumer schema
  const schemaUrl = pathToFileURL(schemaPath).href;
  return await import(schemaUrl);
}

/**
 * Load the consumer's `.env` via their installed dotenv. Silently no-ops if
 * dotenv isn't present (still-uninstalled projects, CI environments where
 * env vars come from elsewhere). Idempotent — safe to call repeatedly.
 */
export async function loadConsumerEnv(targetDir) {
  try {
    const dotenvPath = path.join(targetDir, 'node_modules', 'dotenv', 'lib', 'main.js');
    if (!(await fs.pathExists(dotenvPath))) return;
    const { config } = await import(pathToFileURL(dotenvPath).href);
    config({ path: path.join(targetDir, '.env'), quiet: true });
  } catch {
    /* ignore */
  }
}

/**
 * Open a libsql client against the consumer's DATABASE_URL. Loads env first
 * if not already loaded. Returns the raw client (not a drizzle wrapper) so
 * callers can issue arbitrary `client.execute()` queries — useful for the
 * repair commands that work below the schema level.
 *
 * Pass `{ skipPostgres: 'message...' }` to short-circuit if DATABASE_URL is a
 * Postgres URL — the repair commands are SQLite/libsql-only.
 */
export async function createConsumerLibsqlClient(targetDir, { skipPostgres } = {}) {
  await loadConsumerEnv(targetDir);
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL is not set. Copy .env.sailor to .env and set it.');
  }
  if (skipPostgres && dbUrl.startsWith('postgres')) {
    return { client: null, dbUrl, skipped: true, skipReason: skipPostgres };
  }
  const { createClient } = await import('@libsql/client');
  const client = createClient({ url: dbUrl, authToken: process.env.DATABASE_AUTH_TOKEN });
  return { client, dbUrl, skipped: false };
}

export async function createCliDbOrFail(targetDir) {
  const { client } = await createConsumerLibsqlClient(targetDir);
  const { drizzle } = await import('drizzle-orm/libsql');
  const schema = await getConsumerSchemaOrFail(targetDir);
  return drizzle(client, { schema });
}

/**
 * Apply pending drizzle migrations.
 *
 * Why not just `drizzle-kit push`? Push has a SQLite-rebuild bug — it issues
 * `CREATE UNIQUE INDEX <final_name> ON __new_<table>` *before* dropping the
 * original, and the index name collides in SQLite's global namespace. Migration
 * files don't have this issue (DROP-then-CREATE-INDEX in the right order), so
 * we apply them via drizzle-orm's `migrate()` directly.
 *
 * For dev DBs that previously used push, `__drizzle_migrations` doesn't exist.
 * Migrate would then try to apply 0000 from scratch against tables that already
 * exist. To avoid that, we bootstrap: detect a known sailor table (`users`),
 * and if found with an empty `__drizzle_migrations`, seed one row marking the
 * latest journal entry as applied. Future migrations apply normally on top.
 *
 * Postgres uses the same migrate flow with a Postgres-syntax bootstrap, but
 * skips the SQLite rebuild patcher (no rebuild trap on Postgres) and the
 * drift-detection check (drift detection is SQLite-specific in db-repair.js;
 * a Postgres equivalent isn't wired up yet).
 */
export async function runMigrations(targetDir) {
  await loadConsumerEnv(targetDir);
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL is not set.');
  }

  const journalPath = path.join(targetDir, 'drizzle', 'meta', '_journal.json');
  if (!(await fs.pathExists(journalPath))) {
    console.log('⚠️  No drizzle journal found at drizzle/meta/_journal.json; skipping migrate.');
    return;
  }
  const journal = await fs.readJson(journalPath);
  if (!journal.entries?.length) {
    return;
  }

  if (dbUrl.startsWith('postgres')) {
    await runPostgresMigrations(targetDir, dbUrl, journal);
    return;
  }

  const { createClient } = await import('@libsql/client');
  const { drizzle } = await import('drizzle-orm/libsql');
  const { migrate } = await import('drizzle-orm/libsql/migrator');

  const client = createClient({
    url: dbUrl,
    authToken: process.env.DATABASE_AUTH_TOKEN
  });

  try {
    // Bootstrap for dev DBs previously kept in sync via push
    const { rows: usersExists } = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='users' LIMIT 1"
    );
    if (usersExists.length > 0) {
      await client.execute(`CREATE TABLE IF NOT EXISTS __drizzle_migrations (
        id INTEGER PRIMARY KEY,
        hash text NOT NULL,
        created_at numeric
      )`);
      const { rows: countRow } = await client.execute(
        'SELECT COUNT(*) as count FROM __drizzle_migrations'
      );

      // Drift detection only makes sense when the DB *claims* to be up to
      // date — i.e., __drizzle_migrations' high-water mark is at-or-past the
      // latest journal entry. If a newer migration is pending (the common
      // case after editing templates and re-running db:update), the
      // "missing" tables/columns are exactly what migrate() is about to
      // add, not drift. Only the bootstrap case (count===0) and the
      // already-up-to-date case need the check; pending migrations get a
      // pass and let migrate() do its job.
      const { rows: maxRow } = await client.execute(
        'SELECT MAX(created_at) as max FROM __drizzle_migrations'
      );
      const maxApplied = maxRow[0].max != null ? Number(maxRow[0].max) : null;
      const latestEntry = journal.entries[journal.entries.length - 1];
      const hasPending = maxApplied == null || maxApplied < latestEntry.when;
      const isBootstrap = Number(countRow[0].count) === 0;
      const shouldCheckDrift = isBootstrap || !hasPending;

      const { detectSchemaDrift } = await import('./tools/db-repair.js');
      const schemaPath = path.join(targetDir, 'src/lib/sailor/generated/schema.ts');
      const drift = shouldCheckDrift
        ? await detectSchemaDrift(client, schemaPath)
        : { missingTables: [], missingColumns: [] };
      if (drift.missingTables.length > 0 || drift.missingColumns.length > 0) {
        console.error('\n❌ Schema drift detected — DB does not match generated/schema.ts.');
        if (drift.missingColumns.length > 0) {
          console.error(`   Missing columns (${drift.missingColumns.length}):`);
          for (const c of drift.missingColumns.slice(0, 10)) {
            console.error(`     ${c.table}.${c.column}`);
          }
          if (drift.missingColumns.length > 10) {
            console.error(`     …and ${drift.missingColumns.length - 10} more`);
          }
        }
        if (drift.missingTables.length > 0) {
          console.error(`   Missing tables (${drift.missingTables.length}):`);
          for (const t of drift.missingTables.slice(0, 10)) console.error(`     ${t}`);
        }
        const explanation =
          Number(countRow[0].count) === 0
            ? '\n   Cannot bootstrap migration tracking against a drifted schema — doing so' +
              '\n   would mark unapplied migrations as applied and leave the columns missing forever.'
            : '\n   __drizzle_migrations claims migrations are applied that did not actually land.' +
              "\n   Likely caused by a previous run's bootstrap on a DB that was behind the journal head.";
        console.error(
          explanation +
            '\n\n   Run `npx sailor db:repair` to apply missing columns and reconcile tracking.'
        );
        throw new Error('Schema drift detected; refusing to migrate.');
      }

      if (Number(countRow[0].count) === 0) {
        const latest = journal.entries[journal.entries.length - 1];
        const sqlPath = path.join(targetDir, 'drizzle', `${latest.tag}.sql`);
        const cryptoModule = await import('node:crypto');
        const hash = cryptoModule
          .createHash('sha256')
          .update(await fs.readFile(sqlPath, 'utf-8'))
          .digest('hex');
        await client.execute({
          sql: 'INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)',
          args: [hash, latest.when]
        });
        console.log(
          `📋 Adopted ${journal.entries.length} pre-existing migration(s) into __drizzle_migrations (last: ${latest.tag}).`
        );
      }
    }

    // Compute what the migrator considers applied so the patcher knows
    // which entries are pending. (Re-read here; usersExists branch above
    // may not have run on a brand-new DB.)
    let maxAppliedForPatcher = null;
    try {
      const { rows } = await client.execute(
        'SELECT MAX(created_at) as max FROM __drizzle_migrations'
      );
      if (rows[0]?.max != null) maxAppliedForPatcher = Number(rows[0].max);
    } catch {
      // __drizzle_migrations doesn't exist yet — treat as no applied entries
    }
    await patchSqliteRebuildBug(client, targetDir, journal, maxAppliedForPatcher);

    const db = drizzle(client);
    await migrate(db, { migrationsFolder: path.join(targetDir, 'drizzle') });
  } finally {
    client.close?.();
  }
}

/**
 * Postgres migrate path. Mirrors the libsql bootstrap (so a DB previously
 * kept in sync via `drizzle-kit push` doesn't get its existing schema
 * re-applied from migration 0000), but with Postgres syntax:
 *   - `to_regclass('public.users')` instead of `sqlite_master`
 *   - `drizzle.__drizzle_migrations` (in the `drizzle` schema) instead of
 *     the default-schema `__drizzle_migrations`
 *   - `SERIAL`/`BIGINT` instead of `INTEGER`/`numeric`
 * No SQLite-rebuild patch (Postgres has no rebuild trap), no drift detection
 * (db-repair.js's check is SQLite-specific — Postgres equivalent is a queued
 * follow-up).
 */
async function runPostgresMigrations(targetDir, dbUrl, journal) {
  const { Pool } = await import('pg');
  const { drizzle } = await import('drizzle-orm/node-postgres');
  const { migrate } = await import('drizzle-orm/node-postgres/migrator');

  const pool = new Pool({ connectionString: dbUrl });

  try {
    // Bootstrap for dev DBs previously kept in sync via push: if `users`
    // exists but the migrations table is empty, seed it with the latest
    // journal entry as already-applied so migrate() doesn't try to re-run
    // 0000 against existing tables.
    const usersExistsResult = await pool.query("SELECT to_regclass('public.users') AS reg");
    const usersExists = usersExistsResult.rows[0]?.reg !== null;

    if (usersExists) {
      await pool.query('CREATE SCHEMA IF NOT EXISTS "drizzle"');
      await pool.query(`CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
        id SERIAL PRIMARY KEY,
        hash TEXT NOT NULL,
        created_at BIGINT
      )`);

      const countResult = await pool.query(
        'SELECT COUNT(*)::int AS count FROM "drizzle"."__drizzle_migrations"'
      );
      const count = Number(countResult.rows[0].count);

      if (count === 0) {
        const latest = journal.entries[journal.entries.length - 1];
        const sqlPath = path.join(targetDir, 'drizzle', `${latest.tag}.sql`);
        const cryptoModule = await import('node:crypto');
        const hash = cryptoModule
          .createHash('sha256')
          .update(await fs.readFile(sqlPath, 'utf-8'))
          .digest('hex');
        await pool.query(
          'INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at) VALUES ($1, $2)',
          [hash, latest.when]
        );
        console.log(
          `📋 Adopted ${journal.entries.length} pre-existing migration(s) into __drizzle_migrations (last: ${latest.tag}).`
        );
      }
    }

    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: path.join(targetDir, 'drizzle') });
  } finally {
    await pool.end();
  }
}

/**
 * Drizzle-kit's SQLite generator emits buggy INSERT-SELECT SQL for table
 * rebuilds that also add columns: it lists the *new* schema's columns on
 * both sides of `INSERT INTO __new_X (...) SELECT ... FROM X`, so SQLite
 * fails on the SELECT side with "no such column: <new-col>" because those
 * columns don't exist on the source table yet.
 *
 * Rebuilds happen whenever the change can't be expressed as ALTER (drop
 * NOT NULL, drop column, rename, change type, ...). Any template change
 * that pairs additive new fields with a non-additive change to an existing
 * field — typically removing `required: true` — trips it.
 *
 * This patcher scans pending migration files, finds rebuild blocks, drops
 * non-existent columns from both INSERT and SELECT lists, and writes the
 * corrected file back. New columns take their declared defaults / NULL on
 * existing rows — which is what would have happened with a working
 * generator. Aborts with a precise error if a missing column is NOT NULL
 * without a DEFAULT (genuinely undefined — needs a backfill value).
 *
 * Caveat: relies on PRAGMA against the live DB to know the source shape.
 * That covers the dominant case (existing DB upgrading via db:update). On
 * a fresh DB cloning into existing migrations, tables created by *earlier*
 * pending migrations don't yet exist when this runs, so rebuilds in *later*
 * pending migrations are skipped here and would still hit drizzle's bug.
 * Rare in practice; can be addressed with a journal-walking simulator if
 * it ever bites.
 */
async function patchSqliteRebuildBug(client, targetDir, journal, maxApplied) {
  const pending = journal.entries.filter(
    (e) => maxApplied == null || Number(e.when) > Number(maxApplied)
  );
  if (pending.length === 0) return;

  const insertSelectRe =
    /INSERT INTO `__new_([^`]+)`\s*\(([^)]+)\)\s*SELECT\s+(.+?)\s+FROM\s+`\1`/g;

  for (const entry of pending) {
    const sqlPath = path.join(targetDir, 'drizzle', `${entry.tag}.sql`);
    if (!(await fs.pathExists(sqlPath))) continue;
    const original = await fs.readFile(sqlPath, 'utf-8');

    let patched = original;
    const summaries = [];
    const matches = [...original.matchAll(insertSelectRe)];

    for (const m of matches) {
      const tableName = m[1];
      const insertCols = m[2].split(',').map(parseQuotedIdent);
      const selectCols = m[3].split(',').map(parseQuotedIdent);

      let liveCols;
      try {
        const res = await client.execute(`PRAGMA table_info("${tableName}")`);
        liveCols = new Set(res.rows.map((r) => r.name));
      } catch {
        liveCols = new Set();
      }
      if (liveCols.size === 0) continue; // table doesn't exist yet — see caveat in doc

      const missing = insertCols.filter((c) => !liveCols.has(c));
      if (missing.length === 0) continue;

      // Validate each missing column is either nullable or has a DEFAULT —
      // otherwise dropping it from the INSERT would violate NOT NULL.
      const createRe = new RegExp(
        'CREATE TABLE `__new_' + escapeRegex(tableName) + '`\\s*\\(([\\s\\S]+?)\\n\\)'
      );
      const createMatch = original.match(createRe);
      const colDefs = createMatch ? parseColumnDefs(createMatch[1]) : new Map();

      const unfixable = [];
      for (const col of missing) {
        const def = colDefs.get(col);
        if (def && def.notNull && !def.hasDefault) unfixable.push(col);
      }
      if (unfixable.length > 0) {
        throw new Error(
          `Migration drizzle/${entry.tag}.sql adds NOT NULL column(s) without a default to \`${tableName}\`: ` +
            `${unfixable.join(', ')}. Drizzle-kit's SQLite rebuild can't backfill these for existing rows. ` +
            `Edit the corresponding template field(s) to add a \`default\` value, or make them optional, then re-run \`npx sailor db:update\`.`
        );
      }

      const keep = insertCols
        .map((ins, i) => ({ ins, sel: selectCols[i] }))
        .filter((p) => liveCols.has(p.ins));
      const newInsertCols = keep.map((p) => `"${p.ins}"`).join(', ');
      const newSelectCols = keep.map((p) => `"${p.sel}"`).join(', ');
      const replacement = `INSERT INTO \`__new_${tableName}\`(${newInsertCols}) SELECT ${newSelectCols} FROM \`${tableName}\``;
      patched = patched.replace(m[0], replacement);
      summaries.push({ table: tableName, removed: missing });
    }

    if (patched !== original) {
      await fs.writeFile(sqlPath, patched);
      for (const s of summaries) {
        console.log(
          `🔧 Patched drizzle/${entry.tag}.sql (\`${s.table}\` rebuild): dropped ${s.removed.length} new column(s) from INSERT-SELECT — ${s.removed.join(', ')}.`
        );
      }
      console.log(
        "   Worked around drizzle-kit's SQLite rebuild bug. New columns take their declared defaults (or NULL) on existing rows. Commit the patched migration."
      );
    }
  }
}

function parseQuotedIdent(s) {
  return s
    .trim()
    .replace(/^"(.+)"$/, '$1')
    .replace(/^`(.+)`$/, '$1');
}

function parseColumnDefs(body) {
  const out = new Map();
  for (const raw of body.split('\n')) {
    const m = raw.trim().match(/^`([^`]+)`\s+(.+?),?$/);
    if (!m) continue;
    out.set(m[1], {
      notNull: /\bNOT NULL\b/i.test(m[2]),
      hasDefault: /\bDEFAULT\b/i.test(m[2])
    });
  }
  return out;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function cleanupUnusedDependencies(targetDir) {
  const trackingFile = path.join(targetDir, '.sailor-deps.json');
  const packageJsonPath = path.join(targetDir, 'package.json');

  if (!(await fs.pathExists(trackingFile))) {
    return; // No tracking file, can't cleanup
  }

  const trackingData = await fs.readJson(trackingFile);
  const packageJson = await fs.readJson(packageJsonPath);

  // Get current Sailor CMS dependencies
  const mainProjectDir = path.join(__dirname, '..');
  const mainPackageJsonPath = path.join(mainProjectDir, 'package.json');
  const mainPackageJson = await fs.readJson(mainPackageJsonPath);

  const allDeps = {
    ...mainPackageJson.dependencies,
    ...mainPackageJson.devDependencies
  };

  const currentCmsDeps = Object.entries(allDeps).filter(([name, _version]) => {
    return (
      !name.includes('eslint') &&
      !name.includes('prettier') &&
      !name.includes('typescript') &&
      !name.includes('svelte-check') &&
      !name.includes('@sveltejs/') &&
      !name.includes('@types/') &&
      (name === '@tailwindcss/vite' || !name.includes('vite'))
    );
  });

  const currentCmsDepNames = currentCmsDeps.map(([name]) => name);
  const previouslyInstalledDeps = {
    ...trackingData.dependencies,
    ...trackingData.devDependencies
  };

  // Find unused dependencies
  const unusedDeps = Object.keys(previouslyInstalledDeps).filter((dep) => {
    return (
      dep !== 'sailorcms' && // Never remove sailorcms - it's our version reference
      !currentCmsDepNames.includes(dep) &&
      !packageJson.dependencies?.[dep] &&
      !packageJson.devDependencies?.[dep]
    );
  });

  if (unusedDeps.length > 0) {
    console.log('🧹 Cleaning up unused dependencies...');
    console.log(`Removing: ${unusedDeps.join(', ')}`);

    // Remove unused dependencies
    const packageManager = await detectPackageManager(targetDir);
    const uninstallCommand = getUninstallCommand(packageManager, unusedDeps);
    execSync(uninstallCommand, { cwd: targetDir, stdio: 'pipe' });

    console.log('✅ Cleaned up unused dependencies');
  }
}

export function getUninstallCommand(packageManager, packages) {
  const packageList = packages.join(' ');
  switch (packageManager) {
    case 'yarn':
      return `yarn remove ${packageList}`;
    case 'pnpm':
      return `pnpm remove ${packageList}`;
    case 'bun':
      return `bun remove ${packageList}`;
    default:
      return `npm uninstall ${packageList}`;
  }
}
