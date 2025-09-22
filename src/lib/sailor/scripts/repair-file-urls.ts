#!/usr/bin/env bun
/**
 * File URL Repair Tool
 *
 * Fixes file URLs for existing files that have empty or incorrect URLs.
 * This addresses the issue where S3 files were showing /uploads/path instead of proper cloud URLs.
 *
 * Usage: bun run src/lib/sailor/scripts/repair-file-urls.ts [--dry-run] [--provider=local|s3]
 */

import { db } from '$sailor/core/db/index.server';
import { files } from '$sailor/generated/schema';
import { eq, isNull, or } from 'drizzle-orm';
import { StorageProviderFactory } from '$sailor/core/services/storage-provider.server';
import { getSettings } from '$sailor/core/settings';

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

  console.log('🔧 Starting file URL repair...');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'REPAIR'}`);
  console.log(`Provider: ${provider}`);
  console.log('');

  try {
    // Get current storage settings
    const settings = await getSettings();
    const currentProvider = provider === 'auto' ? settings.storage.provider || 'local' : provider;
    const storageProvider = await StorageProviderFactory.getProvider();

    console.log(`Using storage provider: ${currentProvider}`);
    console.log('');

    // Find files with empty or problematic URLs
    const brokenFiles = await db
      .select()
      .from(files)
      .where(
        or(
          eq(files.url, ''),
          isNull(files.url),
          // Find files that might have incorrect local URLs for S3 files
          currentProvider === 's3'
            ? // For S3, look for files with /uploads/ URLs but paths that look like S3 keys
              eq(files.url, '') // We'll check this manually below
            : eq(files.url, '') // For local, just empty URLs
        )
      );

    stats.total = brokenFiles.length;
    console.log(`Found ${stats.total} files that need URL repair`);

    if (stats.total === 0) {
      console.log('✅ No files need repair!');
      return stats;
    }

    console.log('');

    for (const file of brokenFiles) {
      try {
        console.log(`Processing: ${file.name} (${file.id})`);
        console.log(`  Current URL: "${file.url}"`);
        console.log(`  Path: "${file.path}"`);

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
          currentProvider === 'local' &&
          !file.url.startsWith('/uploads/') &&
          !file.url.startsWith('http')
        ) {
          // Local file with non-local URL - might need repair
          needsRepair = true;
        }

        if (!needsRepair) {
          console.log(`  ⏭️  Skipping - URL looks correct`);
          stats.skipped++;
          continue;
        }

        // Generate new URL using current storage provider
        newUrl = await storageProvider.getPublicUrl(file.path);
        console.log(`  New URL: "${newUrl}"`);

        if (!dryRun) {
          await db
            .update(files)
            .set({
              url: newUrl,
              updated_at: new Date().toISOString()
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
