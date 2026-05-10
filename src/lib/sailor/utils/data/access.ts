import type { AccessRule } from 'sailorcms/core/types';

/**
 * The minimum user shape `assertAccess` cares about. The public read utilities
 * already accept `user?: User | null` from `locals.user`; we only need `id` and
 * `role` here, so this stays decoupled from any specific User type.
 */
type AccessUser = { id: string; role: string } | null | undefined;

/**
 * Thrown when a request fails the access rule on a global or collection.
 * Distinct class so consumers can `try`/`catch` it specifically and render
 * a 403 instead of crashing the page.
 */
export class AccessDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccessDeniedError';
  }
}

/**
 * Enforce a type-level access rule for the public read utilities.
 *
 * Throws `AccessDeniedError` on miss — never returns silently with `[]`.
 * A silent empty result on a forgotten `user:` arg looks like "no rows yet"
 * and ships unnoticed; an explicit error lights up SvelteKit's error
 * boundary in dev and lets consumers catch and render a 403 in prod.
 *
 * @param rule    Access rule from the type definition (`undefined` ⇒ public).
 * @param user    Authenticated user, typically `locals.user`.
 * @param context Human-readable identifier used in error messages, e.g.
 *                `Global 'submissions'`.
 */
export function assertAccess(
  rule: AccessRule | undefined,
  user: AccessUser,
  context: string
): void {
  if (!rule || rule === 'public') return;

  if (!user) {
    throw new AccessDeniedError(
      `${context}: authentication required. Pass { user: locals.user } to the data utility.`
    );
  }

  if (rule === 'authenticated') return;

  if (typeof rule === 'object' && rule !== null) {
    if (rule.roles && rule.roles.length > 0 && !rule.roles.includes(user.role)) {
      throw new AccessDeniedError(
        `${context}: role '${user.role}' is not permitted (allowed: ${rule.roles.join(', ')}).`
      );
    }
  }
}
