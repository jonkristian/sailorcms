/**
 * Mail-outbox event log. Every `sendMail` call writes one row here so the
 * admin can:
 *   - audit what was sent (which template, to whom, when)
 *   - inspect failed sends with their full payload + error
 *   - retry failed sends, which produces a new row (not a row update — each
 *     row is a single attempt for a clean audit trail)
 *
 * Pruning isn't built in yet. When it lands, the natural shape is a per-status
 * retention policy (failed: keep until cleared; sent: prune body content after
 * N days, prune metadata after M).
 */
import { db, mailEvents } from 'sailorcms/core/db/index.server';
import { eq, desc, and, count } from 'drizzle-orm';

export type MailEventStatus = 'sent' | 'failed';

export type RecordMailEventInput = {
  driver: string;
  to_address: string;
  subject: string;
  body_text?: string | null;
  body_html?: string | null;
  status: MailEventStatus;
  message_id?: string | null;
  error_message?: string | null;
  user_id?: string | null;
};

export async function recordMailEvent(input: RecordMailEventInput): Promise<string> {
  const [row] = await db
    .insert(mailEvents)
    .values({
      driver: input.driver,
      to_address: input.to_address,
      subject: input.subject,
      body_text: input.body_text ?? null,
      body_html: input.body_html ?? null,
      status: input.status,
      message_id: input.message_id ?? null,
      error_message: input.error_message ?? null,
      user_id: input.user_id ?? null
    })
    .returning({ id: mailEvents.id });
  return row.id;
}

export type MailEventRow = typeof mailEvents.$inferSelect;

export type ListMailEventsOptions = {
  status?: MailEventStatus;
  page?: number;
  pageSize?: number;
};

export async function listMailEvents(opts: ListMailEventsOptions = {}): Promise<{
  items: MailEventRow[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.max(1, Math.min(100, opts.pageSize ?? 25));

  const where = opts.status ? eq(mailEvents.status, opts.status) : undefined;

  const [items, [{ total }]] = await Promise.all([
    db
      .select()
      .from(mailEvents)
      .where(where)
      .orderBy(desc(mailEvents.created_at))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(mailEvents).where(where)
  ]);

  return { items, total: Number(total ?? 0), page, pageSize };
}

export async function getMailEvent(id: string): Promise<MailEventRow | null> {
  const [row] = await db.select().from(mailEvents).where(eq(mailEvents.id, id)).limit(1);
  return row ?? null;
}

export async function countFailedMailEvents(): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(mailEvents)
    .where(eq(mailEvents.status, 'failed'));
  return Number(row?.total ?? 0);
}

/**
 * Replay a failed event by driving the active driver with its stored payload
 * and updating the same row in place — `attempts` increments, `status` flips
 * to 'sent' on success, `error_message` clears (or replaces on another
 * failure). One row per email's lifecycle, not per attempt.
 *
 * Returns the underlying SendResult so the caller can show a per-action toast.
 * The "only failed events are retriable" check is enforced in the route action
 * (so the UI can hide the button), but we re-assert it here as a defense.
 */
export async function replayMailEvent(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const event = await getMailEvent(id);
  if (!event) return { ok: false, error: 'Event not found' };
  if (event.status !== 'failed') return { ok: false, error: 'Only failed sends can be retried' };

  const { dispatchMail } = await import('sailorcms/utils/mail/server');
  const { result } = await dispatchMail({
    to: event.to_address,
    subject: event.subject,
    text: event.body_text ?? undefined,
    html: event.body_html ?? undefined
  });

  const now = new Date();
  const nextAttempts = (event.attempts ?? 1) + 1;
  if (result.ok) {
    await db
      .update(mailEvents)
      .set({
        status: 'sent',
        message_id: result.messageId ?? null,
        error_message: null,
        attempts: nextAttempts,
        updated_at: now
      })
      .where(eq(mailEvents.id, id));
    return { ok: true };
  }
  await db
    .update(mailEvents)
    .set({
      // Still 'failed' — bumping the attempt count + refreshed error so the
      // dialog shows the most recent failure reason rather than the original.
      status: 'failed',
      error_message: result.error,
      attempts: nextAttempts,
      updated_at: now
    })
    .where(eq(mailEvents.id, id));
  return { ok: false, error: result.error };
}
