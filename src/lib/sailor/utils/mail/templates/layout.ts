/**
 * Generic HTML email layout — Inter font, indigo accent, mobile breakpoint
 * and a working `prefers-color-scheme: dark` block. Inline-styled because
 * email clients ignore stylesheets in `<head>` (the embedded `<style>` block
 * is for the clients that DO honor it, e.g. Apple Mail's dark mode).
 *
 * Consumers can pass `footerText` to override the default footer markup.
 */

const STYLES = `
@import url("https://fonts.googleapis.com/css?family=Inter:400,700&display=swap");

body {
  width: 100% !important;
  height: 100%;
  margin: 0;
  -webkit-text-size-adjust: none;
  background-color: #f8fafc;
}

a { color: #4f46e5; }
a img { border: none; }
td { word-break: break-word; }

body, td, th {
  font-family: "Inter", Helvetica, Arial, sans-serif;
  font-size: 16px;
}

h1 {
  margin-top: 0;
  color: #0f172a;
  font-size: 22px;
  font-weight: bold;
  text-align: left;
}

h2 {
  margin-top: 0;
  color: #0f172a;
  font-size: 18px;
  font-weight: bold;
  text-align: left;
}

td, th { font-size: 16px; }

p {
  margin: .4em 0 1.1875em;
  font-size: 16px;
  line-height: 1.625;
  color: #475569;
}

.btn,
a.btn {
  background-color: #4f46e5 !important;
  border: solid 1px #4f46e5 !important;
  border-radius: 12px;
  box-sizing: border-box;
  color: #ffffff !important;
  cursor: pointer;
  font-size: 16px;
  font-weight: bold;
  margin: 0;
  padding: 16px 25px;
  text-decoration: none !important;
  text-transform: capitalize;
  text-align: center !important;
  display: block !important;
  width: 100% !important;
}

.section-label {
  margin: 0 0 8px 0;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
}

.data-cell {
  padding: 16px;
  background-color: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}

.data-cell p {
  margin: 0 0 4px 0;
  font-size: 14px;
  line-height: 1.5;
  color: #0f172a;
}

.data-cell p:last-child {
  margin-bottom: 0;
}

.data-label {
  color: #64748b;
}

.email-wrapper {
  width: 100%;
  margin: 0;
  padding: 0;
  background-color: #f8fafc;
}

.email-content {
  width: 100%;
  margin: 0;
  padding: 0;
}

.email-body_inner {
  width: 640px;
  margin: 0 auto;
  padding: 30px !important;
  background-color: #ffffff;
}

.email-footer {
  width: 640px;
  margin: 0 auto;
  padding: 0;
  text-align: center;
}

.email-footer p {
  color: #64748b;
  font-size: 12px !important;
}

.email-footer a {
  color: #64748b !important;
  font-size: 12px !important;
  text-decoration: underline;
}

.content-cell {
  padding: 30px !important;
}

.body-sub {
  width: 100%;
  margin: 40px 0 0;
  padding-top: 20px;
  border-top: 1px solid #ECEDEE;
}

@media only screen and (max-width: 700px) {
  .email-body_inner,
  .email-footer {
    width: 100% !important;
  }
  .email-body_inner {
    padding: 0 !important;
  }
  .content-cell {
    padding: 16px 4px !important;
  }
  .data-cell {
    padding: 10px !important;
  }
}

@media (prefers-color-scheme: dark) {
  body,
  .email-wrapper,
  .email-body,
  .email-content,
  .email-footer {
    background-color: #0f172a !important;
  }
  .email-footer .content-cell,
  .email-footer td {
    background-color: #0f172a !important;
  }
  .email-body_inner {
    background-color: #1e293b !important;
  }
  td, span {
    color: #e2e8f0 !important;
  }
  h1, h2, h3 {
    color: #f1f5f9 !important;
  }
  .content-cell p {
    color: #e2e8f0 !important;
  }
  a {
    color: #818cf8 !important;
  }
  .btn,
  a.btn {
    background-color: #818cf8 !important;
    border-color: #818cf8 !important;
    color: #ffffff !important;
  }
  .data-cell {
    background-color: #0f172a !important;
    border-color: #334155 !important;
  }
  .data-cell p {
    color: #e2e8f0 !important;
  }
  .data-label {
    color: #94a3b8 !important;
  }
  .section-label {
    color: #94a3b8 !important;
  }
  .email-footer p {
    color: #94a3b8 !important;
  }
  .email-footer a {
    color: #CCCCCC !important;
  }
  .body-sub {
    border-top-color: #555555 !important;
  }
}

a:link, a:visited, a:hover, a:active, a:focus {
  color: #4f46e5 !important;
  text-decoration: underline !important;
}
.btn:link, .btn:visited, .btn:hover, .btn:active, .btn:focus,
a.btn:link, a.btn:visited, a.btn:hover, a.btn:active, a.btn:focus {
  color: #ffffff !important;
  text-decoration: none !important;
}
@media (prefers-color-scheme: dark) {
  a:link, a:visited, a:hover, a:active, a:focus {
    color: #818cf8 !important;
  }
  .btn:link, .btn:visited, .btn:hover, .btn:active, .btn:focus,
  a.btn:link, a.btn:visited, a.btn:hover, a.btn:active, a.btn:focus {
    color: #ffffff !important;
    text-decoration: none !important;
  }
}
`;

