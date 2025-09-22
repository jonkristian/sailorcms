#!/usr/bin/env node

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
// __dirname not currently used but may be needed for future functionality

export function registerFilesRepair(program) {
  program
    .command('files:repair')
    .description('Fix file URLs for S3/cloud storage compatibility')
    .option('--dry-run', 'Preview changes without applying them')
    .option('--provider <provider>', 'Force specific provider (local|s3|auto)', 'auto')
    .action(async (options) => {
      try {
        // Check if we're in a SvelteKit project
        if (!existsSync('package.json')) {
          console.error('❌ Error: This command must be run from the root of a SvelteKit project');
          process.exit(1);
        }

        // Check if Sailor is installed
        const packageJsonPath = path.resolve('package.json');
        const packageJson = JSON.parse(
          await import('fs').then((fs) => fs.readFileSync(packageJsonPath, 'utf8'))
        );

        const hasSailor =
          packageJson.dependencies?.['sailorcms'] ||
          packageJson.devDependencies?.['sailorcms'] ||
          existsSync('src/lib/sailor');

        if (!hasSailor) {
          console.error('❌ Error: Sailor CMS not found. Run "npx sailor core:init" first.');
          process.exit(1);
        }

        // Check if the repair script exists in the project
        const scriptPath = 'src/lib/sailor/scripts/repair-file-urls.ts';
        if (!existsSync(scriptPath)) {
          console.error(
            '❌ Error: File repair script not found. This may be an older version of Sailor CMS.'
          );
          console.error('   Try running "npx sailor core:update" to get the latest files.');
          process.exit(1);
        }

        console.log('🔧 Running file URL repair...');
        console.log('');

        // Build command args for direct script execution (like other CLI commands)
        let args = [scriptPath];
        if (options.dryRun) {
          args.push('--dry-run');
        }
        if (options.provider !== 'auto') {
          args.push(`--provider=${options.provider}`);
        }

        // Execute using bun run (like other CLI commands do)
        try {
          execSync(`bun run ${args.join(' ')}`, {
            stdio: 'inherit',
            cwd: process.cwd(),
            env: { ...process.env }
          });
        } catch (error) {
          console.error('Command failed:', error.message);
          throw error;
        }
      } catch (error) {
        console.error('❌ File repair failed:', error.message);
        process.exit(1);
      }
    });

  // Add dry-run alias
  program
    .command('files:repair:dry-run')
    .description('Preview file URL repairs without applying changes')
    .option('--provider <provider>', 'Force specific provider (local|s3|auto)', 'auto')
    .action(async (options) => {
      try {
        // Check if we're in a SvelteKit project
        if (!existsSync('package.json')) {
          console.error('❌ Error: This command must be run from the root of a SvelteKit project');
          process.exit(1);
        }

        // Check if Sailor is installed
        const packageJsonPath = path.resolve('package.json');
        const packageJson = JSON.parse(
          await import('fs').then((fs) => fs.readFileSync(packageJsonPath, 'utf8'))
        );

        const hasSailor =
          packageJson.dependencies?.['sailorcms'] ||
          packageJson.devDependencies?.['sailorcms'] ||
          existsSync('src/lib/sailor');

        if (!hasSailor) {
          console.error('❌ Error: Sailor CMS not found. Run "npx sailor core:init" first.');
          process.exit(1);
        }

        // Check if the repair script exists in the project
        const scriptPath = 'src/lib/sailor/scripts/repair-file-urls.ts';
        if (!existsSync(scriptPath)) {
          console.error(
            '❌ Error: File repair script not found. This may be an older version of Sailor CMS.'
          );
          console.error('   Try running "npx sailor core:update" to get the latest files.');
          process.exit(1);
        }

        console.log('🔧 Running file URL repair (dry run)...');
        console.log('');

        // Build command args for direct script execution (like other CLI commands)
        let args = [scriptPath, '--dry-run'];
        if (options.provider !== 'auto') {
          args.push(`--provider=${options.provider}`);
        }

        // Execute using bun run (like other CLI commands do)
        try {
          execSync(`bun run ${args.join(' ')}`, {
            stdio: 'inherit',
            cwd: process.cwd(),
            env: { ...process.env }
          });
        } catch (error) {
          console.error('Command failed:', error.message);
          throw error;
        }
      } catch (error) {
        console.error('❌ File repair failed:', error.message);
        process.exit(1);
      }
    });
}
