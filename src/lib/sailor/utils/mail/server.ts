import { env } from '$env/dynamic/private';
import { log } from 'sailorcms/core/utils/logger';
import { smtpDriver } from './drivers/smtp';
import type { MailDriver, MailMessage } from './types';

export type { MailMessage } from './types';

let resolved: MailDriver | null | undefined;

function resolveDriver(): MailDriver | null {
  if (resolved !== undefined) return resolved;

  const name = (env.MAIL_DRIVER ?? 'smtp').toLowerCase();
  switch (name) {
    case 'smtp':
      resolved = smtpDriver;
      break;
    default:
      log.error(`Unknown MAIL_DRIVER: "${name}"`);
      resolved = null;
  }
  return resolved;
}

export function isMailConfigured(): boolean {
  const driver = resolveDriver();
  return Boolean(driver?.isConfigured());
}

export async function sendMail(msg: MailMessage): Promise<boolean> {
  const driver = resolveDriver();
  if (!driver || !driver.isConfigured()) {
    log.warn('Mail not configured — skipping send', { subject: msg.subject });
    return false;
  }
  return driver.send(msg);
}
