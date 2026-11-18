// SvelteKit 2 → 3 migration helpers for consumer projects, run by
// `core:init`, `core:update` and `doctor`. Each one either applies a change it
// can make safely or reports what is left as a manual step.
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  ensurePath,
  findKey,
  insertKey,
  lineIndentAt,
  listEntries,
  matchBracket,
  reindent,
  skipComment,
  isCommentStart,
  skipString
} from './config-edit.js';
import { SAILOR_ALIAS_KEYS } from './utils.js';
import { SAILOR_SUBPATHS } from '../vite-plugin.js';

const SAILOR_TS_PATHS = [
  ['$sailor', './src/lib/sailor'],
  ['$sailor/*', './src/lib/sailor/*'],
  ...SAILOR_SUBPATHS.map(([sub, dir]) => [
    `sailorcms/${sub}/*`,
    `./node_modules/sailorcms/${dir}/*`
  ])
];

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const VITE_CONFIGS = ['vite.config.ts', 'vite.config.js', 'vite.config.mts', 'vite.config.mjs'];

function findViteConfig(targetDir) {
  return VITE_CONFIGS.map((f) => path.join(targetDir, f)).find((f) => fs.existsSync(f));
}

// ─────────────────────────────────────────────────────────────────────────────
// svelte.config.js
// ─────────────────────────────────────────────────────────────────────────────

export const LEGACY_SVELTE_CONFIG_HINT =
  'SvelteKit 3 no longer reads svelte.config.js and refuses to start while it exists. Move its options into `sveltekit({...})` in vite.config.ts (kit.* options become top-level, next to `adapter`, `preprocess` and `compilerOptions`), then delete the file.';

// Option paths sailor patches into `sveltekit({...})` itself, so a different
// value in svelte.config.js (typically an older sailor's) is expected and
// not worth reporting.
const SAILOR_MANAGED = new Set([
  'compilerOptions.runes',
  'compilerOptions.experimental.async',
  'experimental.remoteFunctions'
]);

// Objects whose entries merge key by key instead of moving as one value.
const MERGED_OBJECTS = new Set([
  'alias',
  'experimental',
  'compilerOptions',
  'compilerOptions.experimental'
]);

const normalize = (src) =>
  src
    .replace(/\s+/g, '')
    .replace(/"/g, "'")
    .replace(/,([}\]])/g, '$1');

