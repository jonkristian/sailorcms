import { emailButton, emailLayout, type EmailTemplate } from './layout';

/**
 * Strings rendered in the auth email body. All optional — defaults are
 * English. Internal callers (`core/auth.server.ts`) thread paraglide messages
 * through so the email matches the requesting user's locale; consumer code
 * can do the same with its own i18n source.
 */
export interface AuthEmailStrings {
  subject?: string;
  heading?: string;
  intro?: string;
  cta?: string;
  fallbackLine?: string;
}

export function passwordResetTemplate({
  url,
  subject = 'Reset your password',
  heading = 'Reset your password',
  intro = "Someone — hopefully you — requested a password reset. Click the button below to choose a new password. If this wasn't you, just ignore this email; your account is safe.",
  cta = 'Reset password',
  fallbackLine = "If the button doesn't work, paste this link into your browser:"
}: { url: string } & AuthEmailStrings): EmailTemplate {
  const body = `
<h1>${heading}</h1>
<p>${intro}</p>
${emailButton(cta, url)}
<p style="font-size: 14px; color: #64748b;">${fallbackLine}<br><a href="${url}" style="word-break: break-all;">${url}</a></p>`;
  return {
    subject,
    html: emailLayout({ body, subject }),
    text: `${heading}: ${url}`
  };
}

export function emailVerificationTemplate({
  url,
  subject = 'Verify your email',
  heading = 'Verify your email',
  intro = 'Click the button below to confirm your email address and finish setting up your account.',
  cta = 'Verify email',
  fallbackLine = "If the button doesn't work, paste this link into your browser:"
}: { url: string } & AuthEmailStrings): EmailTemplate {
  const body = `
<h1>${heading}</h1>
<p>${intro}</p>
${emailButton(cta, url)}
<p style="font-size: 14px; color: #64748b;">${fallbackLine}<br><a href="${url}" style="word-break: break-all;">${url}</a></p>`;
  return {
    subject,
    html: emailLayout({ body, subject }),
    text: `${heading}: ${url}`
  };
}
