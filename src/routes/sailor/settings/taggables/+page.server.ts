import type { PageServerLoad } from './$types';
import { TagService } from 'sailorcms/core/services/tag.server';
import { log } from 'sailorcms/core/utils/logger';

export const load: PageServerLoad = async () => {
  try {
    // Use service directly in load function since remote functions can't be called during SSR
    const tags = await TagService.getAllTagsWithUsage();

    return {
      tags
    };
  } catch (error) {
    log.error('Failed to load tags', {}, error as Error);
    return {
      tags: []
    };
  }
};
