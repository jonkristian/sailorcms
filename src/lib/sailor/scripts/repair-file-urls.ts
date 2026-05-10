#!/usr/bin/env bun
/**
 * File URL Repair Tool
 *
 * Fixes file URLs for existing files that have empty or incorrect URLs.
 * This addresses the issue where S3 files were showing /uploads/path instead of proper cloud URLs.
 *
 * Usage: bun run src/lib/sailor/scripts/repair-file-urls.ts [--dry-run] [--provider=local|s3]
 */

import { db } from 'sailorcms/core/db/index.server';
import { files } from '$sailor/generated/schema';
import { eq } from 'drizzle-orm';
import { StorageProviderFactory } from 'sailorcms/core/services/storage-provider.server';
import { getSettings } from 'sailorcms/core/settings/index';

interface RepairStats {
  total: number;
  repaired: number;
  errors: number;
  skipped: number;
}

export async function repairFileURLs(
  options: {
    dryRun?: boolean;
    provider?: 'local' | 's3' | 'auto';
  } = {}
): Promise<RepairStats> {
  const { dryRun = false, provider = 'auto' } = options;
  const stats: RepairStats = { total: 0, repaired: 0, errors: 0, skipped: 0 };

  try {
    // Get current storage settings
    const settings = await getSettings();
    const currentProvider = provider === 'auto' ? settings.storage.provider || 'local' : provider;
    const storageProvider = await StorageProviderFactory.getProvider();

    // Active public-URL prefix for the current provider — used to detect
    // host drift, e.g. a rotated R2 bucket where DB rows still point at the
    // old `pub-OLDHOST.r2.dev` while `S3_PUBLIC_URL` in .env now resolves to
    // a new host.
    const expectedPrefix =
      currentProvider === 's3'
        ? settings.storage?.providers?.s3?.publicUrl || ''
        : settings.storage?.providers?.local?.publicUrl || '/uploads';

    console.log(`Using storage provider: ${currentProvider}`);
    if (expectedPrefix) console.log(`Expected URL prefix: ${expectedPrefix}`);
    console.log('');

    // Pull every file row — we need to inspect URLs in JS to detect host drift,
    // which can't be expressed cleanly in SQL across SQLite/Postgres.
    const allFiles = await db.select().from(files);

    stats.total = allFiles.length;

    for (const file of allFiles) {
      try {
        // Check if this file actually needs repair
        let needsRepair = false;
        let newUrl = '';

        if (!file.url || file.url === '') {
          // Definitely needs repair - empty URL
          needsRepair = true;
        } else if (currentProvider === 's3' && file.url.startsWith('/uploads/')) {
          // S3 file with local URL - needs repair
          needsRepair = true;
        } else if (
          currentProvider === 's3' &&
          expectedPrefix &&
          !file.url.startsWith(expectedPrefix + '/')
        ) {
          // S3 file whose stored URL host doesn't match the currently-active
          // S3_PUBLIC_URL — typically a rotated bucket / changed CDN host.
          needsRepair = true;
        } else if (
          currentProvider === 'local' &&
          !file.url.startsWith('/uploads/') &&
          !file.url.startsWith('http')
        ) {
          // Local file with non-local URL - might need repair
          needsRepair = true;
        }

        if (!needsRepair) {
          stats.skipped++;
          continue;
        }

        console.log(`Processing: ${file.name} (${file.id})`);
        console.log(`  Current URL: "${file.url}"`);
        console.log(`  Path: "${file.path}"`);

        // Generate new URL using current storage provider
        newUrl = await storageProvider.getPublicUrl(file.path);
        console.log(`  New URL: "${newUrl}"`);

        if (!dryRun) {
          await db
            .update(files)
            .set({
              url: newUrl,
              updated_at: new Date()
            })
            .where(eq(files.id, file.id));

          console.log(`  ✅ Repaired`);
        } else {
          console.log(`  🔍 Would repair (dry run)`);
        }

        stats.repaired++;
      } catch (error) {
        console.error(`  ❌ Error processing ${file.name}: ${error}`);
        stats.errors++;
      }

      console.log('');
    }

    // Summary
    console.log('📊 Repair Summary:');
    console.log(`  Total files checked: ${stats.total}`);
    console.log(`  Repaired: ${stats.repaired}`);
    console.log(`  Skipped: ${stats.skipped}`);
    console.log(`  Errors: ${stats.errors}`);

    if (dryRun && stats.repaired > 0) {
      console.log('');
      console.log('💡 Run without --dry-run to apply changes');
    }
  } catch (error) {
    console.error('❌ Fatal error during repair:', error);
    throw error;
  }

  return stats;
}
