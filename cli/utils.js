import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function setupSailorFiles(targetDir, force = false) {
  const mainProjectDir = path.join(__dirname, '..');
  const targetSrcDir = path.join(targetDir, 'src');
  await fs.ensureDir(targetSrcDir);

  // Copy app files - handle app.css carefully to preserve user customizations
  const alwaysSafeFiles = ['app.html', 'app.d.ts'];
  const conditionalFiles = ['app.css'];

  // Always copy safe files
  for (const file of alwaysSafeFiles) {
    const sourceFile = path.join(mainProjectDir, 'src', file);
    const targetFile = path.join(targetSrcDir, file);
    if (await fs.pathExists(sourceFile)) {
      await fs.copy(sourceFile, targetFile, { overwrite: true });
    }
  }

  // Handle app.css carefully to preserve user customizations
  for (const file of conditionalFiles) {
    const sourceFile = path.join(mainProjectDir, 'src', file);
    const targetFile = path.join(targetSrcDir, file);
    if (await fs.pathExists(sourceFile)) {
      if ((await fs.pathExists(targetFile)) && !force) {
        console.log(`⚠️ ${file} exists - manually update or use --force to overwrite`);
      } else {
        await fs.copy(sourceFile, targetFile, { overwrite: true });
      }
    }
  }
  // Handle hooks.server.ts carefully
  const hooksServerSource = path.join(mainProjectDir, 'src', 'hooks.server.ts');
  const hooksServerTarget = path.join(targetSrcDir, 'hooks.server.ts');

  if (await fs.pathExists(hooksServerSource)) {
    if ((await fs.pathExists(hooksServerTarget)) && !force) {
      console.log('⚠️ hooks.server.ts exists - manually add auth or use --force');
    } else {
      await fs.copy(hooksServerSource, hooksServerTarget, { overwrite: true });
    }
  }

  // Handle hooks.client.ts carefully
  const hooksClientSource = path.join(mainProjectDir, 'src', 'hooks.client.ts');
  const hooksClientTarget = path.join(targetSrcDir, 'hooks.client.ts');

  if (await fs.pathExists(hooksClientSource)) {
    if ((await fs.pathExists(hooksClientTarget)) && !force) {
      console.log('⚠️ hooks.client.ts exists - manually add auth or use --force');
    } else {
      await fs.copy(hooksClientSource, hooksClientTarget, { overwrite: true });
    }
  }

  // Copy Sailor CMS directory (excluding templates to preserve user customizations)
  const mainSailorDir = path.join(mainProjectDir, 'src', 'lib', 'sailor');
  const targetLibDir = path.join(targetSrcDir, 'lib');
  const targetSailorDir = path.join(targetLibDir, 'sailor');
  const mainTemplatesDir = path.join(mainSailorDir, 'templates');
  const targetTemplatesDir = path.join(targetSailorDir, 'templates');

  // 1. Copy the sailor directory, always skipping templates
  if (await fs.pathExists(mainSailorDir)) {
    await fs.copy(mainSailorDir, targetSailorDir, {
      overwrite: true,
      filter: (src) => {
        // Always skip templates here, will handle below
        return !src.includes(path.join('sailor', 'templates'));
      }
    });
  }

  // 2. Copy templates if needed
  if (await fs.pathExists(mainTemplatesDir)) {
    const templatesExist = await fs.pathExists(targetTemplatesDir);
    if (!templatesExist || force) {
      await fs.copy(mainTemplatesDir, targetTemplatesDir, { overwrite: true });
      if (force && templatesExist) {
        console.log('⚠️ Overwrote existing templates directory due to --force flag.');
      } else {
        console.log('✅ Copied templates directory.');
      }
    } else {
      console.log(
        '⚠️ Templates directory already exists in target. Skipping to preserve user customizations. Use --force to overwrite.'
      );
    }
  }

  const mainComponentsDir = path.join(mainProjectDir, 'src', 'lib', 'components');
  const targetComponentsDir = path.join(targetLibDir, 'components');
  if (await fs.pathExists(mainComponentsDir)) {
    await fs.copy(mainComponentsDir, targetComponentsDir, { overwrite: true });
  }

  const mainHooksDir = path.join(mainProjectDir, 'src', 'lib', 'hooks');
  const targetHooksDir = path.join(targetLibDir, 'hooks');
  if (await fs.pathExists(mainHooksDir)) {
    await fs.copy(mainHooksDir, targetHooksDir, { overwrite: true });
  }

  await setupRoutes(targetDir);
  await setupConfigFiles(targetDir, force);
}

