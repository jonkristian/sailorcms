import { and, eq, like } from 'drizzle-orm';
import { db, accounts } from 'sailorcms/core/db/index.server';
import { log } from 'sailorcms/core/utils/logger';
import { SystemSettingsService } from 'sailorcms/core/services/settings.server';
import { recordMailEvent } from 'sailorcms/core/services/mail-events.server';
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

/**
 * Whether `name` has its env-level prerequisites met (e.g. Gmail driver
 * needs `GOOGLE_CLIENT_ID`/`SECRET`). Used by admin UI to hide drivers that
 * can't possibly work in the current deployment — sender-account presence
 * is a separate, post-config concern handled at the page level.
 */
export function isMailDriverConfigured(name: string): boolean {
  return Boolean(DRIVERS_BY_NAME[name]?.isConfigured());
}

let resolved: MailDriver | null | undefined;

/**
 * Resolve the active driver. Source of truth:
 *   1. `mail.driver` system setting (admin choice via /sailor/settings/mail)
 *   2. `'smtp'` fallback for a fresh install
 *
 * No env-var override — driver choice is UI-driven, the settings page only
 * surfaces drivers whose env prerequisites are already met (or that need no
 * env at all). A future env-only driver (Sendgrid/Mailgun via API key) could
 * reintroduce an env override here if it's worth the config surface.
 */
async function resolveDriver(): Promise<MailDriver | null> {
  if (resolved !== undefined) return resolved;

  const settingValue = await SystemSettingsService.getSetting('mail.driver').catch(() => null);
  const name = (settingValue ?? 'smtp').toLowerCase();

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

/**
 * OAuth requirements only for drivers whose env prerequisites are met. The
 * /sailor/account "Connect …" CTAs use this — there's no point offering a
 * link flow when the underlying driver can't authenticate. Distinct from
 * `getMailOAuthRequirements()`, which stays "full" so historical scope
 * classification in `getAccountPurposes` survives env changes.
 */
export function getAvailableMailOAuthRequirements(): MailOAuthRequirement[] {
  return Object.values(DRIVERS_BY_NAME)
    .filter((d) => d.isConfigured())
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

/**
 * Whether the active mail config can actually send right now — stricter than
 * `isMailConfigured()`. For OAuth-based drivers, also verifies that a sender
 * account exists (the chosen one if `mail.sender_account_id` is set, else any
 * account with the required scope). This is what drives the global "mail
 * unavailable" sidebar banner, so it catches:
 *   - env vars removed after the driver was selected
 *   - admin unlinked the account being used for sending
 *   - refresh token revoked on the provider side (still rare — only DB-level
 *     state is checked here, not actual token health)
 */
export async function isMailHealthy(): Promise<boolean> {
  const driver = await resolveDriver();
  if (!driver?.isConfigured()) return false;

  const req = driver.oauthRequirement;
  if (!req) return true;

  const preferredId = await SystemSettingsService.getSetting('mail.sender_account_id').catch(
    () => null
  );
  if (preferredId) {
    const [picked] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(
        and(
          eq(accounts.id, preferredId),
          eq(accounts.provider_id, req.providerId),
          like(accounts.scope, `%${req.scope}%`)
        )
      )
      .limit(1);
    if (picked) return true;
    // Preferred account is stale (deleted or lost scope). Fall through to the
    // "any candidate" check so a single-admin install still works without
    // visiting the settings page after a reconnect.
  }
  const [anyCandidate] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.provider_id, req.providerId), like(accounts.scope, `%${req.scope}%`)))
    .limit(1);
  return !!anyCandidate;
}

/**
 * Drive the active driver without recording an event. Used by retry flows
 * which update an existing event row in place instead of inserting a new one.
 * Returns the driver result plus the resolved driver name for the caller to
 * record alongside.
 */
export async function dispatchMail(
  msg: MailMessage
): Promise<{ result: SendResult; driverName: string }> {
  const driverName = (
    (await SystemSettingsService.getSetting('mail.driver').catch(() => null)) ?? 'smtp'
  ).toLowerCase();
  const driver = await resolveDriver();
  if (!driver || !driver.isConfigured()) {
    log.warn('Mail not configured — skipping send', { subject: msg.subject });
    return { result: { ok: false, error: 'Mail not configured' }, driverName };
  }
  return { result: await driver.send(msg), driverName };
}

export async function sendMail(
  msg: MailMessage,
  opts: { actorUserId?: string | null } = {}
): Promise<SendResult> {
  // First send → insert a new event row. Retries are routed through
  // `dispatchMail` + `updateMailEventOnReplay` instead, so an email's lifecycle
  // stays on one row and the outbox "failed" counter reflects current state.
  const toAddress = Array.isArray(msg.to) ? msg.to.join(', ') : msg.to;
  const { result, driverName } = await dispatchMail(msg);

  const recordBase = {
    driver: driverName,
    to_address: toAddress,
    subject: msg.subject,
    body_text: msg.text ?? null,
    body_html: msg.html ?? null,
    user_id: opts.actorUserId ?? null
  };

  // Event recording is best-effort: a logging failure must never mask the
  // actual mail send result, so the insert is `.catch`-swallowed.
  if (result.ok) {
    await recordMailEvent({
      ...recordBase,
      status: 'sent',
      message_id: result.messageId ?? null
    }).catch((e) => log.error('mail_events insert failed', { subject: msg.subject }, e as Error));
  } else {
    await recordMailEvent({
      ...recordBase,
      status: 'failed',
      error_message: result.error
    }).catch((e) => log.error('mail_events insert failed', { subject: msg.subject }, e as Error));
  }
  return result;
}
