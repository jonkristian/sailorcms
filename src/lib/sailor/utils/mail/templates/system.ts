import { emailLayout, type EmailTemplate } from './layout';

/**
 * Diagnostic email sent from /sailor/settings/mail's "Send test email" button.
 * Lands styled like the rest of the CMS's outbound mail so you can verify both
 * deliverability AND that the layout renders correctly in the recipient's
 * client (light + dark, mobile + desktop).
 */
export function testEmailTemplate(): EmailTemplate {
  const subject = 'Sailor CMS test email';
  const body = `
<h1>Test email</h1>
<p>If you're reading this, outbound mail from Sailor CMS is working correctly.</p>
<p style="font-size: 14px; color: #64748b;">No action needed — you can close this.</p>`;
  return {
    subject,
    html: emailLayout({ body }),
    text: 'If you are reading this, outbound mail from Sailor CMS is working correctly.'
  };
}
