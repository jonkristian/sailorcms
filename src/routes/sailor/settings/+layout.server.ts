import { SystemSettingsService } from '$sailor/core/services/system-settings.server';
import { tryParseJson } from '$sailor/core/utils/common';

export const load = async () => {
  // Get raw settings data for payload preview - shared across all settings pages
  const allSettings = await SystemSettingsService.getAllSettings();

  // Group settings by category for better organization
  const settingsData: Record<string, any> = {};

  for (const setting of allSettings) {
    const category = setting.category || 'uncategorized';

    if (!settingsData[category]) {
      settingsData[category] = {};
    }

    settingsData[category][setting.key] = {
      value: tryParseJson(setting.value),
      source: setting.source
    };
  }

  return {
    settingsData
  };
};
