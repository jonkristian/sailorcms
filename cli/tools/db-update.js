// Database update tool
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
          const script = packageJson.scripts['db:update'];
          const isOutdated = script.includes('cli/tools') || script.includes('src/lib/sailor');
          if (!isOutdated) {
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

            const path = (await import('path')).default;
            const { existsSync } = await import('fs');
            const pkgSeeder = path.join(
              targetDir,
              'node_modules',
              'sailorcms',
              'cli',
              'tools',
              'db-seed.js'
            );
            const localSeeder = path.join(
              path.dirname(new URL(import.meta.url).pathname),
              'db-seed.js'
            );
            const seederPath = existsSync(pkgSeeder) ? pkgSeeder : localSeeder;

            // Check if we have TypeScript templates (development project)
            const hasTypeScriptTemplates = existsSync(
              path.join(targetDir, 'src', 'lib', 'sailor', 'templates', 'blocks', 'index.ts')
            );
            const executor = hasTypeScriptTemplates ? 'npx tsx' : 'node';

            execSync(`${executor} ${seederPath}`, { cwd: targetDir, stdio: 'inherit' });
          }
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
          const path2 = (await import('path')).default;
          const { existsSync: existsSync2 } = await import('fs');
          const pkgSeeder2 = path2.join(
            targetDir,
            'node_modules',
            'sailorcms',
            'cli',
            'tools',
            'db-seed.js'
          );
          const localSeeder2 = path2.join(
            path2.dirname(new URL(import.meta.url).pathname),
            'db-seed.js'
          );
          const seederPath2 = existsSync2(pkgSeeder2) ? pkgSeeder2 : localSeeder2;

          // Check if we have TypeScript templates (development project)
          const hasTypeScriptTemplates2 = existsSync2(
            path2.join(targetDir, 'src', 'lib', 'sailor', 'templates', 'blocks', 'index.ts')
          );
          const executor2 = hasTypeScriptTemplates2 ? 'npx tsx' : 'node';

          execSync(`${executor2} ${seederPath2}`, { cwd: targetDir, stdio: 'inherit' });
        }

        console.log('✅ Generated files and CMS registry refreshed successfully!');
      } catch (error) {
        console.error('❌ Error updating database schema:', error.message);
        process.exit(1);
      }
    });
}
