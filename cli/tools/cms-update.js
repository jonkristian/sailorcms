// Core CMS update tool
import { execSync } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  detectPackageManager,
  getInstallCommand,
  updateSailorCoreFiles,
  cleanupUnusedDependencies,
  trackInstalledDependencies,
  updateSvelteConfig,
  updateViteConfig,
  stripLegacyDbScripts,
  printManualActionBanner,
  dedupeNestedSvelteDeps,
  dedupeNestedSailorcmsDeps,
  isCorePackage
} from '../utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function registerCoreUpdate(program) {
  program
    .command('core:update')
    .description('Update Sailor CMS core files (lib, routes, hooks) to the latest version')
    .option('--skip-deps', 'Skip updating dependencies')
    .action(async (options) => {
      try {
        const targetDir = process.cwd();

        // Check if we're in a SvelteKit project
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

        if (await isCorePackage(targetDir)) {
          console.error(
            '❌ Detected sailorcms package source — `core:update` is for consumer installs only.'
          );
          console.error(
            '   This command pulls core files from the package into a consumer; running it here would overwrite the upstream source with itself.'
          );
          process.exit(1);
        }

        // Update dependencies if not skipped
        if (!options.skipDeps) {
          // Read old tracking file before updating to compare later
          const trackingFile = path.join(targetDir, '.sailor-deps.json');
          let oldCmsDeps = new Set();
          if (await fs.pathExists(trackingFile)) {
            const oldTracking = await fs.readJson(trackingFile);
            const oldDeps = Object.keys(oldTracking.dependencies || {});
            const oldDevDeps = Object.keys(oldTracking.devDependencies || {});
            oldCmsDeps = new Set([...oldDeps, ...oldDevDeps]);
          }

          // Read dependencies from the main project
          const mainProjectDir = path.join(__dirname, '..', '..');
          const mainPackageJsonPath = path.join(mainProjectDir, 'package.json');
          const mainPackageJson = await fs.readJson(mainPackageJsonPath);

          // Separate CMS dependencies properly
          const cmsRuntimeDeps = Object.entries(mainPackageJson.dependencies || {});
          const cmsDevDeps = Object.entries(mainPackageJson.devDependencies || {});

          // Define which dependencies should be dev dependencies in target projects
          const devOnlyPackages = [
            'drizzle-kit',
            '@types/node',
            '@types/sharp',
            '@types/xmldom',
            'eslint',
            'prettier',
            'svelte-check',
            'typescript',
            'typescript-eslint',
            '@eslint/compat',
            '@eslint/js',
            'eslint-config-prettier',
            'eslint-plugin-svelte',
            'globals',
            'prettier-plugin-svelte',
            'prettier-plugin-tailwindcss'
          ];

          // Update dependencies in package.json
          if (!packageJson.dependencies) packageJson.dependencies = {};
          if (!packageJson.devDependencies) packageJson.devDependencies = {};

          // Update runtime dependencies
          cmsRuntimeDeps.forEach(([packageName, version]) => {
            const shouldBeDev = devOnlyPackages.includes(packageName);

            if (shouldBeDev) {
              // Move to devDependencies if currently in dependencies
              if (packageJson.dependencies[packageName]) {
                delete packageJson.dependencies[packageName];
              }
              packageJson.devDependencies[packageName] = version;
            } else {
              // Update existing dependencies or add new ones
              if (packageJson.dependencies[packageName]) {
                packageJson.dependencies[packageName] = version;
              } else if (packageJson.devDependencies[packageName]) {
                // Move from dev to regular dependencies if needed
                delete packageJson.devDependencies[packageName];
                packageJson.dependencies[packageName] = version;
              } else {
                // Add new dependency
                packageJson.dependencies[packageName] = version;
              }
            }
          });

          // Update dev dependencies. If the consumer has the package in
          // regular `dependencies`, keep its placement and just bump the
          // version there — otherwise write to `devDependencies`. (Without
          // this, packages sailor lists as devDeps that consumers happen to
          // have under `dependencies` — bits-ui is the canonical case —
          // never get version-bumped on update.) Dedupe in both branches: if
          // a prior buggy init left a package in BOTH sections, this
          // collapses it to one. The cmsRuntimeDeps loop above already
          // dedupes via its move-from-dev branch.
          cmsDevDeps.forEach(([packageName, version]) => {
            if (packageJson.dependencies[packageName]) {
              packageJson.dependencies[packageName] = version;
              delete packageJson.devDependencies[packageName];
            } else {
              packageJson.devDependencies[packageName] = version;
              delete packageJson.dependencies[packageName];
            }
          });

          await fs.writeJson(packageJsonPath, packageJson, { spaces: 2 });

          const removedLegacyScripts = await stripLegacyDbScripts(targetDir);
          if (removedLegacyScripts.length > 0) {
            console.log(
              `🧹 Removed legacy package.json script(s): ${removedLegacyScripts.join(', ')}`
            );
          }

          // Detect and use appropriate package manager
          const packageManager = await detectPackageManager(targetDir);
          const installCommand = getInstallCommand(packageManager);

          // Clean up unused dependencies first
          await cleanupUnusedDependencies(targetDir);

          console.log(`📦 Installing dependencies with ${packageManager}...`);
          try {
            execSync(installCommand, { cwd: targetDir, stdio: 'pipe' });
            console.log('✅ Dependencies updated');
          } catch (error) {
            if (error.message.includes('ERESOLVE') && packageManager === 'npm') {
              console.log('⚠️  Peer dependency conflicts detected, retrying with --force...');
              execSync(`npm install --force`, { cwd: targetDir, stdio: 'pipe' });
              console.log('✅ Dependencies updated (with --force)');
            } else {
              throw error;
            }
          }

          // Bun's `file:` install nests a duplicate acorn under
          // node_modules/svelte/node_modules and the entire sailor devDeps
          // tree under node_modules/sailorcms/node_modules — strip both
          // before anything else touches node_modules. See the dedupe
          // function docstrings for the full story.
          if (packageManager === 'bun') {
            await dedupeNestedSvelteDeps(targetDir);
            await dedupeNestedSailorcmsDeps(targetDir);
          }

          // Compare old vs new CMS dependencies to show what's no longer needed
          if (oldCmsDeps.size > 0) {
            const newCmsRuntimeDeps = Object.keys(mainPackageJson.dependencies || {});
            const newCmsDevDeps = Object.keys(mainPackageJson.devDependencies || {});
            const newCmsDeps = new Set([...newCmsRuntimeDeps, ...newCmsDevDeps]);

            const noLongerNeededByCms = Array.from(oldCmsDeps).filter(
              (dep) => !newCmsDeps.has(dep) && dep !== 'sailorcms' // Keep sailorcms as version reference
            );

            if (noLongerNeededByCms.length > 0) {
              console.log('\nℹ️  The following packages are no longer required by Sailor CMS:');
              noLongerNeededByCms.forEach((dep) => console.log(`   • ${dep}`));
              console.log('\n   Note: These may still be used elsewhere in your project.');
            }
          }

          // Update the tracking file with the current CMS dependencies
          await trackInstalledDependencies(targetDir);
        }

        // Update Sailor CMS core files (lib, routes, hooks)
        console.log('📁 Updating core files...');
        await updateSailorCoreFiles(targetDir);

        // Update config files
        const manual = [];
        const svelteResult = await updateSvelteConfig(targetDir);
        if (svelteResult?.manual) manual.push(...svelteResult.manual);
        const viteResult = await updateViteConfig(targetDir);
        if (viteResult?.manual) manual.push(...viteResult.manual);

        console.log('✅ Sailor CMS updated successfully!');
        printManualActionBanner(manual);
      } catch (error) {
        console.error('❌ Error updating Sailor CMS:', error.message);
        process.exit(1);
      }
    });
}
