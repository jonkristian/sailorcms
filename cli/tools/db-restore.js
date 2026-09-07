// Database restore tool
import fs from 'fs/promises';
import path from 'path';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { createGunzip } from 'zlib';

export function registerDbRestore(program) {
  program
    .command('db:restore')
    .description('Restore database from backup file or S3/R2')
    .argument('[backup-file]', 'Local backup file path (if not provided, will list S3 backups)')
    .option('--bucket <bucket>', 'S3/R2 bucket name (defaults to S3_BUCKET env var)')
    .option('--endpoint <endpoint>', 'S3/R2 endpoint URL (defaults to S3_ENDPOINT env var)')
    .option('--site-name <name>', 'Site name to filter S3 backups (auto-detected if not provided)')
    .option('--temp-dir <path>', 'Temporary directory for downloaded files', '/tmp')
    .option('--force', 'Force restore without confirmation prompt')
    .option('--dry-run', 'Show what would be restored without actually doing it')
    .action(async (backupFile, options) => {
      try {
        console.log('Starting database restore...');

        if (options.dryRun) {
          console.log('DRY RUN MODE - No actual restore will be performed');
        }

        let restoreFile = backupFile;

        // If no file provided, list S3 backups
        if (!restoreFile) {
          const validationResult = await validateS3Environment(options);
          if (!validationResult.valid) {
            console.error('❌ S3 configuration invalid:', validationResult.error);
            process.exit(1);
          }

          restoreFile = await selectS3Backup(options, validationResult.bucket);
          if (!restoreFile) {
            console.log('ℹ️ No backup selected');
            return;
          }
        }

        // Detect database type and path
        const dbInfo = await detectDatabase();

        if (options.dryRun) {
          console.log(`Would restore: ${restoreFile}`);
          console.log(`Target database: ${dbInfo.path} (${dbInfo.type})`);
          console.log('✅ Dry run completed');
          return;
        }

        // Confirm destructive action
        if (!options.force) {
          const confirmed = await confirmRestore(dbInfo);
          if (!confirmed) {
            console.log('❌ Restore cancelled');
            return;
          }
        }

        // Perform the restore
        await performRestore(restoreFile, dbInfo, options);

        console.log('✅ Database restore completed successfully!');
        console.log('Restart your application to see the changes.');
      } catch (error) {
        console.error('❌ Restore failed:', error.message);
        process.exit(1);
      }
    });
}

async function validateS3Environment(options) {
  const bucket = options.bucket || process.env.S3_BUCKET;

  if (!bucket) {
    return {
      valid: false,
      error: 'S3_BUCKET environment variable or --bucket option required'
    };
  }

  const requiredVars = ['S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'];
  const missing = requiredVars.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    return {
      valid: false,
      error: `Missing required environment variables: ${missing.join(', ')}`
    };
  }

  if (!options.endpoint && !process.env.S3_ENDPOINT) {
    return {
      valid: false,
      error: 'S3_ENDPOINT environment variable is required for R2/custom S3 endpoints'
    };
  }

  return { valid: true, bucket };
}

async function detectDatabase() {
  // Check DATABASE_URL for connection info
  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl && databaseUrl.startsWith('postgresql://')) {
    return {
      type: 'postgresql',
      path: databaseUrl,
      connectionString: databaseUrl
    };
  }

  // Look for SQLite database
  const sqliteFile = await findSQLiteDatabase();
  if (sqliteFile) {
    return {
      type: 'sqlite',
      path: sqliteFile
    };
  }

  throw new Error('No database found. Set DATABASE_URL or ensure SQLite file exists.');
}

async function findSQLiteDatabase() {
  // Check DATABASE_URL for file path
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl && databaseUrl.startsWith('file:')) {
    const filePath = databaseUrl.replace('file:', '');
    try {
      await fs.access(filePath);
      return filePath;
    } catch {
      // File doesn't exist yet, that's okay for restore
      return filePath;
    }
  }

  // Check for DATABASE_FILE environment variable
  if (process.env.DATABASE_FILE) {
    return process.env.DATABASE_FILE;
  }

  // Check common names
  const possibleNames = ['sailor.sqlite', 'database.sqlite', 'db.sqlite'];
  for (const name of possibleNames) {
    try {
      await fs.access(name);
      return name;
    } catch {
      // Continue checking
    }
  }

  // If no database found, throw an error - DATABASE_URL should be configured
  throw new Error(
    'No database found. Please set DATABASE_URL in your .env file (e.g., DATABASE_URL=file:./db/sailor.sqlite)'
  );
}

async function selectS3Backup(options, bucket) {
  try {
    const { S3Client, ListObjectsV2Command } = await import('@aws-sdk/client-s3');

    const endpoint = options.endpoint || process.env.S3_ENDPOINT;
    const region = process.env.S3_REGION || 'auto';

    const client = new S3Client({
      region: region,
      endpoint: endpoint,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY
      },
      // R2 and other S3-compatible providers don't fully implement the
      // checksums the SDK enables by default from 3.729 — GetObject stalls on
      // the body stream rather than failing. Mirrors s3-client.server.ts.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      // And the SDK's default request timeout is 0, i.e. none — so a stall
      // hangs `db:restore` forever with nothing logged. Generous, since
      // backups are large, but bounded.
      requestHandler: { requestTimeout: 120_000, connectionTimeout: 5_000 }
    });

    const siteName = options.siteName || (await detectSiteName());

    console.log(`Searching for backups in ${bucket} for site: ${siteName}`);

    const listCommand = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: `backup/${siteName}-`
    });

    const response = await client.send(listCommand);
    const backups = response.Contents || [];

    if (backups.length === 0) {
      console.log(`❌ No backups found for site: ${siteName}`);
      return null;
    }

    // Sort by last modified (newest first)
    backups.sort((a, b) => new Date(b.LastModified) - new Date(a.LastModified));

    console.log('\nAvailable backups:');
    backups.forEach((backup, index) => {
      const date = new Date(backup.LastModified).toLocaleString();
      const size = formatFileSize(backup.Size);
      console.log(`  ${index + 1}. ${backup.Key} (${date}, ${size})`);
    });

    // For now, auto-select the newest backup
    // TODO: Add interactive selection with readline
    const selectedBackup = backups[0];
    console.log(`\nSelected newest backup: ${selectedBackup.Key}`);

    // Download the backup
    return await downloadS3Backup(client, bucket, selectedBackup.Key, options.tempDir);
  } catch (error) {
    throw new Error(`Failed to list S3 backups: ${error.message}`);
  }
}

