import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

export async function setupSailorFiles(targetDir, force = false) {
  const mainProjectDir = path.join(__dirname, '..');
  const targetSrcDir = path.join(targetDir, 'src');
  await fs.ensureDir(targetSrcDir);

  // Copy app files - handle app.css carefully to preserve user customizations
  const alwaysSafeFiles = ['app.html', 'app.d.ts'];
  const conditionalFiles = ['app.css'];

  // Always copy safe files
  for (const file of alwaysSafeFiles) {
    const sourceFile = path.join(mainProjectDir, 'src', file);
    const targetFile = path.join(targetSrcDir, file);
    if (await fs.pathExists(sourceFile)) {
      await fs.copy(sourceFile, targetFile, { overwrite: true });
    }
  }

  // Handle app.css carefully to preserve user customizations
  for (const file of conditionalFiles) {
    const sourceFile = path.join(mainProjectDir, 'src', file);
    const targetFile = path.join(targetSrcDir, file);
    if (await fs.pathExists(sourceFile)) {
      if ((await fs.pathExists(targetFile)) && !force) {
        console.log(`⚠️ ${file} exists - manually update or use --force to overwrite`);
      } else {
        await fs.copy(sourceFile, targetFile, { overwrite: true });
      }
    }
  }
  // Handle hooks.server.ts carefully
  const hooksServerSource = path.join(mainProjectDir, 'src', 'hooks.server.ts');
  const hooksServerTarget = path.join(targetSrcDir, 'hooks.server.ts');

  if (await fs.pathExists(hooksServerSource)) {
    if ((await fs.pathExists(hooksServerTarget)) && !force) {
      console.log('⚠️ hooks.server.ts exists - manually add auth or use --force');
    } else {
      await fs.copy(hooksServerSource, hooksServerTarget, { overwrite: true });
    }
  }

  // Handle hooks.client.ts carefully
  const hooksClientSource = path.join(mainProjectDir, 'src', 'hooks.client.ts');
  const hooksClientTarget = path.join(targetSrcDir, 'hooks.client.ts');

  if (await fs.pathExists(hooksClientSource)) {
    if ((await fs.pathExists(hooksClientTarget)) && !force) {
      console.log('⚠️ hooks.client.ts exists - manually add auth or use --force');
    } else {
      await fs.copy(hooksClientSource, hooksClientTarget, { overwrite: true });
    }
  }

  // Copy Sailor CMS directory (excluding templates to preserve user customizations)
  const mainSailorDir = path.join(mainProjectDir, 'src', 'lib', 'sailor');
  const targetLibDir = path.join(targetSrcDir, 'lib');
  const targetSailorDir = path.join(targetLibDir, 'sailor');
  const mainTemplatesDir = path.join(mainSailorDir, 'templates');
  const targetTemplatesDir = path.join(targetSailorDir, 'templates');

  // 1. Copy the sailor directory, always skipping templates
  if (await fs.pathExists(mainSailorDir)) {
    await fs.copy(mainSailorDir, targetSailorDir, {
      overwrite: true,
      filter: (src) => {
        // Always skip templates here, will handle below
        return !src.includes(path.join('sailor', 'templates'));
      }
    });
  }

  // 2. Copy templates if needed
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

  const mainComponentsDir = path.join(mainProjectDir, 'src', 'lib', 'components');
  const targetComponentsDir = path.join(targetLibDir, 'components');
  if (await fs.pathExists(mainComponentsDir)) {
    await fs.copy(mainComponentsDir, targetComponentsDir, { overwrite: true });
  }

  const mainHooksDir = path.join(mainProjectDir, 'src', 'lib', 'hooks');
  const targetHooksDir = path.join(targetLibDir, 'hooks');
  if (await fs.pathExists(mainHooksDir)) {
    await fs.copy(mainHooksDir, targetHooksDir, { overwrite: true });
  }

  await setupRoutes(targetDir);
  const cfgResult = await setupConfigFiles(targetDir, force);
  return { manual: cfgResult?.manual || [] };
}