export async function updateSailorCoreFiles(targetDir) {
  const mainProjectDir = path.join(__dirname, '..');
  const targetSrcDir = path.join(targetDir, 'src');
  await fs.ensureDir(targetSrcDir);

  // Only update Sailor CMS core files, not user templates
  const mainSailorDir = path.join(mainProjectDir, 'src', 'lib', 'sailor');
  const targetLibDir = path.join(targetSrcDir, 'lib');
  const targetSailorDir = path.join(targetLibDir, 'sailor');
  // Template directories defined but currently not used in copy operation
  // const mainTemplatesDir = path.join(mainSailorDir, 'templates');
  // const targetTemplatesDir = path.join(targetSailorDir, 'templates');

  // Copy entire sailor directory but exclude templates to preserve user customizations
  if (await fs.pathExists(mainSailorDir)) {
    await fs.copy(mainSailorDir, targetSailorDir, {
      overwrite: true,
      filter: (src) => {
        // Exclude templates and generated directories to preserve user customizations
        return (
          !src.includes(path.join('sailor', 'templates')) &&
          !src.includes(path.join('sailor', 'generated'))
        );
      }
    });
    console.log('📝 Updated sailor core files');

    // CLEANUP: Remove files/folders in targetSailorDir that do not exist in mainSailorDir (except templates)
    const cleanDir = async (srcDir, tgtDir, skip = []) => {
      const srcEntries = new Set(await fs.readdir(srcDir));
      const tgtEntries = await fs.readdir(tgtDir);
      for (const entry of tgtEntries) {
        if (skip.includes(entry)) continue;
        const srcPath = path.join(srcDir, entry);
        const tgtPath = path.join(tgtDir, entry);
        const existsInSrc = srcEntries.has(entry);
        if (!existsInSrc) {
          await fs.remove(tgtPath);
          console.log(`🧹 Removed obsolete: ${tgtPath}`);
        } else {
          // If directory, recurse
          const stat = await fs.stat(tgtPath);
          if (stat.isDirectory()) {
            await cleanDir(
              srcPath,
              tgtPath,
              entry === 'templates' ? await fs.readdir(tgtPath) : []
            );
          }
        }
      }
    };
    await cleanDir(mainSailorDir, targetSailorDir, ['templates', 'generated']);
  }

  // Update components (only clean up ui subfolder)
  const mainComponentsDir = path.join(mainProjectDir, 'src', 'lib', 'components');
  const targetComponentsDir = path.join(targetLibDir, 'components');
  if (await fs.pathExists(mainComponentsDir)) {
    await fs.copy(mainComponentsDir, targetComponentsDir, { overwrite: true });
    // CLEANUP: Only remove files/folders in targetComponentsDir/ui that do not exist in mainComponentsDir/ui
    const mainUiDir = path.join(mainComponentsDir, 'ui');
    const targetUiDir = path.join(targetComponentsDir, 'ui');
    if ((await fs.pathExists(mainUiDir)) && (await fs.pathExists(targetUiDir))) {
      const cleanDir = async (srcDir, tgtDir) => {
        const srcEntries = new Set(await fs.readdir(srcDir));
        const tgtEntries = await fs.readdir(tgtDir);
        for (const entry of tgtEntries) {
          const srcPath = path.join(srcDir, entry);
          const tgtPath = path.join(tgtDir, entry);
          const existsInSrc = srcEntries.has(entry);
          if (!existsInSrc) {
            await fs.remove(tgtPath);
            console.log(`🧹 Removed obsolete: ${tgtPath}`);
          } else {
            // If directory, recurse
            const stat = await fs.stat(tgtPath);
            if (stat.isDirectory()) {
              await cleanDir(srcPath, tgtPath);
            }
          }
        }
      };
      await cleanDir(mainUiDir, targetUiDir);
    }
  }

  const mainHooksDir = path.join(mainProjectDir, 'src', 'lib', 'hooks');
  const targetHooksDir = path.join(targetLibDir, 'hooks');
  if (await fs.pathExists(mainHooksDir)) {
    await fs.copy(mainHooksDir, targetHooksDir, { overwrite: true });
  }

  await updateRoutes(targetDir);
}