async function downloadS3Backup(client, bucket, key, tempDir) {
  try {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');

    console.log(`Downloading backup: ${key}`);

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key
    });

    const response = await client.send(command);

    const fileName = path.basename(key);
    const tempPath = path.join(tempDir, fileName);

    // Save the downloaded file
    const writeStream = createWriteStream(tempPath);
    await pipeline(response.Body, writeStream);

    console.log(`✅ Downloaded to: ${tempPath}`);
    return tempPath;
  } catch (error) {
    throw new Error(`Failed to download backup: ${error.message}`);
  }
}

async function detectSiteName() {
  try {
    const packagePath = path.join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(await fs.readFile(packagePath, 'utf8'));

    if (packageJson.name) {
      return packageJson.name.replace(/[@/]/g, '').replace(/[^a-zA-Z0-9-]/g, '-');
    }
  } catch {
    // Fallback to directory name
  }

  return path.basename(process.cwd()).replace(/[^a-zA-Z0-9-]/g, '-');
}

async function confirmRestore(dbInfo) {
  console.log(`\n⚠️  WARNING: This will overwrite your current database!`);
  console.log(`   Database: ${dbInfo.path} (${dbInfo.type})`);
  console.log(`   Use --force to skip this confirmation`);

  // Non-interactive — require --force to proceed.
  return false;
}

async function performRestore(backupFile, dbInfo, options) {
  console.log(`Restoring ${dbInfo.type} database...`);

  if (dbInfo.type === 'sqlite') {
    await restoreSQLite(backupFile, dbInfo.path, options);
  } else if (dbInfo.type === 'postgresql') {
    await restorePostgreSQL(backupFile, dbInfo.connectionString, options);
  } else {
    throw new Error(`Unsupported database type: ${dbInfo.type}`);
  }
}

async function restoreSQLite(backupFile, dbPath, options) {
  let sourceFile = backupFile;

  // Check if file is compressed
  if (backupFile.endsWith('.gz')) {
    console.log('Decompressing backup...');
    sourceFile = await decompressFile(backupFile, options.tempDir);
  }

  // Backup existing database if it exists
  try {
    await fs.access(dbPath);
    const backupDbPath = `${dbPath}.backup-${Date.now()}`;
    await fs.copyFile(dbPath, backupDbPath);
    console.log(`Backed up existing database to: ${backupDbPath}`);
  } catch {
    // Database doesn't exist yet, that's fine
  }

  // Copy the restored database
  await fs.copyFile(sourceFile, dbPath);
  console.log(`✅ Restored SQLite database to: ${dbPath}`);

  // Clean up temporary files
  if (sourceFile !== backupFile) {
    await fs.unlink(sourceFile);
  }
}

async function restorePostgreSQL(backupFile, connectionString, options) {
  let sourceFile = backupFile;

  // Check if file is compressed
  if (backupFile.endsWith('.gz')) {
    console.log('Decompressing backup...');
    sourceFile = await decompressFile(backupFile, options.tempDir);
  }

  try {
    const { spawn } = await import('child_process');

    console.log('Restoring PostgreSQL database...');
    console.log('⚠️  WARNING: This will drop and recreate all tables!');

    // Use psql to restore the backup
    return new Promise((resolve, reject) => {
      const psql = spawn('psql', [connectionString, '-f', sourceFile], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      psql.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      psql.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      psql.on('error', (error) => {
        if (error.code === 'ENOENT') {
          reject(new Error('psql command not found. Please install PostgreSQL client tools.'));
        } else {
          reject(new Error(`PostgreSQL restore failed: ${error.message}`));
        }
      });

      psql.on('close', (code) => {
        if (code === 0) {
          console.log('✅ PostgreSQL database restored successfully');
          resolve();
        } else {
          console.error('PostgreSQL restore output:', stdout);
          console.error('PostgreSQL restore errors:', stderr);
          reject(new Error(`PostgreSQL restore failed with exit code ${code}`));
        }
      });
    });
  } catch (error) {
    throw new Error(`PostgreSQL restore failed: ${error.message}`);
  } finally {
    // Clean up temporary files
    if (sourceFile !== backupFile) {
      try {
        await fs.unlink(sourceFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

async function decompressFile(compressedPath, tempDir) {
  const baseName = path.basename(compressedPath, '.gz');
  const decompressedPath = path.join(tempDir, baseName);

  const readStream = createReadStream(compressedPath);
  const writeStream = createWriteStream(decompressedPath);
  const gunzip = createGunzip();

  await pipeline(readStream, gunzip, writeStream);

  return decompressedPath;
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
