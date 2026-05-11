import { m } from '$sailor/i18n';

/**
 * Resolve a status value into a translated label + tailwind color classes
 * for the Badge component. Unknown statuses fall back to the raw string
 * with a muted style, so custom select-field values (e.g. submissions'
 * `new` / `replied`) still render legibly.
 */
export function getStatusBadge(status: string | undefined | null): {
  label: string;
  classes: string;
} {
  const value = (status || '').toLowerCase();
  switch (value) {
    case 'published':
      return {
        label: m.status_published(),
        classes: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
      };
    case 'draft':
      return {
        label: m.status_draft(),
        classes: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
      };
    case 'archived':
      return {
        label: m.status_archived(),
        classes: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
      };
    case 'private':
      return {
        label: m.status_private(),
        classes: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300'
      };
    case 'active':
      // Globals default new items to `active` (vs collections' `draft`); same
      // "live" semantic as published — gets the same emerald hue.
      return {
        label: m.status_active(),
        classes: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
      };
    default:
      return {
        label: status || '—',
        classes: 'bg-muted text-muted-foreground'
      };
  }
}
