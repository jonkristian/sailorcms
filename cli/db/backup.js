import fs from 'fs/promises';
import path from 'path';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { createGzip } from 'zlib';

export function registerDbBackup(program) {
  program
    .command('db:backup')
    .description('Create SQLite database backup and upload to S3/R2')
    .option('--bucket <bucket>', 'S3/R2 bucket name (defaults to S3_BUCKET env var)')
    .option('--endpoint <endpoint>', 'S3/R2 endpoint URL (defaults to S3_ENDPOINT env var)')
    .option('--retention <days>', 'Days to keep backups', '7')
    .option('--site-name <name>', 'Site name for backup filename (auto-detected if not provided)')
    .option('--temp-dir <path>', 'Temporary directory for backup files', '/tmp')
    .option('--output <path>', 'Save backup locally to this path instead of uploading to S3/R2')
    .option('--dry-run', 'Show what would be backed up without actually doing it')
    .action(async (options) => {
      try {
        // Validate environment and options
        const validationResult = await validateBackupEnvironment(options);
        if (!validationResult.valid) {
          console.error('❌ Backup configuration invalid:', validationResult.error);
          process.exit(1);
        }

        console.log('🗄️ Starting database backup...');

        if (options.dryRun) {
          console.log('🔍 DRY RUN MODE - No actual backup will be created');
        }

        // Look for SQLite database file
        const dbPath = await findSQLiteDatabase();
        if (!dbPath) {
          console.log('ℹ️ No SQLite database found');
          console.log(
            'ℹ️ Looking for: DATABASE_FILE env var, sailor.sqlite, database.sqlite, or *.sqlite files'
          );
          return;
        }

        // Generate site name and timestamp
        const siteName = options.siteName || (await detectSiteName());
        const timestamp = new Date()
          .toISOString()
          .replace(/[:.]/g, '-')
          .replace('T', '_')
          .slice(0, 19);

        console.log(`📋 Site: ${siteName}`);
        console.log(`📁 Database: ${dbPath}`);
        console.log(`⏰ Timestamp: ${timestamp}`);

        if (options.dryRun) {
          const bucket = validationResult.bucket;
          console.log(`🔍 Would create backup: ${siteName}-${timestamp}.sqlite.gz`);
          if (bucket) {
            console.log(`🔍 Would upload to: ${bucket}/backups/${siteName}-${timestamp}.sqlite.gz`);
          } else {
            console.log(
              `🔍 Would save locally to: ${options.tempDir}/${siteName}-${timestamp}.sqlite.gz`
            );
          }
          console.log('✅ Dry run completed');
          return;
        }

        // Create compressed SQLite backup
        const backupInfo = await createSQLiteBackup(dbPath, options, siteName, timestamp);

        // Check if local output is requested
        if (options.output) {
          const finalPath = await saveLocalBackup(
            backupInfo.localPath,
            options.output,
            siteName,
            timestamp
          );
          console.log('✅ Backup saved locally!');
          console.log(`📊 Backup size: ${backupInfo.size}`);
          console.log(`📁 Local backup: ${finalPath}`);
          return;
        }

        // Check storage provider setting and upload accordingly
        const storageProvider = process.env.STORAGE_PROVIDER || 'local';
        const bucket = validationResult.bucket;

        if (storageProvider === 's3' && bucket) {
          await uploadToS3(backupInfo.localPath, options, siteName, timestamp, bucket);

          // Cleanup old backups
          await cleanupOldBackups(options, siteName, bucket);

          // Remove local temp file
          await fs.unlink(backupInfo.localPath);
          console.log('🧹 Cleaned up temporary files');

          console.log('✅ Backup completed successfully!');
          console.log(`📊 Backup size: ${backupInfo.size}`);
          console.log(`☁️ Uploaded to: ${bucket}/backups/${siteName}-${timestamp}.sqlite.gz`);
        } else {
          // No S3 configured, save locally to ./backups/
          const localBackupPath = await saveLocalBackup(
            backupInfo.localPath,
            './backups/',
            siteName,
            timestamp
          );
          console.log('✅ Backup saved locally!');
          console.log(`📊 Backup size: ${backupInfo.size}`);
          console.log(`📁 Local backup: ${localBackupPath}`);

          if (storageProvider === 'local') {
            console.log(
              '💡 Set STORAGE_PROVIDER=s3 and configure S3_BUCKET to enable cloud backup'
            );
          } else if (storageProvider === 's3' && !bucket) {
            console.log(
              '💡 Configure S3_BUCKET to enable cloud backup (STORAGE_PROVIDER=s3 is set)'
            );
          }
        }
      } catch (error) {
        console.error('❌ Backup failed:', error.message);
        process.exit(1);
      }
    });
}

