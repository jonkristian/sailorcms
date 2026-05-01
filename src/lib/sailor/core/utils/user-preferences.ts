// Per-user UI/format preferences. Stored as a JSON string in `users.preferences`
// (text column) so future preferences can be added as new keys with no schema
// change. All keys are optional; consumers should always pass a default.

export interface UserPreferences {
  /** BCP-47 locale used by date helpers when no override is supplied. */
  date_format?: string;
  // Future: theme override, default landing page, density, etc.
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  date_format: 'en-US'
};

export function parsePreferences(
  raw: string | UserPreferences | null | undefined
): UserPreferences {
  if (!raw) return {};
  // Tolerate both shapes — server loads sometimes return the raw JSON string
  // straight from the column, sometimes pre-parse for convenience.
  if (typeof raw === 'object') return raw as UserPreferences;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as UserPreferences) : {};
  } catch {
    return {};
  }
}

export function mergePreferences(
  current: UserPreferences,
  patch: Partial<UserPreferences>
): UserPreferences {
  return { ...current, ...patch };
}

export function resolvePreferences(
  raw: string | UserPreferences | null | undefined
): UserPreferences {
  return { ...DEFAULT_PREFERENCES, ...parsePreferences(raw) };
}
