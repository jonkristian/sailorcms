import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const config = {
  preprocess: vitePreprocess({ script: true }),
  kit: {
    adapter: adapter(),
    alias: {
      $sailor: 'src/lib/sailor',
      'sailorcms/components/sailor/*': 'src/lib/components/sailor/*',
      'sailorcms/components/ui/*': 'src/lib/components/ui/*',
      'sailorcms/composables/*': 'src/lib/sailor/composables/*',
      'sailorcms/core/*': 'src/lib/sailor/core/*',
      'sailorcms/remote/*': 'src/lib/sailor/remote/*',
      'sailorcms/scripts/*': 'src/lib/sailor/scripts/*',
      'sailorcms/assets/*': 'src/lib/sailor/assets/*',
      'sailorcms/utils/*': 'src/lib/sailor/utils/*',
      'sailorcms/styles/*': 'src/lib/sailor/styles/*'
    },
    experimental: {
      remoteFunctions: true
    }
  },
  compilerOptions: {
    runes: true,
    experimental: {
      async: true
    }
  }
};

export default config;
