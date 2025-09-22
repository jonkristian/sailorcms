import type { PageServerLoad } from './$types';
import { getDashboardData } from '$lib/sailor/remote/dashboard.remote';

export const load: PageServerLoad = async () => {
  // Use existing remote function that handles its own authorization
  const dashboard = await getDashboardData();

  return {
    dashboard
  };
};
