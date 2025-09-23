import { generateSchema } from '../utils.js';
import { execSync } from 'child_process';
import fs from 'fs-extra';
import path from 'path';

export function registerDbUpdate(program) {
  program
    .command('db:update')
    .description('Update local database schema from template changes')
    .action(async () => {
      try {
        const targetDir = process.cwd();

        // Check if we're in a SvelteKit project with Sailor CMS
        const packageJsonPath = path.join(targetDir, 'package.json');
        if (!(await fs.pathExists(packageJsonPath))) {
          console.error(
            '❌ No package.json found. Please run this command in a SvelteKit project.'
          );
          process.exit(1);
        }

        const sailorDir = path.join(targetDir, 'src', 'lib', 'sailor');
        if (!(await fs.pathExists(sailorDir))) {
          console.error('❌ Sailor CMS not found. Please run "npx sailor core:init" first.');
          process.exit(1);
        }

        console.log('🗄️ Updating database schema from templates...');

        // Use package.json script if available, fallback to direct execution
        const packageJson = await fs.readJson(packageJsonPath);

        if (packageJson.scripts && packageJson.scripts['db:update']) {
          execSync('npm run db:update', { cwd: targetDir, stdio: 'inherit' });
        } else {
          await generateSchema(targetDir);
          execSync('npx drizzle-kit generate --config=drizzle.config.ts', {
            cwd: targetDir,
            stdio: 'inherit'
          });
          execSync('npx drizzle-kit push --config=drizzle.config.ts', {
            cwd: targetDir,
            stdio: 'inherit'
          });

          // Update registry with new blocks/collections/globals
          console.log('🔄 Updating CMS registry...');
          execSync('bun run cli/tools/db-seed.js', {
            cwd: targetDir,
            stdio: 'inherit'
          });
        }

        console.log('✅ Database schema updated successfully!');
        console.log('💡 Restart your dev server to see the changes.');
      } catch (error) {
        console.error('❌ Error updating database schema:', error.message);
        process.exit(1);
      }
    });
}
