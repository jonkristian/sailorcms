export type MailMessage = {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
};

export type SendResult = { ok: true; messageId?: string } | { ok: false; error: string };

export type MailOAuthRequirement = {
  /** Matches Better Auth's `account.provider_id`. */
  providerId: string;
  /** The exact scope this driver requires on the linked account. */
  scope: string;
};

export interface MailDriver {
  send(msg: MailMessage): Promise<SendResult>;
  isConfigured(): boolean;
  /** Drivers that send via an OAuth-linked account declare what they need
   *  so the CMS can attribute purposes to account rows and generate
   *  "Connect" CTAs without hardcoding provider names anywhere. */
  oauthRequirement?: MailOAuthRequirement;
}
