/**
 * Shape of a single admin-side issue surfaced in the sidebar's alerts slot.
 * Kept free of server-only imports so client components can `import type` it
 * directly. The server-side collector lives in `./alerts.server.ts`.
 *
 * Adding a new alert kind: extend `AdminAlertKind`, then map it to a Lucide
 * icon in the sidebar's `admin-alerts.svelte` component. The `Record` typing
 * there forces the icon-table to stay exhaustive.
 */
export type AdminAlertKind = 'mail';

export type AdminAlert = {
  /** Stable key — used as the `{#each}` key and for client-side de-dup. */
  id: string;
  kind: AdminAlertKind;
  /** Short, already-translated headline. */
  title: string;
  /** One-line follow-up — usually a call to action. Already translated. */
  description: string;
  /** Where clicking the alert sends the admin to fix the issue. */
  href?: string;
};