export interface EmailLayoutOptions {
  body: string;
  footerText?: string;
}

/** Shape every template function returns — ready to spread into `sendMail()`. */
export type EmailTemplate = {
  subject: string;
  html: string;
  text: string;
};

function defaultFooter(): string {
  const year = new Date().getFullYear();
  return `<p style="line-height: 1.625; font-size: 12px !important; color: #64748b !important; text-align: center !important; margin: 0.4em 0 !important;">Sent by Sailor CMS &middot; &copy; ${year}</p>`;
}

/** Wraps body HTML in the standard email layout. */
export function emailLayout({ body, footerText }: EmailLayoutOptions): string {
  const footer = footerText ?? defaultFooter();

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title></title>
  <link href="https://fonts.googleapis.com/css?family=Inter:400,700&display=swap" rel="stylesheet" type="text/css">
  <style type="text/css" rel="stylesheet" media="all">${STYLES}</style>
  <!--[if mso]>
  <style type="text/css">
    .f-fallback, .footer { font-family: Arial, sans-serif; }
  </style>
  <![endif]-->
</head>
<body style="height: 100%; margin: 0; -webkit-text-size-adjust: none; background-color: #f8fafc; font-family: 'Inter', Helvetica, Arial, sans-serif; font-size: 16px; width: 100% !important;">
  <table class="email-wrapper" width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width: 100%; margin: 0; padding: 0; background-color: #f8fafc;" bgcolor="#f8fafc">
    <tr>
      <td align="center" style="word-break: break-word; font-family: 'Inter', Helvetica, Arial, sans-serif; font-size: 16px;">
        <table class="email-content" width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width: 100%; margin: 0; padding: 0;">
          <tr><td style="padding: 15px 0 0 0; font-size: 0; line-height: 0; height: 0;" align="center"></td></tr>
          <tr>
            <td class="email-body" width="100%" cellpadding="0" cellspacing="0" style="word-break: break-word; font-family: 'Inter', Helvetica, Arial, sans-serif; font-size: 16px; width: 100%; margin: 0; padding: 0;">
              <table class="email-body_inner" align="center" width="640" cellpadding="0" cellspacing="0" role="presentation" style="width: 640px; margin: 0 auto; background-color: #ffffff;" bgcolor="#ffffff">
                <tr>
                  <td class="content-cell" style="word-break: break-word; font-family: 'Inter', Helvetica, Arial, sans-serif; font-size: 16px; padding: 30px !important;">
                    <div class="f-fallback">
                      ${body}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="word-break: break-word; font-family: 'Inter', Helvetica, Arial, sans-serif; font-size: 16px;">
              <table class="email-footer" align="center" width="640" cellpadding="0" cellspacing="0" role="presentation" style="width: 640px; margin: 0 auto; padding: 0; text-align: center;">
                <tr>
                  <td class="content-cell" align="center" style="word-break: break-word; font-family: 'Inter', Helvetica, Arial, sans-serif; font-size: 16px; padding: 30px !important;">
                    ${footer}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** A CTA button with MSO (Outlook) fallback. */
export function emailButton(text: string, href: string): string {
  return `
<!--[if mso]>
<div align="center">
  <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:48px;v-text-anchor:middle;width:80%;" arcsize="25%" stroke="f" fillcolor="#4f46e5">
    <w:anchorlock/>
    <center style="color: #ffffff;font-family:'Inter', Helvetica, Arial, sans-serif;font-size: 16px;font-weight:bold;">${text}</center>
  </v:roundrect>
</div>
<![endif]-->
<!--[if !mso]><!-- -->
<table width="80%" style="margin: 30px auto; width: 80%;" border="0" cellspacing="0" cellpadding="0" role="presentation">
  <tr>
    <td align="center" bgcolor="#4f46e5" style="border-radius: 12px; background-color: #4f46e5;">
      <a href="${href}" target="_blank" rel="noopener noreferrer" class="btn" style="background-color: #4f46e5; border: solid 1px #4f46e5; border-radius: 12px; box-sizing: border-box; color: #ffffff !important; cursor: pointer; font-size: 16px; font-weight: bold; margin: 0; padding: 16px 25px; text-decoration: none !important; text-align: center !important; display: block !important; width: 100% !important;">
        ${text}
      </a>
    </td>
  </tr>
</table>
<!--<![endif]-->`;
}

/** A bordered card. Use for receipts, summaries, etc. */
export function infoBox(content: string): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom: 24px;">
  <tbody><tr><td class="data-cell" style="padding: 16px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; font-family: 'Inter', Helvetica, Arial, sans-serif;">${content}</td></tr></tbody>
</table>`;
}

/** A labeled value row inside an infoBox. */
export function infoRow(label: string, value: string): string {
  return `<p style="margin: 0 0 4px 0; font-size: 14px; line-height: 1.5; color: #0f172a;"><span class="data-label" style="color: #64748b;">${label}:</span> ${value}</p>`;
}

/** Small uppercase section label. */
export function sectionHeading(text: string): string {
  return `<p class="section-label" style="margin: 0 0 8px 0; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b;">${text}</p>`;
}
