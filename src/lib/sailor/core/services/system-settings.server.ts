import { db } from '../db/index.server';
import { settings } from '../../generated/schema';
import { eq } from 'drizzle-orm';
import type { InferSelectModel } from 'drizzle-orm';

export type SystemSetting = InferSelectModel<typeof settings>;

export class SystemSettingsService {
  /**
   * Get a setting by key
   */
  static async getSetting(key: string): Promise<string | null> {
    const result = await db.select().from(settings).where(eq(settings.key, key)).limit(1);

    return result[0]?.value || null;
  }

  /**
   * Check if user registrations are enabled
   */
  static async isRegistrationEnabled(): Promise<boolean> {
    const setting = await this.getSetting('auth.allow_registration');
    // Default to true if setting doesn't exist (backwards compatibility)
    return setting ? JSON.parse(setting) : true;
  }

  /**
   * Enable or disable user registrations
   */
  static async setRegistrationEnabled(enabled: boolean): Promise<void> {
    await this.setSetting(
      'auth.allow_registration',
      JSON.stringify(enabled),
      'authentication',
      'Allow new user registrations',
      'user'
    );
  }

  /**
   * Get a setting by key and parse as JSON
   */
  static async getSettingJSON<T = any>(key: string): Promise<T | null> {
    const value = await this.getSetting(key);
    if (!value) return null;

    try {
      return JSON.parse(value);
    } catch (error) {
      console.error(`Failed to parse setting ${key} as JSON:`, error);
      return null;
    }
  }

  /**
   * Set a setting
   */
  static async setSetting(
    key: string,
    value: any,
    category: string,
    description?: string,
    source: string = 'user'
  ): Promise<void> {
    const jsonValue = typeof value === 'string' ? value : JSON.stringify(value);

    await db
      .insert(settings)
      .values({
        key,
        value: jsonValue,
        category,
        description,
        source
      })
      .onConflictDoUpdate({
        target: settings.key,
        set: {
          value: jsonValue,
          category,
          description,
          source,
          updated_at: new Date()
        }
      });
  }

  /**
   * Get all settings by category
   */
  static async getSettingsByCategory(category: string): Promise<SystemSetting[]> {
    return await db.select().from(settings).where(eq(settings.category, category));
  }

  /**
   * Get all settings
   */
  static async getAllSettings(): Promise<SystemSetting[]> {
    try {
      return await db.select().from(settings);
    } catch (error) {
      // During prerendering, database might not be available
      console.warn('Could not load settings from database during prerender:', error);
      return [];
    }
  }

  /**
   * Delete a setting
   */
  static async deleteSetting(key: string): Promise<void> {
    await db.delete(settings).where(eq(settings.key, key));
  }

  /**
   * Set a template setting (source = 'template')
   * Only sets if the setting doesn't already exist or is also from template source
   */
  static async setTemplateSetting(
    key: string,
    value: any,
    category: string,
    description?: string
  ): Promise<void> {
    const existingSetting = await db.select().from(settings).where(eq(settings.key, key)).limit(1);

    // Only set template settings if:
    // 1. Setting doesn't exist
    // 2. Setting exists but is from template source (allows template updates)
    if (existingSetting.length === 0 || existingSetting[0].source === 'template') {
      await this.setSetting(key, value, category, description, 'template');
    }
  }

  /**
   * Check if a setting is from template source (read-only in UI)
   */
  static async isTemplateSetting(key: string): Promise<boolean> {
    const result = await db
      .select({ source: settings.source })
      .from(settings)
      .where(eq(settings.key, key))
      .limit(1);

    return result[0]?.source === 'template';
  }

  /**
   * Get settings by source type
   */
  static async getSettingsBySource(source: 'user' | 'template' | 'env'): Promise<SystemSetting[]> {
    return await db.select().from(settings).where(eq(settings.source, source));
  }

