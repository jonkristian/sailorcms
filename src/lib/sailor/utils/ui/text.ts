/**
 * Pick singular or plural based on count. Handles `count === 1` only —
 * languages with more elaborate plural rules (Russian, Arabic, etc.) need
 * Inlang's variant matching at the message level instead.
 */
export function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}
