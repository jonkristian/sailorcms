// Database update tool
import {
  generateSchema,
  ensureDbDir,
  ensureDrizzleScaffold,
  runMigrations,
  stripLegacyDbScripts
} from '../utils.js';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import fs from 'fs-extra';
import path from 'path';

export function registerDbUpdate(program) {
  program
    .command('db:update')
    .description('Update local database schema from template changes')
    .action(async () => {
      try {
        const targetDir = process.cwd();

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

        const removedLegacyScripts = await stripLegacyDbScripts(targetDir);
        if (removedLegacyScripts.length > 0) {
          console.log(
            `🧹 Removed legacy package.json script(s): ${removedLegacyScripts.join(', ')}`
          );
        }

        // Ensure the local SQLite parent directory exists before handing off
        // to drizzle-kit. No-op for remote Turso / Postgres.
        await ensureDbDir(targetDir);

        // Self-heal drizzle.config.ts and drizzle/meta/_journal.json if the
        // user wiped `drizzle/` (and the config) for a clean rebuild. Both
        // files are recoverable from the package source, so there's no
        // reason to bounce them back to `core:init`.
        const restored = await ensureDrizzleScaffold(targetDir);
        if (restored.length > 0) {
          console.log(`🧰 Restored missing scaffold: ${restored.join(', ')}`);
        }

        await generateSchema(targetDir);
        execSync('npx drizzle-kit generate --config=drizzle.config.ts', {
          cwd: targetDir,
          stdio: 'inherit'
        });
        await runMigrations(targetDir);

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

        const hasTypeScriptTemplates = existsSync(
          path.join(targetDir, 'src', 'lib', 'sailor', 'templates', 'blocks', 'index.ts')
        );
        const executor = hasTypeScriptTemplates ? 'npx tsx' : 'node';

        execSync(`${executor} ${seederPath}`, { cwd: targetDir, stdio: 'inherit' });

        console.log('✅ Generated files and CMS registry refreshed successfully!');
      } catch (error) {
        console.error('❌ Error updating database schema:', error.message);
        process.exit(1);
      }
    });
}
