import { env } from '$env/dynamic/private';

export interface VerifyTurnstileResult {
  success: boolean;
  errorCodes?: string[];
}

/**
 * Verify a Cloudflare Turnstile token against the siteverify endpoint.
 * Returns `{ success: true }` when `TURNSTILE_SECRET_KEY` is unset, so consumer
 * code can call this unconditionally — the gate becomes a no-op in dev.
 */
export async function verifyTurnstileToken(
  token: string | undefined | null,
  remoteIp?: string
): Promise<VerifyTurnstileResult> {
  if (!env.TURNSTILE_SECRET_KEY) {
    return { success: true };
  }

  if (!token) {
    return { success: false, errorCodes: ['missing-input-response'] };
  }

  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: env.TURNSTILE_SECRET_KEY,
        response: token,
        ...(remoteIp && { remoteip: remoteIp })
      })
    });
    const data = (await res.json()) as { success: boolean; 'error-codes'?: string[] };
    return {
      success: data.success === true,
      errorCodes: data['error-codes']
    };
  } catch {
    return { success: false, errorCodes: ['unknown-error'] };
  }
}
