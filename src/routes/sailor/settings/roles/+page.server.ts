import { getSettings } from '$lib/sailor/core/settings';
import { m } from '$sailor/i18n';

export const load = async ({ parent }) => {
  // Get shared settings data from layout
  const { settingsData } = await parent();

  // Get complete settings (defaults + template overrides + database overrides)
  const settings = await getSettings();

  // Create header actions for payload preview
  const headerActions = [];
  headerActions.push({
    type: 'payload-preview',
    props: {
      type: 'settings',
      id: 'settings',
      title: m.payload_title_roles(),
      expandedCategory: 'roles',
      initialPayload: settingsData
    }
  });

  return {
    roleSettings: settings.roles,
    headerActions
  };
};
