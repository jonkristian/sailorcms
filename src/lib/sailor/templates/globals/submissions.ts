import type { GlobalDefinition } from '$sailor/core/types';

export const submissionsGlobal: GlobalDefinition = {
  name: {
    singular: 'Submission',
    plural: 'Submissions'
  },
  slug: 'submissions',
  description: 'Form submissions from the contact page',
  icon: 'Mail',
  dataType: 'repeatable',
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
    name: {
      type: 'string',
      label: 'Name',
      required: true,
      showInTable: true,
      readonly: true
    },
    email: {
      type: 'link',
      label: 'Email',
      required: true,
      showInTable: true,
      readonly: true
    },
    phone: {
      type: 'link',
      label: 'Phone',
      showInTable: true,
      readonly: true
    },
    subject: {
      type: 'string',
      label: 'Subject',
      required: true,
      showInTable: true,
      readonly: true
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
    status: {
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
      description: 'Processing status of this submission'
    },
    notes: {
      type: 'wysiwyg',
      label: 'Internal Notes',
      position: 'main',
      description: 'Private notes for staff use'
    }
  }
};
