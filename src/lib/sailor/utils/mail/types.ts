export type MailMessage = {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
};

export interface MailDriver {
  send(msg: MailMessage): Promise<boolean>;
  isConfigured(): boolean;
}
