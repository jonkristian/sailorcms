import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const config = {
  preprocess: vitePreprocess({ script: true }),
  kit: {
    adapter: adapter(),
    alias: {
      $sailor: 'src/lib/sailor',
      'sailorcms/components/sailor/*': 'src/lib/components/sailor/*',
      'sailorcms/core/*': 'src/lib/sailor/core/*',
      'sailorcms/remote/*': 'src/lib/sailor/remote/*',
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
