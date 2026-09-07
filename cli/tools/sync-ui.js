// Post-process newly-added shadcn-svelte components to sailor conventions.
//
// shadcn-svelte's CLI writes new components with `$lib/components/ui/...`
// cross-component references (per the alias declared in components.json).
// Sailor's ui/ resolves from the package, so those refs need to use
// `sailorcms/components/ui/...` instead — Vite's dep-scan doesn't reliably
// honor the consumer's alias when crawling sailor's source from node_modules.
//
// Run this after `npx shadcn-svelte add <name>` in the sailor repo. Idempotent.
import fs from 'fs-extra';
import path from 'path';

const UI_DIR_REL = 'src/lib/components/ui';
const SOURCE_EXTS = new Set(['.svelte', '.ts', '.js']);

async function walk(dir, onFile) {
  if (!(await fs.pathExists(dir))) return;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, onFile);
      continue;
    }
    if (!SOURCE_EXTS.has(path.extname(entry.name))) continue;
    await onFile(full);
  }
}

function rewriteContent(content) {
  let updated = content;
  let changed = false;

  // Flatten bare-barrel imports first: `$lib/components/ui/dialog` (no
  // trailing path) → `$lib/components/ui/dialog/index.js`. Then the prefix
  // swap below covers them. Match only quoted bare specifiers.
  updated = updated.replace(
    /(['"])\$lib\/components\/ui\/([a-z][a-z0-9-]*)\1/g,
    (_m, q, name) => `${q}$lib/components/ui/${name}/index.js${q}`
  );
  if (updated !== content) changed = true;

  // Prefix swap: $lib/components/ui/... → sailorcms/components/ui/...
  const before = updated;
  updated = updated.replace(/(['"])\$lib\/components\/ui\//g, '$1sailorcms/components/ui/');
  if (updated !== before) changed = true;

  // shadcn cn helper: components.json sets `utils` alias to
  // `$lib/sailor/utils/shadcn`, so newly-added components import
  // `$lib/sailor/utils/shadcn.js`. Rewrite to `sailorcms/utils/shadcn.js`
  // so the import resolves through the package's exports map.
  const beforeShadcn = updated;
  updated = updated.replace(
    /(['"])\$lib\/sailor\/utils\/shadcn(\.js)?\1/g,
    (_m, q, ext) => `${q}sailorcms/utils/shadcn${ext || '.js'}${q}`
  );
  if (updated !== beforeShadcn) changed = true;

  return { content: updated, changed };
}

export function registerSyncUi(program) {
  program
    .command('dev:sync-ui')
    .description(
      'Normalize newly-added shadcn-svelte ui components: rewrite $lib/components/ui/... refs to sailorcms/components/ui/..., flatten bare barrels to /index.js'
    )
    .action(async () => {
      const targetDir = process.cwd();
      const uiDir = path.join(targetDir, UI_DIR_REL);

      if (!(await fs.pathExists(uiDir))) {
        console.error(`❌ ${UI_DIR_REL} not found. Run from the sailorcms repo root.`);
        process.exit(1);
      }

      let touched = 0;
      const touchedFiles = [];
      await walk(uiDir, async (full) => {
        const content = await fs.readFile(full, 'utf8');
        const { content: updated, changed } = rewriteContent(content);
        if (changed) {
          await fs.writeFile(full, updated);
          touched++;
          touchedFiles.push(path.relative(targetDir, full));
        }
      });

      if (touched === 0) {
        console.log('✓ No imports to normalize — ui/ already uses sailor conventions.');
        return;
      }

      console.log(`Normalized imports in ${touched} file(s):`);
      for (const f of touchedFiles) console.log(`  ${f}`);
    });
}