/** Import statements: `{ start, end, source, bindings, text }`. */
function parseImports(text) {
  const out = [];
  const re = /^import\s+([\s\S]*?)\s+from\s+(['"])([^'"]+)\2;?[ \t]*$/gm;
  let m;
  while ((m = re.exec(text))) {
    const clause = m[1].replace(/^type\s+/, '');
    const bindings = [];
    const named = /\{([\s\S]*)\}/.exec(clause);
    if (named) {
      for (const spec of named[1].split(',')) {
        const local = spec
          .trim()
          .replace(/^type\s+/, '')
          .split(/\s+as\s+/)
          .pop();
        if (local) bindings.push(local.trim());
      }
    }
    const rest = clause.replace(/\{[\s\S]*\}/, '');
    for (const part of rest.split(',')) {
      const local = part
        .trim()
        .replace(/^\*\s+as\s+/, '')
        .trim();
      if (/^[A-Za-z_$][\w$]*$/.test(local)) bindings.push(local);
    }
    out.push({ start: m.index, end: m.index + m[0].length, source: m[3], bindings, text: m[0] });
  }
  return out;
}

/** Strip comments, keeping string contents intact. */
function stripComments(text) {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"' || text[i] === "'" || text[i] === '`') {
      const end = skipString(text, i);
      out += text.slice(i, end + 1);
      i = end;
    } else if (isCommentStart(text, i)) {
      i = skipComment(text, i);
      if (text[i] === '\n') out += '\n';
    } else out += text[i];
  }
  return out;
}

/**
 * Locate the config object literal and make sure the file holds nothing but
 * imports, that object and its export, so moving the object loses nothing.
 */
function locateConfigObject(text) {
  const imports = parseImports(text);
  let objOpen = -1;
  let declStart = -1;
  let exportRe = null;
  const decl = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)(?:\s*:\s*[\w.$<>]+)?\s*=\s*\{/.exec(text);
  if (decl) {
    objOpen = decl.index + decl[0].length - 1;
    declStart = decl.index;
    exportRe = new RegExp(`export\\s+default\\s+${decl[1]}\\s*;?`);
  } else {
    const direct = /export\s+default\s*\{/.exec(text);
    if (!direct) return null;
    objOpen = direct.index + direct[0].length - 1;
    declStart = direct.index;
  }
  const objClose = matchBracket(text, objOpen);
  if (objClose === -1) return null;

  let rest = text.slice(0, declStart) + text.slice(objClose + 1);
  for (const imp of imports) rest = rest.replace(imp.text, '');
  if (exportRe) rest = rest.replace(exportRe, '');
  rest = stripComments(rest).replace(/;/g, '');
  if (rest.trim()) return null;
  return { objOpen, imports };
}

/** Flatten the config into `{ path, value, indent }` leaves to move. */
function collectMoves(text, objOpen) {
  const moves = [];
  const walk = (open, prefix, unwrapKit) => {
    const entries = listEntries(text, open);
    if (!entries) return false;
    for (const e of entries) {
      if (!e.key) return false;
      const value = text.slice(e.valueStart, e.valueEnd);
      if (unwrapKit && e.key === 'kit') {
        if (text[e.valueStart] !== '{' || !walk(e.valueStart, [], false)) return false;
        continue;
      }
      const keyPath = [...prefix, e.key];
      if (MERGED_OBJECTS.has(keyPath.join('.')) && text[e.valueStart] === '{') {
        if (!walk(e.valueStart, keyPath, false)) return false;
        continue;
      }
      // Shorthand `{ adapter }` carries no value text of its own.
      const shorthand = e.valueStart === e.start;
      moves.push({
        path: keyPath,
        value: shorthand ? e.key : value,
        indent: lineIndentAt(text, e.start)
      });
    }
    return true;
  };
  return walk(objOpen, [], true) ? moves : null;
}

/** The object passed to `sveltekit(...)`, creating `{}` for a bare call. */
function sveltekitOptions(content) {
  const call = /\bsveltekit\s*\(/.exec(content);
  if (!call) return null;
  const parenOpen = call.index + call[0].length - 1;
  const parenClose = matchBracket(content, parenOpen);
  if (parenClose === -1) return null;
  const args = content.slice(parenOpen + 1, parenClose).trim();
  if (!args) {
    content = `${content.slice(0, parenOpen + 1)}{}${content.slice(parenClose)}`;
  } else if (!args.startsWith('{')) {
    return null;
  }
  return { content, objOpen: content.indexOf('{', parenOpen) };
}

const identifiersIn = (src) => new Set(stripComments(src).match(/[A-Za-z_$][\w$]*/g) ?? []);

/**
 * Pure core of the migration: returns `{ vite, applied, conflicts }`, or
 * `{ error }` when svelte.config.js can't be moved safely.
 */
export function migrateSvelteConfigContent(svelteConfig, viteConfig) {
  const located = locateConfigObject(svelteConfig);
  if (!located) {
    return {
      error: 'it contains code besides imports and the config object, so it needs moving by hand.'
    };
  }
  const collected = collectMoves(svelteConfig, located.objOpen);
  if (!collected) {
    return { error: 'its config uses spreads or methods, so it needs moving by hand.' };
  }
  // Sailor's own aliases now come from `sailor()` and tsconfig `paths`.
  const moves = collected.filter(
    (m) => !(m.path[0] === 'alias' && m.path.length === 2 && SAILOR_ALIAS_KEYS.has(m.path[1]))
  );
  const target = sveltekitOptions(viteConfig);
  if (!target) {
    return {
      error: 'vite.config has no inline `sveltekit({...})` object to move the options into.'
    };
  }

  let vite = target.content;
  const { objOpen } = target;
  const applied = [];
  const conflicts = [];
  const moved = [];
  const unit = /\n\t/.test(vite) ? '\t' : '  ';
  const baseIndent = lineIndentAt(vite, objOpen);

  for (const move of moves) {
    const key = move.path.join('.');
    const indent = baseIndent + unit.repeat(move.path.length);
    const value = reindent(move.value, move.indent, indent, unit);
    const next = ensurePath(vite, objOpen, move.path, value, (current) => {
      const managed =
        SAILOR_MANAGED.has(key) ||
        (key === 'preprocess' && /^vitePreprocess\s*\([^()]*\)$/.test(move.value.trim()));
      if (normalize(current) !== normalize(move.value) && !managed) {
        conflicts.push({ key, kept: current.trim(), dropped: move.value.trim() });
      }
      return null;
    });
    if (next === null) {
      conflicts.push({ key, kept: '(not an object literal)', dropped: move.value.trim() });
    } else if (next !== vite) {
      vite = next;
      applied.push(key);
      moved.push(move.value);
    }
  }

  // Carry over the imports the moved values reference.
  const used = new Set(moved.flatMap((v) => [...identifiersIn(v)]));
  const viteImports = parseImports(vite);
  const viteBound = new Map();
  for (const imp of viteImports) for (const b of imp.bindings) viteBound.set(b, imp.source);
  const newImports = [];
  for (const imp of located.imports) {
    const needed = imp.bindings.filter((b) => used.has(b));
    if (needed.length === 0) continue;
    const clash = needed.find((b) => viteBound.has(b) && viteBound.get(b) !== imp.source);
    if (clash) {
      return {
        error: `\`${clash}\` is imported from different modules in svelte.config.js and vite.config, so it needs moving by hand.`
      };
    }
    if (needed.every((b) => viteBound.has(b))) continue;
    newImports.push(imp.text.trim());
  }
  if (newImports.length > 0) {
    const kitVite = viteImports.find((imp) => imp.source === '@sveltejs/kit/vite');
    const last = kitVite ?? viteImports[viteImports.length - 1];
    const at = last ? last.end : 0;
    vite = `${vite.slice(0, at)}${last ? '\n' : ''}${newImports.join('\n')}${last ? '' : '\n'}${vite.slice(at)}`;
  }

  return { vite, applied, conflicts };
}

