/**
 * Top-level barrel for `sailorcms/utils/mail`. Consumer apps should pull
 * `sendMail` + template helpers from here instead of reaching into
 * `./server` / `./templates/*` directly.
 *
 * Server-only: `sendMail`, `isMailConfigured`, `isMailHealthy` open a DB
 * connection (system settings, mail_events) and resolve a driver — call them
 * from server contexts (`+page.server.ts`, `*.remote.ts`, hooks). Template
 * helpers are pure HTML string builders and are safe to import anywhere.
 */

// Send + status — server-only
export { sendMail, isMailConfigured, isMailHealthy } from './server';
export type { MailMessage, SendResult } from './server';

// Ready-made templates
export { passwordResetTemplate, emailVerificationTemplate } from './templates/auth';
export { testEmailTemplate } from './templates/system';
export {
  submissionNotificationTemplate,
  type SubmissionNotificationInput
} from './templates/notification';

// Layout helpers for building your own templates
export { emailLayout, emailButton, infoBox, infoRow, sectionHeading } from './templates/layout';
export type { EmailLayoutOptions, EmailTemplate } from './templates/layout';
