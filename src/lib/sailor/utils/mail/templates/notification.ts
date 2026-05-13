import { emailLayout, infoBox, infoRow, sectionHeading, type EmailTemplate } from './layout';

export interface SubmissionNotificationInput {
  /** Email subject; also rendered as the H1 in the body. */
  title: string;
  /** Labeled value pairs rendered as a single infoBox — e.g. `[{ label: 'Name', value: 'Jane' }]`. */
  rows: Array<{ label: string; value: string }>;
  /** Optional free-form body text (e.g. the contact form's "message" field). Newlines become `<br>`. */
  message?: string;
  /** Optional small note rendered in the email footer (e.g. "Reply directly to respond"). */
  footerNote?: string;
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/**
 * Generic "submission received" notification — labeled rows + optional message
 * body. The right shape for contact forms, form-style globals, and any other
 * user-submitted-data notification.
 *
 * All input strings are HTML-escaped, so it's safe to pass raw user input
 * straight from a form payload.
 */
export function submissionNotificationTemplate(input: SubmissionNotificationInput): EmailTemplate {
  const { title, rows, message, footerNote } = input;

  const rowsHtml = rows
    .map(({ label, value }) => infoRow(escapeHtml(label), escapeHtml(value)))
    .join('');
  const messageHtml = message
    ? `<p style="margin: .4em 0 1.1875em; font-size: 16px; line-height: 1.625; color: #475569;">${escapeHtml(message).replace(/\n/g, '<br>')}</p>`
    : '';
  const body = `
<h1>${escapeHtml(title)}</h1>
${sectionHeading('Submission')}
${infoBox(rowsHtml)}
${messageHtml}`;

  const footerText = footerNote
    ? `<p style="line-height: 1.625; font-size: 12px !important; color: #64748b !important; text-align: center !important; margin: 0.4em 0 !important;">${escapeHtml(footerNote)}</p>`
    : undefined;

  const html = emailLayout({ body, footerText });
  const textRows = rows.map(({ label, value }) => `${label}: ${value}`).join('\n');
  const text = [
    title,
    '',
    textRows,
    message ? '\n' + message : '',
    footerNote ? '\n' + footerNote : ''
  ]
    .join('\n')
    .trim();

  return { subject: title, html, text };
}
