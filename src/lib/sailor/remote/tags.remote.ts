// Global remote functions for tag management across different contexts
import { command, getRequestEvent } from '$app/server';
import { TagService } from '$sailor/core/services/tag.server';

/**
 * Add tags to an entity (file, collection item, etc.)
 */
export const addEntityTags = command(
  'unchecked',
  async ({
    entityType,
    entityId,
    tags
  }: {
    entityType: string; // e.g., 'file', 'global_menus', 'collection_posts'
    entityId: string;
    tags: string[];
  }) => {
    if (!entityType || !entityId || !Array.isArray(tags) || tags.length === 0) {
      return { success: false, error: 'Entity type, ID, and tags are required' };
    }

    try {
      // Get current tags and add new ones (without removing existing)
      const currentTags = await TagService.getTagsForEntity(entityType, entityId);
      const currentTagNames = currentTags.map((tag) => tag.name);
      const allTagNames = [...new Set([...currentTagNames, ...tags])]; // Deduplicate

      // Use tagEntity to replace all tags (current + new)
      await TagService.tagEntity(entityType, entityId, allTagNames);

      const message =
        tags.length === 1
          ? `Tag "${tags[0]}" added successfully`
          : `${tags.length} tags added successfully`;

      return { success: true, message, addedTags: tags };
    } catch (error) {
      console.error('Failed to add tags:', error);
      return { success: false, error: 'Failed to add tags' };
    }
  }
);

/**
 * Remove tags from an entity
 */
export const removeEntityTags = command(
  'unchecked',
  async ({
    entityType,
    entityId,
    tags
  }: {
    entityType: string;
    entityId: string;
    tags: string[];
  }) => {
    if (!entityType || !entityId || !Array.isArray(tags) || tags.length === 0) {
      return { success: false, error: 'Entity type, ID, and tags are required' };
    }

    try {
      // Get current tags and remove specified ones
      const currentTags = await TagService.getTagsForEntity(entityType, entityId);
      const currentTagNames = currentTags.map((tag) => tag.name);
      const remainingTagNames = currentTagNames.filter((name) => !tags.includes(name));

      // Use tagEntity to set the remaining tags
      await TagService.tagEntity(entityType, entityId, remainingTagNames);

      const message =
        tags.length === 1
          ? `Tag "${tags[0]}" removed successfully`
          : `${tags.length} tags removed successfully`;

      return { success: true, message, removedTags: tags };
    } catch (error) {
      console.error('Failed to remove tags:', error);
      return { success: false, error: 'Failed to remove tags' };
    }
  }
);

/**
 * Replace all tags for an entity
 */
export const replaceEntityTags = command(
  'unchecked',
  async ({
    entityType,
    entityId,
    tags
  }: {
    entityType: string;
    entityId: string;
    tags: string[];
  }) => {
    if (!entityType || !entityId || !Array.isArray(tags)) {
      return { success: false, error: 'Entity type, ID, and tags are required' };
    }

    try {
      // Use tagEntity to replace all tags - this method handles clearing and adding
      await TagService.tagEntity(entityType, entityId, tags);

      const message =
        tags.length === 0
          ? 'All tags removed successfully'
          : tags.length === 1
            ? `Tag replaced with "${tags[0]}" successfully`
            : `Tags replaced with ${tags.length} new tags successfully`;

      return { success: true, message, replacedTags: tags };
    } catch (error) {
      console.error('Failed to replace tags:', error);
      return { success: false, error: 'Failed to replace tags' };
    }
  }
);

/**
 * Get all available tags (for autocomplete, etc.)
 */
export const getAvailableTags = command('unchecked', async () => {
  try {
    const tags = await TagService.getAllTags();
    return { success: true, tags };
  } catch (error) {
    console.error('Failed to get tags:', error);
    return { success: false, error: 'Failed to get tags' };
  }
});

/**
 * Delete a tag
 */
export const deleteTag = command('unchecked', async ({ tagId }: { tagId: string }) => {
  const { locals } = getRequestEvent();

  // Authentication handled by hooks - admin check required for tag deletion
  if (locals.user!.role !== 'admin') {
    return { success: false, error: 'Admin access required' };
  }

  if (!tagId) {
    return { success: false, error: 'Valid tag ID is required' };
  }

  try {
    await TagService.deleteTag(tagId);
    return {
      success: true,
      message: 'Tag deleted successfully'
    };
  } catch (error) {
    console.error('Failed to delete tag:', error);
    return { success: false, error: 'Failed to delete tag' };
  }
});

/**
 * Get all tags with usage count
 */
export const getAllTagsWithUsage = command('unchecked', async () => {
  try {
    const tags = await TagService.getAllTagsWithUsage();
    return { success: true, tags };
  } catch (error) {
    console.error('Failed to get tags with usage:', error);
    return { success: false, error: 'Failed to get tags with usage' };
  }
});

/**
 * Search tags by query
 */
export const searchTags = command(
  'unchecked',
  async ({ query, limit = 10, scope }: { query: string; limit?: number; scope?: string }) => {
    try {
      const tags = await TagService.searchTags(query, limit, scope);
      return { success: true, tags };
    } catch (error) {
      console.error('Failed to search tags:', error);
      return { success: false, error: 'Failed to search tags' };
    }
  }
);