async function validateBackupEnvironment(options) {
  const bucket = options.bucket || process.env.S3_BUCKET;

  // Check if backup is requested
  if (bucket) {
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
  }

  return { valid: true, bucket };
}

async function findSQLiteDatabase() {
  // First check for DATABASE_FILE environment variable
  if (process.env.DATABASE_FILE) {
    try {
      await fs.access(process.env.DATABASE_FILE);
      return process.env.DATABASE_FILE;
    } catch {
      console.log(
        `⚠️ DATABASE_FILE environment variable set to "${process.env.DATABASE_FILE}" but file not found`
      );
    }
  }

  const possibleNames = ['sailor.sqlite', 'database.sqlite', 'db.sqlite'];

  // Check for common names
  for (const name of possibleNames) {
    try {
      await fs.access(name);
      return name;
    } catch {
      // File doesn't exist, continue
    }
  }

  // Look for any .sqlite files in current directory
  try {
    const files = await fs.readdir('.');
    const sqliteFiles = files.filter((file) => file.endsWith('.sqlite'));
    if (sqliteFiles.length > 0) {
      return sqliteFiles[0]; // Return first SQLite file found
    }
  } catch {
    // Directory read failed
  }

  return null;
}

async function detectSiteName() {
  try {
    // Try to read package.json for site name
    const packagePath = path.join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(await fs.readFile(packagePath, 'utf8'));

    if (packageJson.name) {
      return packageJson.name.replace(/[@/]/g, '').replace(/[^a-zA-Z0-9-]/g, '-');
    }
  } catch {
    // Fallback to directory name
  }

  // Use current directory name as fallback
  return path.basename(process.cwd()).replace(/[^a-zA-Z0-9-]/g, '-');
}

async function createSQLiteBackup(dbPath, options, siteName, timestamp) {
  const backupName = `${siteName}-${timestamp}.sqlite`;
  const tempPath = path.join(options.tempDir, backupName);

  // Check if database file exists
  try {
    await fs.access(dbPath);
  } catch {
    throw new Error(`Database file not found: ${dbPath}`);
  }

  // Create proper SQLite backup using VACUUM INTO
  await createSQLiteVacuumBackup(dbPath, tempPath);
  console.log('📋 Created SQLite backup');

  // Compress the backup
  const compressedPath = await compressFile(tempPath);
  await fs.unlink(tempPath); // Remove uncompressed version
  console.log('🗜️ Compressed backup');

  const stats = await fs.stat(compressedPath);

  return {
    localPath: compressedPath,
    size: formatFileSize(stats.size),
    timestamp
  };
}

async function compressFile(filePath) {
  const compressedPath = `${filePath}.gz`;
  const readStream = createReadStream(filePath);
  const writeStream = createWriteStream(compressedPath);
  const gzip = createGzip();

  await pipeline(readStream, gzip, writeStream);

  return compressedPath;
}

async function createSQLiteVacuumBackup(sourcePath, backupPath) {
  try {
    // Try using sqlite3 command with VACUUM INTO (SQLite 3.27.0+)
    const { spawn } = await import('child_process');

    return new Promise((resolve, reject) => {
      // Use VACUUM INTO for atomic, consistent backup
      const sqlite3 = spawn('sqlite3', [sourcePath], { stdio: ['pipe', 'pipe', 'pipe'] });

      let stderr = '';

      // Send the VACUUM INTO command via stdin
      sqlite3.stdin.write(`VACUUM INTO '${backupPath}';\n`);
      sqlite3.stdin.write('.exit\n');
      sqlite3.stdin.end();

      sqlite3.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      sqlite3.on('error', (error) => {
        // If sqlite3 command not available, fall back to file copy
        if (error.code === 'ENOENT') {
          console.log('⚠️ sqlite3 command not found, using file copy fallback');
          fallbackFileCopy(sourcePath, backupPath).then(resolve).catch(reject);
        } else {
          reject(new Error(`SQLite backup failed: ${error.message}`));
        }
      });

      sqlite3.on('close', (code) => {
        if (code === 0) {
          console.log('✅ Used SQLite VACUUM INTO method (safest)');
          resolve();
        } else {
          console.log(`⚠️ VACUUM INTO failed (exit code ${code}), using file copy fallback`);
          if (stderr.trim()) {
            console.log(`   Error: ${stderr.trim()}`);
          }
          fallbackFileCopy(sourcePath, backupPath).then(resolve).catch(reject);
        }
      });
    });
  } catch (_error) {
    // If dynamic import fails or other issues, fall back to file copy
    console.log('⚠️ SQLite VACUUM backup failed, using file copy fallback');
    await fallbackFileCopy(sourcePath, backupPath);
  }
}

