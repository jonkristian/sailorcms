// `sailorcms/vite`: everything Sailor needs from a consumer's Vite config, so
// vite.config.ts only has to list `sailor()` before `sveltekit({...})`.
import fs from 'node:fs';
import path from 'node:path';

/**
 * Package subpaths imported as `sailorcms/<subpath>/...`, and where they live
 * inside the package. Mirrors the `exports` map, but the map can't add file
 * extensions, and sailor's own imports leave them off.
 */
export const SAILOR_SUBPATHS = [
  ['components/sailor', 'src/lib/components/sailor'],
  ['components/ui', 'src/lib/components/ui'],
  ['composables', 'src/lib/sailor/composables'],
  ['core', 'src/lib/sailor/core'],
  ['remote', 'src/lib/sailor/remote'],
  ['scripts', 'src/lib/sailor/scripts'],
  ['assets', 'src/lib/sailor/assets'],
  ['utils', 'src/lib/sailor/utils'],
  ['styles', 'src/lib/sailor/styles']
];

/** @param {string} root */
function isSailorItself(root) {
  try {
    return (
      JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).name === 'sailorcms'
    );
  } catch {
    return false;
  }
}

/**
 * tw-animate-css only exports its CSS under the `style` condition, which
 * Vite 8's SSR build ignores when resolving it from sailor.css. Point the
 * bare import at the file so no resolver needs the exports map.
 * @param {string[]} dirs
 */
function twAnimateAlias(dirs) {
  for (const dir of dirs) {
    const file = path.join(dir, 'node_modules', 'tw-animate-css', 'dist', 'tw-animate.css');
    if (fs.existsSync(file)) return [{ find: /^tw-animate-css$/, replacement: file }];
  }
  return [];
}

/**
 * @returns {import('vite').PluginOption[]}
 */
export function sailor() {
  return [
    // Admin i18n: compiles src/lib/sailor/i18n/messages into the runtime the
    // admin imports. A consumer's own Paraglide instance (separate project
    // and outdir) can sit next to it.
    // Loaded lazily so the CLI can import this module before dependencies
    // are installed (Vite accepts a promised plugin).
    import('@inlang/paraglide-js').then(({ paraglideVitePlugin }) =>
      paraglideVitePlugin({
        project: './src/lib/sailor/project.inlang',
        outdir: './src/lib/sailor/i18n/paraglide',
        outputStructure: 'message-modules'
      })
    ),
    {
      name: 'sailorcms',
      /** @param {import('vite').UserConfig} config */
      config(config) {
        const root = path.resolve(config.root ?? process.cwd());
        const self = isSailorItself(root);
        const pkg = self ? root : path.join(root, 'node_modules', 'sailorcms');

        // `$sailor` is always the app's own src/lib/sailor: generated schema,
        // templates and i18n are per-project, and sailor's package code
        // imports them through this alias.
        const alias = [
          { find: '$sailor', replacement: path.join(root, 'src/lib/sailor') },
          ...twAnimateAlias([root, pkg]),
          ...SAILOR_SUBPATHS.map(([sub, dir]) => ({
            find: `sailorcms/${sub}`,
            replacement: path.join(pkg, dir)
          }))
        ];
        if (self) return { resolve: { alias } };

        return {
          resolve: {
            alias,
            // One kit and svelte instance for app and sailor code, or a
            // `redirect()` thrown in sailor's hooks fails kit's instanceof
            // check and 500s instead of redirecting.
            dedupe: ['@sveltejs/kit', 'svelte']
          },
          // Sailor ships source, so SSR must transform it (aliases, .svelte.ts).
          ssr: { noExternal: ['sailorcms'] },
          optimizeDeps: {
            // esbuild prebundling knows neither the aliases nor rune files.
            exclude: ['sailorcms'],
            // ESM entry points and CJS-only transitives that excluding
            // sailorcms would otherwise leave unbundled.
            include: ['highlight.js/lib/core', 'highlight.js/lib/languages/json', 'style-to-object']
          }
        };
      }
    }
  ];
}
