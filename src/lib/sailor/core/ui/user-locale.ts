// Client-side accessor for the current user's preferred locale (BCP-47).
// Reads from `page.data.user.preferences` (a JSON string already loaded by
// the admin layout) and falls back to the default. Use this in components
// that pass a locale into date helpers, so per-user format preferences are
// honoured everywhere.

import { page } from '$app/state';
import {
  resolvePreferences,
  DEFAULT_PREFERENCES,
  type UserPreferences
} from '$sailor/core/utils/user-preferences';

export function getUserLocale(): string {
  // Tolerate both wire shapes — some routes pre-parse `preferences` into an
  // object before serving, others pass through the raw JSON string from the
  // user row. `resolvePreferences` accepts either.
  const raw = (page.data?.user as { preferences?: string | UserPreferences } | undefined)
    ?.preferences;
  return resolvePreferences(raw).date_format ?? DEFAULT_PREFERENCES.date_format ?? 'en-US';
}