  /**
   * Load template settings into database
   * This should be called during application startup
   */
  static async loadTemplateSettings(): Promise<void> {
    // Import template settings
    const { settings } = await import('../../templates/settings');

    // Flatten the settings object and store each as a template setting
    await this.flattenAndStoreSettings(settings, 'template');
  }

  /**
   * Helper method to flatten nested settings object and store each setting
   */
  private static async flattenAndStoreSettings(
    obj: any,
    source: 'user' | 'template' | 'env',
    prefix: string = '',
    category: string = 'system'
  ): Promise<void> {
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;

      // Determine category based on top-level key
      const settingCategory = prefix === '' ? key : category;

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        // Recursively handle nested objects
        await this.flattenAndStoreSettings(value, source, fullKey, settingCategory);
      } else {
        // Store the setting - only store non-sensitive values for templates
        if (source === 'template' && !this.isSensitiveKey(fullKey)) {
          await this.setTemplateSetting(
            fullKey,
            value,
            settingCategory,
            `Template setting for ${fullKey}`
          );
        } else if (source !== 'template') {
          await this.setSetting(fullKey, value, settingCategory, `Setting for ${fullKey}`, source);
        }
      }
    }
  }

  /**
   * Check if a setting key contains sensitive information that shouldn't be stored in database
   */
  private static isSensitiveKey(key: string): boolean {
    const sensitivePatterns = ['accesskey', 'secretkey', 'password', 'token', 'secret', 'private'];
    const lowerKey = key.toLowerCase();
    return sensitivePatterns.some((pattern) => lowerKey.includes(pattern));
  }

  /**
   * Initialize settings from environment variables
   * This should be called once during setup
   */
  static async initializeFromEnv(): Promise<void> {
    // Skip during prerendering to avoid database access
    if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL) {
      return;
    }
    const env = process.env;

    // Storage settings - auto-detect provider based on S3_BUCKET
    const storageProvider = env.S3_BUCKET ? 's3' : 'local';
    await this.setSetting(
      'storage.provider',
      storageProvider,
      'storage',
      'Storage provider (auto-detected)',
      'env'
    );

    // Note: Sensitive credentials (S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY)
    // are intentionally NOT stored in database for security
    if (env.S3_BUCKET) {
      await this.setSetting(
        'storage.providers.s3.bucket',
        env.S3_BUCKET,
        'storage',
        'S3 bucket name',
        'env'
      );
    }

    if (env.S3_REGION) {
      await this.setSetting(
        'storage.providers.s3.region',
        env.S3_REGION,
        'storage',
        'S3 region',
        'env'
      );
    }

    if (env.S3_ENDPOINT) {
      await this.setSetting(
        'storage.providers.s3.endpoint',
        env.S3_ENDPOINT,
        'storage',
        'S3 endpoint URL',
        'env'
      );
    }

    if (env.S3_PUBLIC_URL) {
      await this.setSetting(
        'storage.providers.s3.publicUrl',
        env.S3_PUBLIC_URL,
        'storage',
        'S3 public URL',
        'env'
      );
    }

    if (env.UPLOAD_DIR) {
      await this.setSetting(
        'storage.providers.local.uploadDir',
        env.UPLOAD_DIR,
        'storage',
        'Local upload directory',
        'env'
      );
    }

    // SEO settings
    if (env.SEO_ENABLED) {
      await this.setSetting('seo.enabled', env.SEO_ENABLED === 'true', 'seo', 'SEO enabled', 'env');
    }

    // SEO configuration is managed through the admin interface
    // via the Configuration global (analytics textarea)

    // System settings
    if (env.DEBUG_MODE) {
      await this.setSetting(
        'system.debugMode',
        env.DEBUG_MODE === 'true',
        'system',
        'Debug mode enabled',
        'env'
      );
    }

    // Auth settings
    if (env.NODE_ENV) {
      await this.setSetting(
        'auth.useSecureCookies',
        env.NODE_ENV === 'production',
        'auth',
        'Use secure cookies in production',
        'env'
      );
    }
  }
}
