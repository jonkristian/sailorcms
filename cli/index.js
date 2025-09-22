#!/usr/bin/env node

import { Command } from 'commander';
import { createRequire } from 'module';
import { existsSync } from 'fs';
import path from 'path';
import { registerCoreInit } from './core/init.js';
import { registerCoreUpdate } from './core/update.js';
import { registerDbUpdate } from './update.js';
import { registerDbGenerate } from './db/generate.js';
import { registerFilesRepair } from './files/repair.js';
import { registerUserCommands } from './core/users.js';
import { registerDbBackup } from './db/backup.js';
import { registerDbRestore } from './db/restore.js';

// Load environment variables and start CLI
(async () => {
  // Load environment variables from .env file if it exists and dotenv is available
  if (existsSync('.env')) {
    try {
      // Import dotenv from the consumer project's node_modules
      const dotenvPath = path.join(process.cwd(), 'node_modules', 'dotenv', 'lib', 'main.js');
      const { config } = await import(dotenvPath);
      config();
    } catch (error) {
      // dotenv not available - fallback to manual parsing or skip
    }
  }

  const require = createRequire(import.meta.url);
  const packageJson = require('../package.json');

  const program = new Command();

  program
    .name('sailor')
    .description("A smooth sailin' template-driven CMS for SvelteKit")
    .version(packageJson.version);

  registerCoreInit(program);
  registerCoreUpdate(program);
  registerDbGenerate(program);
  registerDbUpdate(program);
  registerDbBackup(program);
  registerDbRestore(program);
  registerFilesRepair(program);
  registerUserCommands(program);

  program.parse();
})();
