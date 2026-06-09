import prettier from 'eslint-config-prettier';
import js from '@eslint/js';
import { includeIgnoreFile } from '@eslint/compat';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import { fileURLToPath } from 'node:url';
import ts from 'typescript-eslint';
import svelteConfig from './svelte.config.js';

const gitignorePath = fileURLToPath(new URL('./.gitignore', import.meta.url));

export default ts.config(
  includeIgnoreFile(gitignorePath),
  {
    ignores: [
      'src/lib/components/ui/**/*', // Ignore shadcn-svelte UI components
      'src/lib/sailor/generated/**/*', // Ignore generated schema files
      'cli/**/*', // CLI tools are separate Node.js utilities
      'docs/**/*', // Documentation files
      'drizzle/**/*' // Database migration files
    ]
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs.recommended,
  prettier,
  ...svelte.configs.prettier,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node }
    },
    rules: { 'no-undef': 'off' }
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        extraFileExtensions: ['.svelte'],
        parser: ts.parser,
        svelteConfig
      }
    }
  },
  // Public-site components must not read `$sailor/generated/*` at runtime.
  // In sibling-link dev (e.g. `bun link sailorcms` from a consumer), the
  // alias inside sailor-shipped files resolves to *sailor's* workspace
  // instead of the consumer's — so the component would read sailor's own
  // generated settings, not the consumer's. The split-brain bug fixed in
  // 0.8.1 (`<LanguageSwitcher>` reading generated/settings instead of
  // accepting them as props) is exactly this class. Take values as props
  // from a parent that lives in the consumer's workspace context.
  //
  // Admin components are exempt — they only ever render in consumer
  // context (sailor's admin UI never gets sibling-linked into another app).
  {
    files: ['src/lib/components/sailor/site/**/*.svelte', 'src/lib/components/sailor/site/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['$sailor/generated/*', 'sailorcms/generated/*'],
              message:
                'Public-site components must not read $sailor/generated/* — in sibling-link dev the alias resolves to sailor’s workspace, not the consumer’s. Take values as props from a parent that lives in the consumer’s workspace.'
            }
          ]
        }
      ]
    }
  }
);
