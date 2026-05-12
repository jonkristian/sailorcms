import { env } from '$env/dynamic/private';
import { log } from 'sailorcms/core/utils/logger';
import { SystemSettingsService } from 'sailorcms/core/services/settings.server';
import { smtpDriver } from './drivers/smtp';
import { gmailDriver } from './drivers/gmail';
import type { MailDriver, MailMessage, MailOAuthRequirement, SendResult } from './types';

export type { MailMessage, MailOAuthRequirement, SendResult } from './types';

// Every driver the CMS knows about. Single source of truth — UI code (settings
// page, account sidebar) asks this list rather than branching on provider names.
const DRIVERS_BY_NAME: Record<string, MailDriver> = {
  smtp: smtpDriver,
  gmail: gmailDriver
};

/** Driver names available for selection in the settings UI. */
export function getMailDriverNames(): string[] {
  return Object.keys(DRIVERS_BY_NAME);
}

let resolved: MailDriver | null | undefined;

/**
 * Resolve the active driver. Source of truth ordering:
 *   1. `mail.driver` system setting (admin choice via /sailor/settings/mail)
 *   2. `MAIL_DRIVER` env var (deployment-level default)
 *   3. `'smtp'` fallback
 */
async function resolveDriver(): Promise<MailDriver | null> {
  if (resolved !== undefined) return resolved;

  const settingValue = await SystemSettingsService.getSetting('mail.driver').catch(() => null);
  const name = (settingValue ?? env.MAIL_DRIVER ?? 'smtp').toLowerCase();

  const driver = DRIVERS_BY_NAME[name];
  if (!driver) {
    log.error(`Unknown mail driver: "${name}"`);
    resolved = null;
    return resolved;
  }
  resolved = driver;
  return resolved;
}

/** Invalidate the driver cache. Call after writing `mail.driver` to settings. */
export function clearMailDriverCache(): void {
  resolved = undefined;
}

/** All OAuth requirements declared by registered mail drivers. */
export function getMailOAuthRequirements(): MailOAuthRequirement[] {
  return Object.values(DRIVERS_BY_NAME)
    .map((d) => d.oauthRequirement)
    .filter((r): r is MailOAuthRequirement => !!r);
}

/** OAuth requirement (if any) for a given driver name. */
export function getMailOAuthRequirementFor(driverName: string): MailOAuthRequirement | null {
  return DRIVERS_BY_NAME[driverName]?.oauthRequirement ?? null;
}

/**
 * Given an account row from the `account` table, classifies what the linked
 * account is being used for. A scope is "mail-purpose" iff a registered mail
 * driver claims it; any other scope is treated as sign-in (identity).
 */
export function getAccountPurposes(row: { provider_id: string; scope: string | null }): {
  signIn: boolean;
  mail: boolean;
  mailScope: string | null;
} {
  // Better Auth stores `account.scope` as a comma-delimited string (not the
  // OAuth-standard space-delimited form), so we split on both to be safe.
  const scopes = (row.scope || '').split(/[\s,]+/).filter(Boolean);
  const mailScopesForProvider = getMailOAuthRequirements()
    .filter((r) => r.providerId === row.provider_id)
    .map((r) => r.scope);

  const matchedMailScope = scopes.find((s) => mailScopesForProvider.includes(s)) ?? null;
  const hasNonMailScope = scopes.some((s) => !mailScopesForProvider.includes(s));

  return {
    mail: matchedMailScope !== null,
    // An account row with zero scopes (rare) is treated as sign-in by default.
    signIn: hasNonMailScope || scopes.length === 0,
    mailScope: matchedMailScope
  };
}

export async function isMailConfigured(): Promise<boolean> {
  const driver = await resolveDriver();
  return Boolean(driver?.isConfigured());
}

export async function sendMail(msg: MailMessage): Promise<SendResult> {
  const driver = await resolveDriver();
  if (!driver || !driver.isConfigured()) {
    log.warn('Mail not configured — skipping send', { subject: msg.subject });
    return { ok: false, error: 'Mail not configured' };
  }
  return driver.send(msg);
}
