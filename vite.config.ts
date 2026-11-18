import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { sailor } from './vite-plugin.js';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    tailwindcss(),
    sailor(),
    sveltekit({
      adapter: adapter(),
      preprocess: vitePreprocess({ script: true }),
      experimental: {
        remoteFunctions: true
      },
      compilerOptions: {
        runes: true,
        experimental: {
          async: true
        }
      }
    })
  ],
  server: {
    watch: {
      ignored: ['**/static/uploads/**']
    }
  }
});