export async function setupRoutes(targetDir) {
  const routesDir = path.join(targetDir, 'src', 'routes');
  const sailorRoutesDir = path.join(routesDir, 'sailor');
  await fs.ensureDir(sailorRoutesDir);
  const mainProjectRoutesDir = path.join(__dirname, '..', 'src', 'routes');
  if (await fs.pathExists(mainProjectRoutesDir)) {
    await fs.copy(mainProjectRoutesDir, routesDir, { overwrite: true });
  }
}

export async function updateRoutes(targetDir) {
  const routesDir = path.join(targetDir, 'src', 'routes');
  const sailorRoutesDir = path.join(routesDir, 'sailor');
  await fs.ensureDir(sailorRoutesDir);
  const mainProjectRoutesDir = path.join(__dirname, '..', 'src', 'routes');
  if (await fs.pathExists(mainProjectRoutesDir)) {
    const mainSailorRoutesDir = path.join(mainProjectRoutesDir, 'sailor');
    if (await fs.pathExists(mainSailorRoutesDir)) {
      await fs.copy(mainSailorRoutesDir, sailorRoutesDir, { overwrite: true });
    }
  }
}

export async function setupConfigFiles(targetDir, force = false) {
  const mainProjectDir = path.join(__dirname, '..');

  // Merge drizzle.config.ts instead of overwriting
  await mergeDrizzleConfig(targetDir, mainProjectDir, force);

  // Merge vite.config.ts instead of overwriting
  await mergeViteConfig(targetDir, mainProjectDir, force);

  // Create .env.sailor example file with Sailor CMS specific variables
  const envSource = path.join(mainProjectDir, '.env.example');
  const envSailorTarget = path.join(targetDir, '.env.sailor');
  if (await fs.pathExists(envSource)) {
    await fs.copy(envSource, envSailorTarget);
    console.log('📝 Created .env.sailor - copy variables to your .env file');
  }

  await updateSvelteConfig(targetDir);

  // Copy components.json for shadcn-svelte configuration
  const componentsJsonSource = path.join(mainProjectDir, 'components.json');
  const componentsJsonTarget = path.join(targetDir, 'components.json');
  if (await fs.pathExists(componentsJsonSource)) {
    await fs.copy(componentsJsonSource, componentsJsonTarget, { overwrite: true });
    console.log('✅ Updated components.json');
  }
}

async function mergeDrizzleConfig(targetDir, mainProjectDir, force = false) {
  const drizzleConfigSource = path.join(mainProjectDir, 'drizzle.config.ts');
  const drizzleConfigTarget = path.join(targetDir, 'drizzle.config.ts');

  if (!(await fs.pathExists(drizzleConfigSource))) {
    return;
  }

  const sourceContent = await fs.readFile(drizzleConfigSource, 'utf8');

  if ((await fs.pathExists(drizzleConfigTarget)) && !force) {
    console.log('⚠️ drizzle.config.ts exists - manually configure or use --force');
    return;
  }

  await fs.writeFile(drizzleConfigTarget, sourceContent);
}

async function mergeViteConfig(targetDir, mainProjectDir, force = false) {
  const viteConfigSource = path.join(mainProjectDir, 'vite.config.ts');
  const viteConfigTarget = path.join(targetDir, 'vite.config.ts');

  if (!(await fs.pathExists(viteConfigSource))) {
    return;
  }

  const sourceContent = await fs.readFile(viteConfigSource, 'utf8');

  if ((await fs.pathExists(viteConfigTarget)) && !force) {
    // Check if it's the default SvelteKit config
    const existingContent = await fs.readFile(viteConfigTarget, 'utf8');
    const isDefaultConfig =
      existingContent.includes('plugins: [sveltekit()]') &&
      !existingContent.includes('@tailwindcss/vite') &&
      !existingContent.includes('tailwindcss()');

    if (isDefaultConfig) {
      // Inject Tailwind into default config
      const updatedContent = existingContent
        .replace('plugins: [sveltekit()]', 'plugins: [tailwindcss(), sveltekit()]')
        .replace(
          "import { sveltekit } from '@sveltejs/kit/vite';",
          "import { sveltekit } from '@sveltejs/kit/vite';\nimport tailwindcss from '@tailwindcss/vite';"
        );

      await fs.writeFile(viteConfigTarget, updatedContent);
      console.log('✅ Updated vite.config.ts with Tailwind CSS');
    } else {
      console.log('⚠️ vite.config.ts exists - manually add @tailwindcss/vite or use --force');
    }
    return;
  }

  await fs.writeFile(viteConfigTarget, sourceContent);
}

