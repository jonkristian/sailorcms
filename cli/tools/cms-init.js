// Core CMS initialization tool
import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import {
  detectPackageManager,
  getInstallCommand,
  setupSailorFiles,
  trackInstalledDependencies,
  printManualActionBanner,
  dedupeNestedSvelteDeps,
  dedupeNestedSailorcmsDeps,
  isCorePackage
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

        if (await isCorePackage(targetDir)) {
          console.error(
            '❌ Detected sailorcms package source — `core:init` is for consumer installs only.'
          );
          console.error(
            '   This command writes templates/config into a consumer project; running it here would overwrite the upstream source.'
          );
          process.exit(1);
        }

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

            // Skip dev tools the consumer already has from `sv create` (eslint,
            // prettier, typescript, svelte-check, types, vite — except
            // @tailwindcss/vite which sailor needs).
            const skipPattern = (name) =>
              name.includes('eslint') ||
              name.includes('prettier') ||
              name.includes('typescript') ||
              name.includes('svelte-check') ||
              name.includes('@sveltejs/') ||
              name.includes('@types/') ||
              (name !== '@tailwindcss/vite' && name.includes('vite'));

            // Mirror sailor's classification: runtime deps go to consumer's
            // `dependencies`, devDeps go to consumer's `devDependencies`. (The
            // pre-fix code merged them and put everything in `dependencies`,
            // wrongly placing things like tailwindcss/tslib/terser/drizzle-kit
            // in runtime deps.)
            const cmsDeps = Object.entries(mainPackageJson.dependencies || {}).filter(
              ([name]) => !skipPattern(name)
            );
            const cmsDevDeps = Object.entries(mainPackageJson.devDependencies || {}).filter(
              ([name]) => !skipPattern(name)
            );

            // Check existing dependencies
            const existingDeps = Object.keys(packageJson.dependencies || {});
            const existingDevDeps = Object.keys(packageJson.devDependencies || {});

            // Find missing dependencies
            const missingDeps = cmsDeps.filter(([dep, _version]) => {
              return !existingDeps.includes(dep) && !existingDevDeps.includes(dep);
            });

            const missingDevDeps = cmsDevDeps.filter(([dep, _version]) => {
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
                delete packageJson.devDependencies[packageName]; // dedupe defensively
              });

              missingDevDeps.forEach(([packageName, version]) => {
                packageJson.devDependencies[packageName] = version;
                delete packageJson.dependencies[packageName]; // dedupe defensively
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

              // Bun's `file:` install nests a duplicate acorn under
              // node_modules/svelte/node_modules and the entire sailor
              // devDeps tree under node_modules/sailorcms/node_modules —
              // strip both. See the dedupe function docstrings for the
              // full story.
              if (packageManager === 'bun') {
                await dedupeNestedSvelteDeps(targetDir);
                await dedupeNestedSailorcmsDeps(targetDir);
              }

              // Track installed dependencies for future cleanup
              await trackInstalledDependencies(targetDir);
            } else {
              console.log('✅ All required dependencies already installed');
            }
          }

          // Copy templates and configuration files
          console.log('🚢 Setting up Sailor CMS files...');
          const setupResult = await setupSailorFiles(targetDir, options.force);
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
backup/
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

          // Scaffold a nixpacks.toml so Coolify/Railway/Render builds have the
          // `sqlite3` binary `db:backup` needs (file-copy fallback is less
          // reliable). Harmless on non-nixpacks hosts (Vercel/Netlify/etc.
          // ignore the file). Only write when absent so consumers who've
          // customized aren't clobbered.
          const nixpacksPath = path.join(targetDir, 'nixpacks.toml');
          if (!(await fs.pathExists(nixpacksPath))) {
            await fs.writeFile(
              nixpacksPath,
              `# Nixpacks build config — ensures the sqlite3 binary is available\n` +
                `# in the runtime image so \`db:backup\` and similar tools work on\n` +
                `# Coolify / Railway / Render. Safe to delete if not deploying via\n` +
                `# nixpacks (Vercel / Netlify / plain Node hosts ignore this file).\n` +
                `[phases.setup]\n` +
                `nixPkgs = ['...', 'sqlite']\n`
            );
            console.log('✅ Scaffolded nixpacks.toml (sqlite available for db:backup)');
          } else {
            console.log('ℹ️  nixpacks.toml already exists, leaving alone');
          }

          console.log('\n🎉 Sailor CMS files installed successfully!');
          console.log('\n🚀 Next steps:');
          console.log(
            '1. Review .env (DATABASE_URL defaults to file:./sailor.sqlite — change for Turso/Postgres) and merge any extras from .env.sailor'
          );
          console.log('2. Set up database: npx sailor db:update');
          console.log('3. Start development: npm run dev');
          console.log('4. Visit: http://localhost:5173/sailor');
          printManualActionBanner(setupResult?.manual);
        }
      } catch (error) {
        console.error('❌ Error initializing Sailor CMS:', error.message);
        process.exit(1);
      }
    });
}
