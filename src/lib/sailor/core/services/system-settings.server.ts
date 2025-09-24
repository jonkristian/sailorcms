import { db } from '../db/index.server';
import { systemSettings } from '../../generated/schema';
import { eq } from 'drizzle-orm';

export interface SystemSetting {
  id: string;
  key: string;
  value: string; // JSON string
  description: string | null;
  category: string;
  created_at: Date;
  updated_at: Date;
}

export class SystemSettingsService {
  /**
   * Get a setting by key
   */
  static async getSetting(key: string): Promise<string | null> {
    const result = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, key))
      .limit(1);

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
      'Authentication',
      'Allow new user registrations'
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
    description?: string
  ): Promise<void> {
    const jsonValue = typeof value === 'string' ? value : JSON.stringify(value);

    await db
      .insert(systemSettings)
      .values({
        key,
        value: jsonValue,
        category,
        description
      })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: {
          value: jsonValue,
          category,
          description,
          updated_at: new Date()
        }
      });
  }

  /**
   * Get all settings by category
   */
  static async getSettingsByCategory(category: string): Promise<SystemSetting[]> {
    return await db.select().from(systemSettings).where(eq(systemSettings.category, category));
  }

  /**
   * Get all settings
   */
  static async getAllSettings(): Promise<SystemSetting[]> {
    return await db.select().from(systemSettings);
  }

  /**
   * Delete a setting
   */
  static async deleteSetting(key: string): Promise<void> {
    await db.delete(systemSettings).where(eq(systemSettings.key, key));
  }

  /**
   * Deep merge helper for nested objects
   */
  private static deepMerge<T>(target: T, source: Partial<T>): T {
    const result = { ...target };

    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(
          result[key] || ({} as T[Extract<keyof T, string>]),
          source[key] as any
        );
      } else if (source[key] !== undefined) {
        result[key] = source[key] as T[Extract<keyof T, string>];
      }
    }

    return result;
  }

  /**
   * Initialize settings from environment variables
   * This should be called once during setup
   */
  static async initializeFromEnv(): Promise<void> {
    const env = process.env;

    // Storage settings - auto-detect provider based on S3_BUCKET
    const storageProvider = env.S3_BUCKET ? 's3' : 'local';
    await this.setSetting(
      'storage.provider',
      storageProvider,
      'storage',
      'Storage provider (auto-detected: s3 if S3_BUCKET is set, local otherwise)'
    );

    if (env.S3_BUCKET) {
      await this.setSetting(
        'storage.providers.s3.bucket',
        env.S3_BUCKET,
        'storage',
        'S3 bucket name'
      );
    }

    if (env.S3_REGION) {
      await this.setSetting('storage.providers.s3.region', env.S3_REGION, 'storage', 'S3 region');
    }

    if (env.S3_ACCESS_KEY_ID) {
      await this.setSetting(
        'storage.providers.s3.accessKeyId',
        env.S3_ACCESS_KEY_ID,
        'storage',
        'S3 access key ID'
      );
    }

    if (env.S3_SECRET_ACCESS_KEY) {
      await this.setSetting(
        'storage.providers.s3.secretAccessKey',
        env.S3_SECRET_ACCESS_KEY,
        'storage',
        'S3 secret access key'
      );
    }

    if (env.S3_ENDPOINT) {
      await this.setSetting(
        'storage.providers.s3.endpoint',
        env.S3_ENDPOINT,
        'storage',
        'S3 endpoint URL'
      );
    }

    if (env.S3_PUBLIC_URL) {
      await this.setSetting(
        'storage.providers.s3.publicUrl',
        env.S3_PUBLIC_URL,
        'storage',
        'S3 public URL'
      );
    }

    if (env.UPLOAD_DIR) {
      await this.setSetting(
        'storage.providers.local.uploadDir',
        env.UPLOAD_DIR,
        'storage',
        'Local upload directory'
      );
    }

    // SEO settings
    if (env.SEO_ENABLED) {
      await this.setSetting('seo.enabled', env.SEO_ENABLED === 'true', 'seo', 'SEO enabled');
    }

    // SEO configuration is managed through the admin interface
    // via the Configuration global (analytics textarea)

    // System settings
    if (env.DEBUG_MODE) {
      await this.setSetting(
        'system.debugMode',
        env.DEBUG_MODE === 'true',
        'system',
        'Debug mode enabled'
      );
    }

    // Auth settings
    if (env.NODE_ENV) {
      await this.setSetting(
        'auth.useSecureCookies',
        env.NODE_ENV === 'production',
        'auth',
        'Use secure cookies in production'
      );
    }
  }
}
