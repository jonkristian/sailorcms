import type { PageServerLoad } from './$types';
import { globalDefinitions } from '$sailor/templates/globals';

export const load: PageServerLoad = async () => {
  return {
    globals: Object.entries(globalDefinitions).map(([key, global]) => ({
      key,
      ...global
    }))
  };
};
