import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    tailwindcss(),
    // Sailor admin i18n: compiles `src/lib/sailor/i18n/messages/{locale}.json`
    // into a tree-shakable runtime under `src/lib/sailor/i18n/paraglide/`.
    // The admin reads from this; consumer-site i18n is intentionally out of
    // scope and consumers can add their own Paraglide instance with a
    // separate `project` and `outdir` — the two coexist.
    paraglideVitePlugin({
      project: './src/lib/sailor/project.inlang',
      outdir: './src/lib/sailor/i18n/paraglide'
    }),
    sveltekit()
  ],
  server: {
    watch: {
      ignored: ['**/static/uploads/**']
    }
  }
});
