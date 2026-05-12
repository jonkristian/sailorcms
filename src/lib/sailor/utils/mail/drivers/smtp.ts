import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '$env/dynamic/private';
import { log } from 'sailorcms/core/utils/logger';
import type { MailDriver, MailMessage } from '../types';

let transport: Transporter | null = null;

function isConfigured(): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_FROM);
}

function getTransport(): Transporter | null {
  if (!isConfigured()) return null;
  if (transport) return transport;

  const port = env.SMTP_PORT ? Number(env.SMTP_PORT) : 587;
  transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port,
    secure: env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : port === 465,
    auth: env.SMTP_USER && env.SMTP_PASS ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined
  });
  return transport;
}

async function send(msg: MailMessage): Promise<boolean> {
  const t = getTransport();
  if (!t) return false;
  try {
    await t.sendMail({
      from: env.SMTP_FROM,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
      replyTo: msg.replyTo
    });
    return true;
  } catch (err) {
    log.error('SMTP send failed', { subject: msg.subject }, err as Error);
    return false;
  }
}

export const smtpDriver: MailDriver = { send, isConfigured };
