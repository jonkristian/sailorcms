import type { GlobalDefinition } from 'sailorcms/core/types';

export const submissionsGlobal: GlobalDefinition = {
  name: {
    singular: 'Submission',
    plural: 'Submissions'
  },
  slug: 'submissions',
  description: 'Form submissions from the contact page',
  icon: 'Mail',
  dataType: 'repeatable',
  // Submissions hold PII (name, email, phone, message). Gate the public read
  // utilities so a stray `getGlobals('submissions')` from a `(site)/...` route
  // throws AccessDeniedError instead of leaking data. Admin (`/sailor/*`) is
  // unaffected — it doesn't go through these utilities.
  access: { roles: ['admin', 'editor'] },
  options: {
    defaultView: 'read'
  },
  fields: {
    // Core fields auto-added by generator:
    // - id: string (required, unique)
    // - created_at: datetime (required, auto-generated)
    // - updated_at: datetime (required, auto-generated)
    title: {
      readonly: true,
      position: 'main'
    },
    slug: {
      hidden: true,
      readonly: true
    },
    // System status — hidden because the user-facing triage lives on
    // `inquiry_status` (new / reviewed / replied / archived). Every submission
    // is real admin data, so we default to 'published' so the default
    // `getGlobals` filter surfaces them without an explicit override.
    status: {
      hidden: true,
      default: 'published'
    },
    // Explicit `order` so the table reads as an inbox: subject (clickable
    // first column) → name → email → phone → triage status. Without this,
    // CORE_FIELDS injects the system status column before user fields and
    // the column order is jumbled. The triage state is `inquiry_status`,
    // not the system `status` — those have different semantics (workflow
    // vs. content visibility) and would collide on the same DB column.
    subject: {
      type: 'string',
      label: 'Subject',
      required: true,
      showInTable: true,
      order: 1,
      readonly: true
    },
    name: {
      type: 'string',
      label: 'Name',
      required: true,
      showInTable: true,
      order: 2,
      readonly: true
    },
    email: {
      type: 'link',
      label: 'Email',
      required: true,
      showInTable: true,
      order: 3,
      readonly: true
    },
    phone: {
      type: 'link',
      label: 'Phone',
      showInTable: true,
      order: 4,
      readonly: true
    },
    inquiry_status: {
      type: 'select',
      label: 'Status',
      options: [
        { label: 'New', value: 'new' },
        { label: 'Reviewed', value: 'reviewed' },
        { label: 'Replied', value: 'replied' },
        { label: 'Archived', value: 'archived' }
      ],
      default: 'new',
      showInTable: true,
      order: 5,
      description: 'Processing status of this submission'
    },
    message: {
      type: 'textarea',
      label: 'Message',
      required: true,
      position: 'main',
      readonly: true
    },
    source: {
      type: 'string',
      label: 'Source Page',
      position: 'sidebar',
      readonly: true,
      description: 'The page where this form was submitted'
    },
    notes: {
      type: 'wysiwyg',
      label: 'Internal Notes',
      position: 'main',
      description: 'Private notes for staff use'
    }
  }
};