/**
 * Move a kit 2 `svelte.config.js` into `sveltekit({...})` and rename it to
 * `svelte.config.js.bak`. Options vite.config already sets win; the
 * svelte.config value is reported so nothing is dropped silently.
 */
export async function migrateLegacySvelteConfig(targetDir) {
  const legacy = path.join(targetDir, 'svelte.config.js');
  if (!(await fs.pathExists(legacy))) return { applied: [], manual: [] };
  const manualFor = (why) => ({
    applied: [],
    manual: [
      {
        file: 'svelte.config.js',
        name: 'svelte.config.js',
        hint: `${LEGACY_SVELTE_CONFIG_HINT} Sailor couldn't move it: ${why}`
      }
    ]
  });

  const vitePath = findViteConfig(targetDir);
  if (!vitePath) return manualFor('no vite.config found.');
  const result = migrateSvelteConfigContent(
    await fs.readFile(legacy, 'utf8'),
    await fs.readFile(vitePath, 'utf8')
  );
  if (result.error) return manualFor(result.error);

  await fs.writeFile(vitePath, result.vite);
  await fs.move(legacy, `${legacy}.bak`, { overwrite: true });
  const viteName = path.basename(vitePath);
  console.log(
    `✅ Moved svelte.config.js into ${viteName}${result.applied.length ? ` (${result.applied.join(', ')})` : ''}; old file kept as svelte.config.js.bak`
  );

  const manual = result.conflicts.map((c) => ({
    file: viteName,
    name: `sveltekit option ${c.key}`,
    hint: `Kept \`${c.key}: ${c.kept}\` from ${viteName}; svelte.config.js had \`${c.dropped}\`. If you wanted the old value, change it in ${viteName} and import anything it uses.`
  }));
  return { applied: result.applied, manual };
}

// ─────────────────────────────────────────────────────────────────────────────
// tsconfig.json
// ─────────────────────────────────────────────────────────────────────────────

export const TSCONFIG_HINT =
  'Make tsconfig.json extend `$app/tsconfig` (SvelteKit 3 no longer writes .svelte-kit/tsconfig.json), set `"include": ["src", "test", "*"]`, `"exclude": ["src/service-worker"]`, and add `compilerOptions.paths` for `$sailor` and the `sailorcms/*` subpaths.';

/**
 * Point a kit 2 tsconfig at `$app/tsconfig`. Also drops
 * `rewriteRelativeImportExtensions`: it rejects `.ts` extensions on
 * non-relative specifiers, which `#lib/*.ts` subpath imports need.
 * Text edits rather than JSON.parse, since tsconfig allows comments.
 */
