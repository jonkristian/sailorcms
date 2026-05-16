import { emailLayout, type EmailTemplate } from './layout';

export interface TestEmailStrings {
  subject?: string;
  heading?: string;
  body1?: string;
  body2?: string;
}

/**
 * Diagnostic email sent from /sailor/settings/mail's "Send test email" button.
 * Lands styled like the rest of the CMS's outbound mail so you can verify both
 * deliverability AND that the layout renders correctly in the recipient's
 * client (light + dark, mobile + desktop).
 */
export function testEmailTemplate({
  subject = 'Sailor CMS test email',
  heading = 'Test email',
  body1 = "If you're reading this, outbound mail from Sailor CMS is working correctly.",
  body2 = 'No action needed — you can delete this.'
}: TestEmailStrings = {}): EmailTemplate {
  const body = `
<h1>${heading}</h1>
<p>${body1}</p>
<p style="font-size: 14px; color: #64748b;">${body2}</p>`;
  return {
    subject,
    html: emailLayout({ body, subject }),
    text: body1
  };
}
