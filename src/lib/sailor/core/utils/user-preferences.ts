// Per-user UI/format preferences. Stored as a JSON string in `users.preferences`
// (text column) so future preferences can be added as new keys with no schema
// change. All keys are optional; consumers should always pass a default.

export interface UserPreferences {
  /**
   * Admin UI language. Either a Paraglide locale (`'en'`, `'nb-NO'`, …) or
   * `'auto'` to follow the browser's `Accept-Language` header. Stored
   * separately from `date_format` so date formatting can use a different
   * regional locale than the UI strings.
   */
  language?: string;
  /**
   * BCP-47 locale used by date helpers. Either a regional locale
   * (`'en-US'`, `'nb-NO'`, `'de-DE'`, …) or `'auto'` to follow `language`.
   */
  date_format?: string;
  // Future: theme override, default landing page, density, etc.
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  language: 'auto',
  date_format: 'auto'
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
