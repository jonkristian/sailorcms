/**
 * Server-side collector for the admin sidebar's alerts slot. Each check is a
 * small async block that pushes an entry into `alerts` when something is
 * wrong. The collector is called from the root `/sailor` layout load so all
 * admin pages get the banner; non-settings users get an empty list since the
 * actions are admin-only.
 *
 * To add a new alert source: extend `AdminAlertKind` in `./alerts.ts`, add a
 * new check below, and map the kind to a Lucide icon in `admin-alerts.svelte`.
 */
import { m } from '$sailor/i18n';
import { isMailHealthy } from 'sailorcms/utils/mail/server';
import type { AdminAlert } from './alerts';

export async function getAdminAlerts(canViewSettings: boolean): Promise<AdminAlert[]> {
  if (!canViewSettings) return [];

  const alerts: AdminAlert[] = [];

  if (!(await isMailHealthy())) {
    alerts.push({
      id: 'mail-unhealthy',
      kind: 'mail',
      title: m.sidebar_mail_unhealthy_title(),
      description: m.sidebar_mail_unhealthy_action(),
      href: '/sailor/settings/mail'
    });
  }

  return alerts;
}