export async function updateSvelteConfig(targetDir) {
  const configPath = path.join(targetDir, 'svelte.config.js');
  if (!(await fs.pathExists(configPath))) {
    console.log('⚠️ svelte.config.js not found, skipping route aliases');
    return;
  }
  let configContent = await fs.readFile(configPath, 'utf8');

  // Check if aliases are already configured
  if (configContent.includes('$sailor')) {
    console.log('✅ SvelteKit aliases already configured');
    return;
  }

  // Define the alias configuration directly
  const aliasConfig = `alias: {
      '$sailor': 'src/lib/sailor'
    }`;

  if (configContent.includes('kit: {')) {
    // Find the kit configuration and add aliases
    configContent = configContent.replace(
      /(kit:\s*{[^}]*adapter:\s*adapter\(\)[^}]*)(})/s,
      `$1,\n    ${aliasConfig}\n  $2`
    );
  } else {
    // If no kit config, add it
    configContent = configContent.replace(
      /(const config = {)/,
      `$1\n  kit: {\n    adapter: adapter(),\n    ${aliasConfig}\n  },`
    );
  }
  await fs.writeFile(configPath, configContent);
  console.log('✅ Updated svelte.config.js with $sailor alias');
}

export async function updateViteConfig(targetDir) {
  const configPath = path.join(targetDir, 'vite.config.ts');
  if (!(await fs.pathExists(configPath))) {
    console.log('⚠️ vite.config.ts not found, skipping Tailwind configuration');
    return;
  }

  const existingContent = await fs.readFile(configPath, 'utf8');
  const isDefaultConfig =
    existingContent.includes('plugins: [sveltekit()]') &&
    !existingContent.includes('@tailwindcss/vite') &&
    !existingContent.includes('tailwindcss()');

  if (isDefaultConfig) {
    // Inject Tailwind into default config
    const updatedContent = existingContent
      .replace('plugins: [sveltekit()]', 'plugins: [tailwindcss(), sveltekit()]')
      .replace(
        "import { sveltekit } from '@sveltejs/kit/vite';",
        "import { sveltekit } from '@sveltejs/kit/vite';\nimport tailwindcss from '@tailwindcss/vite';"
      );

    await fs.writeFile(configPath, updatedContent);
    console.log('✅ Updated vite.config.ts with Tailwind CSS');
  } else if (!existingContent.includes('@tailwindcss/vite')) {
    console.log('⚠️ vite.config.ts already exists with custom configuration.');
    console.log('💡 You may need to manually add @tailwindcss/vite to your plugins:');
    console.log('   import tailwindcss from "@tailwindcss/vite";');
    console.log('   plugins: [tailwindcss(), sveltekit()]');
  }
}

export async function setupDatabase(targetDir) {
  // Ensure drizzle directory exists and initialize it
  await fs.ensureDir(path.join(targetDir, 'drizzle', 'meta'));

  // Create initial journal file for drizzle-kit
  const journalPath = path.join(targetDir, 'drizzle', 'meta', '_journal.json');
  if (!(await fs.pathExists(journalPath))) {
    await fs.writeJson(journalPath, {
      version: '7',
      dialect: 'sqlite',
      entries: []
    });
  }

  await generateSchema(targetDir);
  execSync('npx drizzle-kit generate', { cwd: targetDir, stdio: 'pipe' });
  execSync('npx drizzle-kit push', { cwd: targetDir, stdio: 'pipe' });
  execSync('bun run src/lib/sailor/core/tools/core-seed.ts', { cwd: targetDir, stdio: 'pipe' });
  console.log('✅ Database setup complete');
}

export async function generateSchema(targetDir) {
  // Check required files exist
  const requiredFiles = [
    'src/lib/sailor/core/tools/generate-schema.ts',
    'src/lib/sailor/templates/blocks/index.ts',
    'src/lib/sailor/templates/collections/index.ts',
    'src/lib/sailor/templates/globals/index.ts',
    'drizzle.config.ts'
  ];

  for (const file of requiredFiles) {
    if (!(await fs.pathExists(path.join(targetDir, file)))) {
      throw new Error(`Required file missing: ${file}. Please run "npx sailor core:init" first.`);
    }
  }

  execSync('bun run src/lib/sailor/core/tools/generate-schema.ts', {
    cwd: targetDir,
    stdio: 'pipe'
  });
}