export function patchTsconfig(content) {
  const applied = [];
  let updated = content;
  const ext = /("extends"\s*:\s*)"([^"]*)"/.exec(updated);
  if (ext && ext[2] !== '$app/tsconfig') {
    if (!/^\.?\/?\.svelte-kit\/tsconfig\.json$/.test(ext[2]))
      return { content, applied, manual: true };
    updated = updated.replace(ext[0], `${ext[1]}"$app/tsconfig"`);
    applied.push('extends $app/tsconfig');
  } else if (!ext) {
    const open = updated.indexOf('{');
    if (open === -1) return { content, applied, manual: true };
    updated = `${updated.slice(0, open + 1)}\n  "extends": "$app/tsconfig",${updated.slice(open + 1)}`;
    applied.push('extends $app/tsconfig');
  }

  if (applied.length > 0 && !/"include"\s*:/.test(updated) && !/"exclude"\s*:/.test(updated)) {
    updated = updated.replace(
      /^([ \t]*)("extends"\s*:\s*"\$app\/tsconfig")(,?)/m,
      (_m, ind, decl, comma) =>
        `${ind}${decl},\n${ind}"include": ["src", "test", "*"],\n${ind}"exclude": ["src/service-worker"]${comma}`
    );
    applied.push('include/exclude');
  }

  const rewrite = /[ \t]*"rewriteRelativeImportExtensions"\s*:\s*(?:true|false)\s*,[ \t]*\r?\n?/;
  const rewriteLast = /,(\s*)"rewriteRelativeImportExtensions"\s*:\s*(?:true|false)/;
  if (rewrite.test(updated)) {
    updated = updated.replace(rewrite, '');
    applied.push('removed rewriteRelativeImportExtensions');
  } else if (rewriteLast.test(updated)) {
    updated = updated.replace(rewriteLast, '');
    applied.push('removed rewriteRelativeImportExtensions');
  }

  // sv's kit 2 template explains `config.alias` and `$lib`, both gone in kit 3.
  const staleComment = /^[ \t]*\/\/[^\n]*configuration#alias[^\n]*\n(?:[ \t]*\/\/[^\n]*\n)*/m;
  if (staleComment.test(updated)) {
    updated = updated.replace(staleComment, '');
    applied.push('removed kit 2 alias comment');
  }

  // Sailor's subpaths for TypeScript; Vite gets them from `sailor()`.
  const root = updated.indexOf('{');
  let options = findKey(updated, root, 'compilerOptions');
  if (!options) {
    updated = insertKey(updated, root, 'compilerOptions', '{}', { json: true });
    options = findKey(updated, root, 'compilerOptions');
  }
  if (options && updated[options.valueStart] === '{') {
    let changed = false;
    for (const [key, target] of SAILOR_TS_PATHS) {
      const value = JSON.stringify([target]);
      const next = ensurePath(
        updated,
        options.valueStart,
        ['paths', key],
        value,
        (current) => (normalize(current) === normalize(value) ? null : value),
        { json: true }
      );
      if (next && next !== updated) {
        updated = next;
        changed = true;
      }
    }
    if (changed) applied.push('paths for $sailor and sailorcms/*');
  }

  return { content: updated, applied, manual: false };
}

export async function ensureTsconfig(targetDir, { dryRun = false } = {}) {
  const file = path.join(targetDir, 'tsconfig.json');
  if (!(await fs.pathExists(file))) return { applied: [], manual: [] };
  const { content, applied, manual } = patchTsconfig(await fs.readFile(file, 'utf8'));
  if (manual) {
    return {
      applied: [],
      manual: [{ file: 'tsconfig.json', name: 'extends', hint: TSCONFIG_HINT }]
    };
  }
  if (applied.length > 0 && !dryRun) {
    await fs.writeFile(file, content);
    console.log(`✅ Updated tsconfig.json: ${applied.join(', ')}`);
  }
  return { applied, manual: [] };
}

// ─────────────────────────────────────────────────────────────────────────────
// App code
// ─────────────────────────────────────────────────────────────────────────────