export async function updateSailorCoreFiles(targetDir) {
  const mainProjectDir = path.join(__dirname, '..');
  const targetSrcDir = path.join(targetDir, 'src');
  await fs.ensureDir(targetSrcDir);

  // Only update Sailor CMS core files, not user templates
  const mainSailorDir = path.join(mainProjectDir, 'src', 'lib', 'sailor');
  const targetLibDir = path.join(targetSrcDir, 'lib');
  const targetSailorDir = path.join(targetLibDir, 'sailor');
  // Template directories defined but currently not used in copy operation
  // const mainTemplatesDir = path.join(mainSailorDir, 'templates');
  // const targetTemplatesDir = path.join(targetSailorDir, 'templates');

  // Copy entire sailor directory but exclude templates to preserve user customizations
  if (await fs.pathExists(mainSailorDir)) {
    await fs.copy(mainSailorDir, targetSailorDir, {
      overwrite: true,
      filter: (src) => {
        return (
          !src.includes(path.join('sailor', 'templates')) &&
          !src.includes(path.join('sailor', 'generated')) &&
          !src.includes(path.join('sailor', 'i18n', 'messages'))
        );
      }
    });
    console.log('📝 Updated sailor core files');

    // First-time seed for `i18n/messages` if the consumer doesn't have it yet
    // (e.g. project init'd before i18n landed). After this, the dir is
    // preserved across updates so user translation refinements stick.
    const mainMessagesDir = path.join(mainSailorDir, 'i18n', 'messages');
    const targetMessagesDir = path.join(targetSailorDir, 'i18n', 'messages');
    if (await fs.pathExists(mainMessagesDir)) {
      const exists = await fs.pathExists(targetMessagesDir);
      const isEmpty = exists ? (await fs.readdir(targetMessagesDir)).length === 0 : false;
      if (!exists || isEmpty) {
        await fs.copy(mainMessagesDir, targetMessagesDir, { overwrite: true });
        console.log('📝 Seeded i18n/messages (first-time, preserved on future updates)');
      }
    }

    // Remove files/folders in targetSailorDir that no longer exist in mainSailorDir
    await cleanDir(mainSailorDir, targetSailorDir, ['templates', 'generated', 'i18n/messages']);
  }

  // Update components — CMS-managed subfolders (ui/ and sailor/) get cleaned so
  // files removed from the reference are also removed on update. Any other user
  // subfolders under components/ are left alone.
  const mainComponentsDir = path.join(mainProjectDir, 'src', 'lib', 'components');
  const targetComponentsDir = path.join(targetLibDir, 'components');
  if (await fs.pathExists(mainComponentsDir)) {
    await fs.copy(mainComponentsDir, targetComponentsDir, { overwrite: true });
    for (const sub of ['ui', 'sailor']) {
      await cleanDir(path.join(mainComponentsDir, sub), path.join(targetComponentsDir, sub));
    }
  }

  const mainHooksDir = path.join(mainProjectDir, 'src', 'lib', 'hooks');
  const targetHooksDir = path.join(targetLibDir, 'hooks');
  if (await fs.pathExists(mainHooksDir)) {
    await fs.copy(mainHooksDir, targetHooksDir, { overwrite: true });
  }

  await updateRoutes(targetDir);
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
  if (await fs.pathExists(envSource)) {
    await fs.copy(envSource, envSailorTarget);
    console.log('📝 Created .env.sailor - copy variables to your .env file');
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
function patchViteConfig(content) {
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
function patchSvelteConfig(content) {
  let updated = content;
  const applied = [];
  const manual = [];

  // 1. $sailor alias
  if (!/\$sailor/.test(updated)) {
    const aliasBlock = `alias: {\n      '$sailor': 'src/lib/sailor'\n    }`;
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
    if (updated !== before) applied.push('$sailor alias');
    else
      manual.push({
        name: '$sailor alias',
        hint: "Add `alias: { '$sailor': 'src/lib/sailor' }` inside `kit: {}`."
      });
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
  }

  return { content: updated, applied, manual };
}

/**
 * Workaround for a bun-specific install quirk that breaks the Svelte compiler.
 *
 * When sailorcms is installed via a `file:../sailorcms` reference, bun
 * recursively re-installs sailorcms's own deps under
 * `node_modules/sailorcms/node_modules/` AND nests an older `acorn` under
 * `node_modules/svelte/node_modules/acorn` (8.15.0 alongside the top-level
 * 8.16.0). Two acorn instances are loaded into the same process: the one
 * `@sveltejs/acorn-typescript`'s tsPlugin extends, and the one svelte's
 * parser actually calls into. tsPlugin's TypeScript-parsing extensions get
 * grafted onto the wrong instance, so any `<script lang="ts">` in shipped
 * .svelte files (lucide, bits-ui, the consumer's own routes after sailor
 * copies its admin chrome) fails with `Unexpected token`.
 *
 * The nested copy gets recreated on every `bun install`, so we strip it
 * after every CLI-driven install. Surgical: only removes
 * `node_modules/svelte/node_modules`, which only contains the duplicate
 * acorn anyway. Module resolution falls through to top-level `node_modules`
 * after removal, which is what we want.
 */
export async function dedupeNestedSvelteDeps(targetDir) {
  const nested = path.join(targetDir, 'node_modules', 'svelte', 'node_modules');
  if (!(await fs.pathExists(nested))) return false;
  await fs.remove(nested);
  console.log(
    'ℹ️  Removed nested node_modules/svelte/node_modules (bun file:-link dedup workaround).'
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
  // Load .env so DATABASE_URL is available.
  try {
    const dotenvPath = path.join(targetDir, 'node_modules', 'dotenv', 'lib', 'main.js');
    const { config } = await import(dotenvPath);
    config({ path: path.join(targetDir, '.env') });
  } catch {
    // dotenv not installed or .env missing — nothing to do.
    return;
  }

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

export async function createCliDbOrFail(targetDir) {
  // Ensure env loaded from consumer project
  try {
    const dotenvPath = path.join(targetDir, 'node_modules', 'dotenv', 'lib', 'main.js');
    const { config } = await import(dotenvPath);
    config();
  } catch {}

  // Create libsql client directly (avoid importing adapter files)
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL is not set. Copy .env.sailor to .env and set it.');
  }
  const { createClient } = await import('@libsql/client');
  const { drizzle } = await import('drizzle-orm/libsql');
  const client = createClient({ url: dbUrl, authToken: process.env.DATABASE_AUTH_TOKEN });

  // Get consumer schema (throws if missing)
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
 * Postgres doesn't have the SQLite rebuild trap, so we keep `drizzle-kit push`
 * for it until/unless we add a Postgres bootstrap path.
 */
export async function runMigrations(targetDir) {
  // Load env (DATABASE_URL etc.)
  try {
    const dotenvPath = path.join(targetDir, 'node_modules', 'dotenv', 'lib', 'main.js');
    const { config } = await import(dotenvPath);
    config({ path: path.join(targetDir, '.env') });
  } catch {}

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL is not set.');
  }

  if (dbUrl.startsWith('postgres')) {
    execSync('npx drizzle-kit push --config=drizzle.config.ts', {
      cwd: targetDir,
      stdio: 'inherit'
    });
    return;
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
