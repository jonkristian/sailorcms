import { emailButton, emailLayout, type EmailTemplate } from './layout';

export function passwordResetTemplate({ url }: { url: string }): EmailTemplate {
  const subject = 'Reset your password';
  const body = `
<h1>Reset your password</h1>
<p>Someone — hopefully you — requested a password reset. Click the button below to choose a new password. If this wasn't you, just ignore this email; your account is safe.</p>
${emailButton('Reset password', url)}
<p style="font-size: 14px; color: #64748b;">If the button doesn't work, paste this link into your browser:<br><a href="${url}" style="word-break: break-all;">${url}</a></p>`;
  return {
    subject,
    html: emailLayout({ body }),
    text: `Reset your password: ${url}`
  };
}

export function emailVerificationTemplate({ url }: { url: string }): EmailTemplate {
  const subject = 'Verify your email';
  const body = `
<h1>Verify your email</h1>
<p>Click the button below to confirm your email address and finish setting up your account.</p>
${emailButton('Verify email', url)}
<p style="font-size: 14px; color: #64748b;">If the button doesn't work, paste this link into your browser:<br><a href="${url}" style="word-break: break-all;">${url}</a></p>`;
  return {
    subject,
    html: emailLayout({ body }),
    text: `Verify your email: ${url}`
  };
}
