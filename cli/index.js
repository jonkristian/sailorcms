#!/usr/bin/env node

import { Command } from 'commander';
import { createRequire } from 'module';
import { existsSync } from 'fs';
import path from 'path';
import { registerCoreInit } from './tools/cms-init.js';
import { registerCoreUpdate } from './tools/cms-update.js';
import { registerDbUpdate } from './tools/db-update.js';
import { registerDbGenerate } from './tools/db-generate.js';
import { registerUserCommands } from './tools/users-manage.js';
import { registerDbBackup } from './tools/db-backup.js';
import { registerDbRestore } from './tools/db-restore.js';
import { registerDbSeed } from './tools/db-seed.js';
import { registerSearchReindex } from './tools/search-reindex.js';
import { registerDbRepairTimestamps } from './tools/db-repair-timestamps.js';
import { registerDbRepair } from './tools/db-repair.js';
import { registerDoctor } from './tools/doctor.js';
import { registerSyncUi } from './tools/sync-ui.js';

// Load environment variables and start CLI
(async () => {
  // Load environment variables from .env file if it exists and dotenv is available
  if (existsSync('.env')) {
    try {
      // Import dotenv from the consumer project's node_modules
      const dotenvPath = path.join(process.cwd(), 'node_modules', 'dotenv', 'lib', 'main.js');
      const { config } = await import(dotenvPath);
      config({ quiet: true });
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

  // Order matters for `--help` output. Group by namespace so consumers can
  // scan the categories cleanly.

  // core:* — install + update sailor in a SvelteKit project
  registerCoreInit(program);
  registerCoreUpdate(program);

  // db:* — schema generation, migration, seeding, backup/restore, repair
  registerDbUpdate(program);
  registerDbGenerate(program);
  registerDbSeed(program);
  registerDbBackup(program);
  registerDbRestore(program);
  registerDbRepair(program);
  registerDbRepairTimestamps(program);

  // search:* — index management
  registerSearchReindex(program);

  // users:* — user/role management
  registerUserCommands(program);

  // doctor — consumer setup healthcheck
  registerDoctor(program);

  // dev:* — maintainer-only commands (run from sailor's own repo)
  registerSyncUi(program);

  program.parse();
})();