export async function detectPackageManager(targetDir) {
  const lockFiles = [
    { file: 'package-lock.json', manager: 'npm' },
    { file: 'yarn.lock', manager: 'yarn' },
    { file: 'pnpm-lock.yaml', manager: 'pnpm' },
    { file: 'bun.lockb', manager: 'bun' }
  ];
  for (const { file, manager } of lockFiles) {
    if (await fs.pathExists(path.join(targetDir, file))) {
      return manager;
    }
  }
  const packageJsonPath = path.join(targetDir, 'package.json');
  if (await fs.pathExists(packageJsonPath)) {
    const packageJson = await fs.readJson(packageJsonPath);
    if (packageJson.packageManager) {
      return packageJson.packageManager.split('@')[0];
    }
  }
  return 'npm';
}

export function getInstallCommand(packageManager) {
  switch (packageManager) {
    case 'yarn':
      return 'yarn install';
    case 'pnpm':
      return 'pnpm install';
    case 'bun':
      return 'bun install';
    default:
      return 'npm install';
  }
}

export async function trackInstalledDependencies(targetDir) {
  const trackingFile = path.join(targetDir, '.sailor-deps.json');

  // Read from CMS source package.json, not target project package.json
  const mainProjectDir = path.join(__dirname, '..');
  const mainPackageJsonPath = path.join(mainProjectDir, 'package.json');
  const mainPackageJson = await fs.readJson(mainPackageJsonPath);

  const installedDeps = {
    dependencies: {
      // Add sailorcms itself as a tracked dependency
      sailorcms: mainPackageJson.version,
      ...(mainPackageJson.dependencies || {})
    },
    devDependencies: mainPackageJson.devDependencies || {},
    timestamp: new Date().toISOString()
  };

  await fs.writeJson(trackingFile, installedDeps, { spaces: 2 });
}

export async function cleanupUnusedDependencies(targetDir) {
  const trackingFile = path.join(targetDir, '.sailor-deps.json');
  const packageJsonPath = path.join(targetDir, 'package.json');

  if (!(await fs.pathExists(trackingFile))) {
    return; // No tracking file, can't cleanup
  }

  const trackingData = await fs.readJson(trackingFile);
  const packageJson = await fs.readJson(packageJsonPath);

  // Get current Sailor CMS dependencies
  const mainProjectDir = path.join(__dirname, '..');
  const mainPackageJsonPath = path.join(mainProjectDir, 'package.json');
  const mainPackageJson = await fs.readJson(mainPackageJsonPath);

  const allDeps = {
    ...mainPackageJson.dependencies,
    ...mainPackageJson.devDependencies
  };

  const currentCmsDeps = Object.entries(allDeps).filter(([name, _version]) => {
    return (
      !name.includes('eslint') &&
      !name.includes('prettier') &&
      !name.includes('typescript') &&
      !name.includes('svelte-check') &&
      !name.includes('@sveltejs/') &&
      !name.includes('@types/') &&
      (name === '@tailwindcss/vite' || !name.includes('vite'))
    );
  });

  const currentCmsDepNames = currentCmsDeps.map(([name]) => name);
  const previouslyInstalledDeps = {
    ...trackingData.dependencies,
    ...trackingData.devDependencies
  };

  // Find unused dependencies
  const unusedDeps = Object.keys(previouslyInstalledDeps).filter((dep) => {
    return (
      dep !== 'sailorcms' && // Never remove sailorcms - it's our version reference
      !currentCmsDepNames.includes(dep) &&
      !packageJson.dependencies?.[dep] &&
      !packageJson.devDependencies?.[dep]
    );
  });

  if (unusedDeps.length > 0) {
    console.log('🧹 Cleaning up unused dependencies...');
    console.log(`Removing: ${unusedDeps.join(', ')}`);

    // Remove unused dependencies
    const packageManager = await detectPackageManager(targetDir);
    const uninstallCommand = getUninstallCommand(packageManager, unusedDeps);
    execSync(uninstallCommand, { cwd: targetDir, stdio: 'pipe' });

    console.log('✅ Cleaned up unused dependencies');
  }
}

export function getUninstallCommand(packageManager, packages) {
  const packageList = packages.join(' ');
  switch (packageManager) {
    case 'yarn':
      return `yarn remove ${packageList}`;
    case 'pnpm':
      return `pnpm remove ${packageList}`;
    case 'bun':
      return `bun remove ${packageList}`;
    default:
      return `npm uninstall ${packageList}`;
  }
}
