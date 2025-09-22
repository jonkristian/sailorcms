import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import {
  detectPackageManager,
  getInstallCommand,
  setupSailorFiles,
  trackInstalledDependencies
} from '../utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function registerCoreInit(program) {
  program
    .command('core:init')
    .description('Initialize Sailor CMS in a SvelteKit project')
    .option('-d, --dir <directory>', 'Target directory (default: current directory)')
    .option('--skip-deps', 'Skip installing dependencies')
    .option('--force', 'Force overwrite existing files (use with caution)')
    .action(async (options) => {
      try {
        console.log('🚢 Initializing Sailor CMS...\n');
        const targetDir = options.dir || process.cwd();
        // Check if we're in a SvelteKit project
        console.log('🔍 Validating SvelteKit project...');
        const packageJsonPath = path.join(targetDir, 'package.json');
        if (!(await fs.pathExists(packageJsonPath))) {
          console.error(
            '❌ No package.json found. Please run this command in a SvelteKit project.'
          );
          process.exit(1);
        }

        const packageJson = await fs.readJson(packageJsonPath);
        const hasSvelteKit =
          packageJson.dependencies?.['@sveltejs/kit'] ||
          packageJson.devDependencies?.['@sveltejs/kit'];
        if (!hasSvelteKit) {
          console.error(
            "❌ This doesn't appear to be a SvelteKit project. Please run this command in a SvelteKit project."
          );
          process.exit(1);
        }
        console.log('✅ SvelteKit project detected\n');

        // Check if templates already exist
        const sailorTemplatesDir = path.join(targetDir, 'src', 'lib', 'sailor', 'templates');
        if ((await fs.pathExists(sailorTemplatesDir)) && !options.force) {
          console.log('⚠️ Sailor CMS templates already exist. Skipping template installation.');
          console.log('Use "sailor core:update" to update core files without touching templates.');
          console.log('Use "--force" to overwrite existing installation.');
        } else {
          // Install dependencies if not skipped
          if (!options.skipDeps) {
            // Read dependencies from the main project
            const mainProjectDir = path.join(__dirname, '..', '..');
            const mainPackageJsonPath = path.join(mainProjectDir, 'package.json');
            const mainPackageJson = await fs.readJson(mainPackageJsonPath);

            // Get all dependencies from main project
            const allDeps = {
              ...mainPackageJson.dependencies,
              ...mainPackageJson.devDependencies
            };

            // Filter to only include dependencies that are actually used by the CMS
            const cmsDeps = Object.entries(allDeps).filter(([name, _version]) => {
              // Exclude dev tools and SvelteKit core dependencies
              return (
                !name.includes('eslint') &&
                !name.includes('prettier') &&
                !name.includes('typescript') &&
                !name.includes('svelte-check') &&
                !name.includes('@sveltejs/') &&
                !name.includes('@types/') &&
                // Allow @tailwindcss/vite but exclude other vite packages
                (name === '@tailwindcss/vite' || !name.includes('vite'))
              );
            });

            // Separate dev dependencies
            const devDeps = [
              ['drizzle-kit', mainPackageJson.devDependencies?.['drizzle-kit'] || 'latest']
            ];

            // Check existing dependencies
            const existingDeps = Object.keys(packageJson.dependencies || {});
            const existingDevDeps = Object.keys(packageJson.devDependencies || {});

            // Find missing dependencies
            const missingDeps = cmsDeps.filter(([dep, _version]) => {
              return !existingDeps.includes(dep) && !existingDevDeps.includes(dep);
            });

            const missingDevDeps = devDeps.filter(([dep, _version]) => {
              return !existingDeps.includes(dep) && !existingDevDeps.includes(dep);
            });

            if (missingDeps.length > 0 || missingDevDeps.length > 0) {
              console.log(
                `📋 Found ${missingDeps.length} production and ${missingDevDeps.length} development dependencies to install\n`
              );

              // Add dependencies to package.json
              if (!packageJson.dependencies) packageJson.dependencies = {};
              if (!packageJson.devDependencies) packageJson.devDependencies = {};

              missingDeps.forEach(([packageName, version]) => {
                packageJson.dependencies[packageName] = version;
              });

              missingDevDeps.forEach(([packageName, version]) => {
                packageJson.devDependencies[packageName] = version;
              });

              // Add database scripts if they don't exist
              if (!packageJson.scripts) packageJson.scripts = {};

              const dbScripts = {
                'db:generate':
                  'bun run src/lib/sailor/core/tools/generate-schema.ts && drizzle-kit generate',
                'db:push': 'drizzle-kit push',
                'db:update':
                  'npm run db:generate && npm run db:push && bun run src/lib/sailor/core/tools/core-seed.ts'
              };

              Object.entries(dbScripts).forEach(([script, command]) => {
                if (!packageJson.scripts[script]) {
                  packageJson.scripts[script] = command;
                }
              });

              await fs.writeJson(packageJsonPath, packageJson, { spaces: 2 });

              // Detect and use appropriate package manager
              const packageManager = await detectPackageManager(targetDir);
              const installCommand = getInstallCommand(packageManager);

              console.log(
                `📦 Installing ${missingDeps.length + missingDevDeps.length} dependencies with ${packageManager}...`
              );

              try {
                execSync(installCommand, { cwd: targetDir, stdio: 'inherit' });
                console.log('✅ Dependencies installed');
              } catch (error) {
                console.error('❌ Failed to install dependencies:', error.message);
                throw error;
              }

              // Track installed dependencies for future cleanup
              await trackInstalledDependencies(targetDir);
            } else {
              console.log('✅ All required dependencies already installed');
            }
          }

          // Copy templates and configuration files
          console.log('🚢 Setting up Sailor CMS files...');
          await setupSailorFiles(targetDir, options.force);
          console.log('✅ Files copied successfully');

          // Add Sailor CMS patterns to .gitignore
          const gitignorePath = path.join(targetDir, '.gitignore');
          let gitignoreContent = '';

          if (await fs.pathExists(gitignorePath)) {
            gitignoreContent = await fs.readFile(gitignorePath, 'utf-8');
          }

          const sailorSection = `
# Sailor CMS
static/cache/
static/uploads/
backups/
*.sqlite
*.sqlite-wal
*.sqlite-shm`;

          // Check if Sailor section already exists
          if (!gitignoreContent.includes('# Sailor CMS')) {
            // Add Sailor section at the end
            gitignoreContent += gitignoreContent.endsWith('\n') ? '' : '\n';
            gitignoreContent += sailorSection + '\n';

            await fs.writeFile(gitignorePath, gitignoreContent);
            console.log('✅ Added Sailor CMS patterns to .gitignore');
          } else {
            console.log('ℹ️  Sailor CMS patterns already in .gitignore');
          }

          console.log('\n🎉 Sailor CMS files installed successfully!');
          console.log('\n🚀 Next steps:');
          console.log('1. Set up database: npx sailor db:update');
          console.log('3. Start development: npm run dev');
          console.log('4. Visit: http://localhost:5173/sailor');
        }
      } catch (error) {
        console.error('❌ Error initializing Sailor CMS:', error.message);
        process.exit(1);
      }
    });
}
