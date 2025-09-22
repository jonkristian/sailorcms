import adapter from '@sveltejs/adapter-auto';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),
    alias: {
      $sailor: 'src/lib/sailor'
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