async function fallbackFileCopy(sourcePath, backupPath) {
  const fs = await import('fs/promises');
  console.log('⚠️ Using file copy method (less safe for active databases)');
  await fs.copyFile(sourcePath, backupPath);
}

async function saveLocalBackup(tempBackupPath, outputPath, siteName, timestamp) {
  const fileName = `${siteName}-${timestamp}.sqlite.gz`;

  // Handle different output path formats
  let finalPath;

  if (outputPath.endsWith('/') || outputPath === '.') {
    // Directory path - save with generated filename
    finalPath = path.join(outputPath, fileName);
  } else if (outputPath.includes('.')) {
    // Full file path provided
    finalPath = outputPath;
  } else {
    // Directory path without trailing slash
    finalPath = path.join(outputPath, fileName);
  }

  // Ensure directory exists
  const dir = path.dirname(finalPath);
  await fs.mkdir(dir, { recursive: true });

  // Copy backup to final location
  await fs.copyFile(tempBackupPath, finalPath);

  // Remove temp file
  await fs.unlink(tempBackupPath);

  return finalPath;
}

async function uploadToS3(backupPath, options, siteName, timestamp, bucket) {
  try {
    // Dynamic import for better dependency management
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');

    // Use your existing S3 configuration
    const endpoint = options.endpoint || process.env.S3_ENDPOINT;
    const region = process.env.S3_REGION || 'auto';

    const client = new S3Client({
      region: region,
      endpoint: endpoint,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY
      }
    });

    const fileName = `${siteName}-${timestamp}.sqlite.gz`;
    const fileContent = await fs.readFile(backupPath);

    console.log(`☁️ Uploading: ${fileName} (${formatFileSize(fileContent.length)})`);

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: `backups/${fileName}`,
      Body: fileContent,
      ContentType: 'application/gzip',
      Metadata: {
        'site-name': siteName,
        'backup-timestamp': timestamp,
        'created-by': 'sailor-cms-backup'
      }
    });

    await client.send(command);
    console.log(`✅ Uploaded to S3: ${bucket}/backups/${fileName}`);
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
      throw new Error('AWS SDK not available. Run: npm install @aws-sdk/client-s3');
    } else {
      throw new Error(`S3 upload failed: ${error.message}`);
    }
  }
}

async function cleanupOldBackups(options, siteName, bucket) {
  try {
    const { S3Client, ListObjectsV2Command, DeleteObjectCommand } = await import(
      '@aws-sdk/client-s3'
    );

    const endpoint = options.endpoint || process.env.S3_ENDPOINT;
    const region = process.env.S3_REGION || 'auto';

    const client = new S3Client({
      region: region,
      endpoint: endpoint,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY
      }
    });

    // List backups for this site
    const listCommand = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: `backups/${siteName}-`
    });

    const response = await client.send(listCommand);
    const objects = response.Contents || [];

    if (objects.length === 0) {
      console.log('🧹 No existing backups found to cleanup');
      return;
    }

    // Filter objects older than retention period
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(options.retention));

    const objectsToDelete = objects.filter((obj) => obj.LastModified < cutoffDate);

    if (objectsToDelete.length === 0) {
      console.log(`🧹 No backups older than ${options.retention} days found`);
      return;
    }

    // Delete old backups
    for (const obj of objectsToDelete) {
      const deleteCommand = new DeleteObjectCommand({
        Bucket: bucket,
        Key: obj.Key
      });

      await client.send(deleteCommand);
      console.log(`🗑️ Deleted old backup: ${obj.Key}`);
    }

    console.log(`🧹 Cleaned up ${objectsToDelete.length} old backup(s) from S3`);
  } catch (error) {
    console.warn('⚠️ S3 cleanup warning:', error.message);
    // Don't fail the backup if cleanup fails
  }
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
