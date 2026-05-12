/**
 * Helpers for reading identity info out of Better Auth's stored OAuth account
 * rows. ID tokens are JWTs whose payload contains the verified email claim
 * when the provider's identity scopes (`openid`/`email`) were granted; we
 * decode the payload directly without signature verification since the token
 * was already validated by Better Auth's OAuth flow when it was stored.
 */

/** Decode a JWT payload, returning `null` for any malformed input. */
function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  const parts = jwt.split('.');
  if (parts.length < 2) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
  } catch {
    return null;
  }
}

/**
 * Returns the provider-side email associated with an OAuth account row
 * (e.g. the actual `@gmail.com` address linked, which may differ from the
 * sailorcms user's login email). Returns `null` if the row has no id_token
 * or the token doesn't carry an `email` claim.
 */
export function getAccountProviderEmail(idToken: string | null | undefined): string | null {
  if (!idToken) return null;
  const payload = decodeJwtPayload(idToken);
  const email = payload?.email;
  return typeof email === 'string' ? email : null;
}