// Hook types kit 3 moved from `@sveltejs/kit` to `@sveltejs/kit/hooks`.
const HOOK_TYPES = new Set([
  'Handle',
  'HandleServerError',
  'HandleClientError',
  'HandleFetch',
  'ServerInit',
  'ClientInit',
  'Reroute',
  'Transport',
  'Transporter',
  'ResolveOptions'
]);

/** Move hook type imports to `@sveltejs/kit/hooks`. Returns the new text. */
export function rewriteHookTypeImports(text) {
  return text.replace(
    /^import\s+(type\s+)?\{([^}]*)\}\s*from\s*(['"])@sveltejs\/kit\3;?[ \t]*$/gm,
    (stmt, typeOnly, specs, q) => {
      const keep = [];
      const hooks = [];
      for (const raw of specs.split(',')) {
        const spec = raw.trim();
        if (!spec) continue;
        const isType = Boolean(typeOnly) || spec.startsWith('type ');
        const bare = spec.replace(/^type\s+/, '');
        const name = bare.split(/\s+as\s+/)[0];
        if (isType && HOOK_TYPES.has(name)) hooks.push(bare);
        else keep.push(spec);
      }
      if (hooks.length === 0) return stmt;
      const lines = [];
      if (keep.length > 0) {
        lines.push(`import ${typeOnly ?? ''}{ ${keep.join(', ')} } from ${q}@sveltejs/kit${q};`);
      }
      lines.push(`import type { ${hooks.join(', ')} } from ${q}@sveltejs/kit/hooks${q};`);
      return lines.join('\n');
    }
  );
}

const rewriteEnvironment = (text) => text.replace(/(['"])\$app\/environment\1/g, '$1$app/env$1');

/**
 * `$env/static/*` re-exports `$app/env/*`, and `$env/dynamic/*` exports it as
 * one `env` namespace, so both rewrite exactly.
 */
export function rewriteEnvImports(text) {
  return text
    .replace(
      /import\s*\{\s*env(?:\s+as\s+([A-Za-z_$][\w$]*))?\s*\}\s*from\s*(['"])\$env\/dynamic\/(private|public)\2/g,
      (_m, local, q, scope) => `import * as ${local ?? 'env'} from ${q}$app/env/${scope}${q}`
    )
    .replace(
      /(import\s*\{[^}]*\}\s*from\s*)(['"])\$env\/static\/(private|public)\2/g,
      (_m, head, q, scope) => `${head}${q}$app/env/${scope}${q}`
    );
}

const SOURCE_EXTS = new Set(['.svelte', '.ts', '.js', '.mts', '.mjs']);

// Sailor-owned copies in the consumer tree; `core:update` rewrites them.
const SAILOR_OWNED = [
  path.join('lib', 'sailor'),
  path.join('lib', 'components', 'sailor'),
  path.join('lib', 'components', 'ui')
];

async function walk(dir, rel, onFile) {
  if (!(await fs.pathExists(dir))) return;
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const childRel = path.join(rel, entry.name);
    if (SAILOR_OWNED.includes(childRel)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, childRel, onFile);
    else if (SOURCE_EXTS.has(path.extname(entry.name))) await onFile(full);
  }
}

/** Variable names declared by sailor plus the consumer's `src/env.ts`. */
async function declaredEnvVars(targetDir) {
  const names = new Set();
  const sources = [
    path.join(__dirname, '..', 'src', 'lib', 'sailor', 'utils', 'env.ts'),
    path.join(targetDir, 'src', 'env.ts'),
    path.join(targetDir, 'src', 'env.js')
  ];
  for (const file of sources) {
    if (!(await fs.pathExists(file))) continue;
    const text = stripComments(await fs.readFile(file, 'utf8'));
    for (const m of text.matchAll(/\b([A-Z][A-Z0-9_]*)\s*:/g)) names.add(m[1]);
  }
  return names;
}

/** Env var names a file reads through `$env/*` or `$app/env/*`. */
function envVarsRead(text) {
  const names = new Set();
  const envImport =
    /\bimport\s+((?:(?!\bimport\b)[^;])*?)\s+from\s*['"](?:\$env\/(?:static|dynamic)|\$app\/env)\/(?:private|public)['"]/g;
  for (const m of text.matchAll(envImport)) {
    const clause = m[1];
    const ns = /\*\s+as\s+([A-Za-z_$][\w$]*)/.exec(clause)?.[1];
    const named = /\{([^}]*)\}/.exec(clause)?.[1] ?? '';
    for (const spec of named.split(',')) {
      const [imported, local] = spec.trim().split(/\s+as\s+/);
      if (!imported) continue;
      if (imported === 'env') {
        const obj = local ?? 'env';
        for (const r of text.matchAll(new RegExp(`\\b${obj}\\.([A-Z][A-Z0-9_]*)`, 'g'))) {
          names.add(r[1]);
        }
      } else if (/^[A-Z][A-Z0-9_]*$/.test(imported)) names.add(imported);
    }
    if (ns) {
      for (const r of text.matchAll(new RegExp(`\\b${ns}\\.([A-Z][A-Z0-9_]*)`, 'g')))
        names.add(r[1]);
    }
  }
  return names;
}

export const STORES_HINT =
  '`$app/stores` is removed in SvelteKit 3. Import `page`, `navigating` or `updated` from `$app/state` and read them without `$` (e.g. `$page.url` → `page.url`).';
export const LIB_HINT =
  '`$lib` is removed in SvelteKit 3. Use `#lib` subpath imports (add `"imports": { "#lib/*": "./src/lib/*" }` to package.json; TS imports need the explicit `.ts` extension), or keep `$lib` by adding `\'$lib\': \'src/lib\'` to `alias` in `sveltekit({...})`.';
export const UNDECLARED_ENV_HINT =
  'SvelteKit 3 only exposes env vars declared in src/env.ts; undeclared ones read as undefined at runtime. Add them to `defineEnvVars({...})` there (`public: true` for PUBLIC_ ones).';

/**
 * Find SvelteKit 2 leftovers in the consumer's own code (sailor-owned copies
 * are skipped). With `fix`, rewrites the mechanical ones: hook type imports,
 * `$app/environment` and `$env/*`. Everything else comes back as manual steps.
 */
export async function scanKit2Leftovers(targetDir, { fix = false } = {}) {
  const srcDir = path.join(targetDir, 'src');
  const fixable = [];
  const stores = [];
  const lib = [];
  const envRead = new Map();

  await walk(srcDir, '', async (full) => {
    const rel = path.relative(targetDir, full);
    const text = await fs.readFile(full, 'utf8');
    const code = stripComments(text);
    const rewritten = rewriteEnvImports(rewriteEnvironment(rewriteHookTypeImports(text)));
    if (rewritten !== text) {
      fixable.push(rel);
      if (fix) await fs.writeFile(full, rewritten);
    }
    if (/['"]\$app\/stores['"]/.test(code)) stores.push(rel);
    if (/['"]\$lib(?:\/|['"])/.test(code)) lib.push(rel);
    for (const name of envVarsRead(stripComments(rewritten))) {
      envRead.set(name, [...(envRead.get(name) ?? []), rel]);
    }
  });

  const declared = await declaredEnvVars(targetDir);
  const undeclared = [...envRead].filter(([name]) => !declared.has(name));

  const list = (files) =>
    files.length <= 5
      ? files.join(', ')
      : `${files.slice(0, 5).join(', ')} and ${files.length - 5} more`;
  const manual = [];
  if (fixable.length > 0 && !fix) {
    manual.push({
      name: 'moved SvelteKit imports',
      hint: `Hook types moved to \`@sveltejs/kit/hooks\`; \`$app/environment\` and \`$env/*\` are now \`$app/env\`: ${list(fixable)}`
    });
  }
  if (stores.length > 0)
    manual.push({ name: '$app/stores', hint: `${STORES_HINT} In: ${list(stores)}` });
  if (lib.length > 0) manual.push({ name: '$lib', hint: `${LIB_HINT} In: ${list(lib)}` });
  if (undeclared.length > 0) {
    manual.push({
      file: 'src/env.ts',
      name: 'undeclared env vars',
      hint: `${UNDECLARED_ENV_HINT} Missing: ${undeclared.map(([n, files]) => `${n} (${list(files)})`).join(', ')}`
    });
  }
  if (fix && fixable.length > 0) {
    console.log(
      `✅ Moved SvelteKit 2 imports (hook types, $app/environment, $env/*) in: ${list(fixable)}`
    );
  }
  return { fixed: fix ? fixable : [], fixable, manual };
}
