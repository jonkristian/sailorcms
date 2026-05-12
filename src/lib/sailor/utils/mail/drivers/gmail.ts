import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import { env } from '$env/dynamic/private';
import { and, eq, like } from 'drizzle-orm';
import { db, accounts } from 'sailorcms/core/db/index.server';
import { log } from 'sailorcms/core/utils/logger';
import { SystemSettingsService } from 'sailorcms/core/services/settings.server';
import type { MailDriver, MailMessage, SendResult } from '../types';

export const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const SEND_ENDPOINT = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const TOKEN_REFRESH_BUFFER_MS = 60_000;

function isConfigured(): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

async function findGmailAccount() {
  // Prefer the admin-chosen sender from settings; fall back to first match so
  // a single-admin install works without ever opening the settings page.
  const preferredId = await SystemSettingsService.getSetting('mail.sender_account_id').catch(
    () => null
  );
  if (preferredId) {
    const [picked] = await db
      .select()
      .from(accounts)
      .where(
        and(
          eq(accounts.id, preferredId),
          eq(accounts.provider_id, 'google'),
          like(accounts.scope, `%${GMAIL_SEND_SCOPE}%`)
        )
      )
      .limit(1);
    if (picked) return picked;
    // Configured account no longer exists or lost its scope — fall through.
  }

  const rows = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.provider_id, 'google'), like(accounts.scope, `%${GMAIL_SEND_SCOPE}%`)))
    .limit(1);
  return rows[0];
}

type TokenResult = { ok: true; token: string } | { ok: false; error: string };

async function getAccessToken(): Promise<TokenResult> {
  const account = await findGmailAccount();
  if (!account) {
    return {
      ok: false,
      error: 'No Google account with gmail.send scope is connected. Connect one in /sailor/account.'
    };
  }
  if (!account.refresh_token) {
    return {
      ok: false,
      error: 'Connected Google account has no refresh_token — reconnect it.'
    };
  }

  const expiresAt = account.access_token_expires_at
    ? new Date(account.access_token_expires_at).getTime()
    : 0;
  if (account.access_token && expiresAt > Date.now() + TOKEN_REFRESH_BUFFER_MS) {
    return { ok: true, token: account.access_token };
  }

  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      refresh_token: account.refresh_token,
      grant_type: 'refresh_token'
    })
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    log.error('Gmail driver: token refresh failed', { status: res.status, detail });
    return {
      ok: false,
      error: `Token refresh failed (${res.status}): ${detail || res.statusText}`
    };
  }

  const { access_token, expires_in } = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  await db
    .update(accounts)
    .set({
      access_token,
      access_token_expires_at: new Date(Date.now() + expires_in * 1000),
      updated_at: new Date()
    })
    .where(eq(accounts.id, account.id));

  return { ok: true, token: access_token };
}

async function buildRawMessage(msg: MailMessage): Promise<string> {
  const composer = new MailComposer({
    to: msg.to,
    subject: msg.subject,
    text: msg.text,
    html: msg.html,
    replyTo: msg.replyTo
  });
  const raw = await composer.compile().build();
  return raw.toString('base64url');
}

function extractGoogleError(detail: string, fallback: string): string {
  try {
    const parsed = JSON.parse(detail) as { error?: { message?: string } };
    if (parsed?.error?.message) return parsed.error.message;
  } catch {
    // not JSON — fall through
  }
  return detail || fallback;
}

async function send(msg: MailMessage): Promise<SendResult> {
  const token = await getAccessToken();
  if (!token.ok) return { ok: false, error: token.error };

  try {
    const raw = await buildRawMessage(msg);
    const res = await fetch(SEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ raw })
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      log.error('Gmail send failed', { subject: msg.subject, status: res.status, detail });
      return {
        ok: false,
        error: extractGoogleError(detail, `Gmail API responded ${res.status}`)
      };
    }
    // Gmail's `users.messages.send` returns `{ id, threadId, labelIds }`. The
    // `id` is what subsequent Gmail API calls (e.g. fetching the sent message)
    // use, so keep it as our message-id for parity with SMTP's envelope id.
    const json = (await res.json().catch(() => null)) as { id?: string } | null;
    return { ok: true, messageId: json?.id };
  } catch (err) {
    const error = (err as Error)?.message ?? String(err);
    log.error('Gmail send failed', { subject: msg.subject }, err as Error);
    return { ok: false, error };
  }
}

export const gmailDriver: MailDriver = {
  send,
  isConfigured,
  oauthRequirement: {
    providerId: 'google',
    scope: GMAIL_SEND_SCOPE
  }
};
