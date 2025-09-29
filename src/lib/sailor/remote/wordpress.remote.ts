import { command, getRequestEvent } from '$app/server';
import {
  WordPressImportService,
  type WordPressAPIConfig
} from '$sailor/core/services/wordpress-import.server';

/**
 * Preview WordPress API to test connection and fetch sample posts
 */
export const previewWordPressAPI = command(
  'unchecked',
  async ({
    apiConfig,
    postsPerPage = 5,
    maxPages = 1
  }: {
    apiConfig: WordPressAPIConfig;
    postsPerPage?: number;
    maxPages?: number;
  }) => {
    const { locals } = getRequestEvent();

    if (!locals.user?.id) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      if (!apiConfig || !apiConfig.baseUrl) {
        return { success: false, error: 'Missing required fields: apiConfig.baseUrl' };
      }

      // Test the API connection and fetch a preview of posts
      const previewData = await WordPressImportService.previewWordPressAPI(apiConfig, {
        postsPerPage,
        maxPages
      });

      return {
        success: true,
        data: previewData
      };
    } catch (error) {
      console.error('WordPress API preview error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Preview failed'
      };
    }
  }
);

/**
 * Import WordPress content via API
 */
export const importWordPressContent = command(
  'unchecked',
  async (options: {
    collectionSlug: string;
    selectedPostType?: string;
    downloadFiles: boolean;
    createCategories: boolean;
    createTags: boolean;
    skipExistingSlugs: boolean;
    useCurrentUserAsAuthor: boolean;
    statusMapping: Record<string, 'draft' | 'published' | 'archived'>;
    fieldMappings: {
      content: string;
      excerpt: string;
      featured_image: string;
      categories: string;
    };
    apiConfig: WordPressAPIConfig;
  }) => {
    const { locals } = getRequestEvent();

    if (!locals.user?.id) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      if (!options.collectionSlug || !options.apiConfig) {
        return { success: false, error: 'Missing required fields: collectionSlug and apiConfig' };
      }

      // Start the import process - just add currentUserId to the existing options
      const importOptions = {
        ...options,
        currentUserId: locals.user.id
      };

      const result = await WordPressImportService.importFromAPI(importOptions);

      return {
        success: true,
        data: {
          result,
          message: 'Import completed successfully'
        }
      };
    } catch (error) {
      console.error('WordPress import error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Import failed'
      };
    }
  }
);
