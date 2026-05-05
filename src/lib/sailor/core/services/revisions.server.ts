import { db } from '../db/index.server';
import { revisions } from '$sailor/generated/schema';
import { and, desc, eq, notInArray } from 'drizzle-orm';
import { generateUUID } from '../utils/common';

export const DEFAULT_REVISION_KEEP = 50;

export type RevisionEntityType = `collection:${string}` | `global:${string}`;

export interface RevisionRow {
  id: string;
  entity_type: string;
  entity_id: string;
  data: string;
  created_by: string | null;
  created_at: Date;
}

export interface RevisionSummary {
  id: string;
  entity_type: string;
  entity_id: string;
  created_by: string | null;
  created_at: Date;
}

export interface RevisionDetail extends RevisionSummary {
  data: Record<string, unknown>;
}

export interface CreateRevisionInput {
  entityType: RevisionEntityType;
  entityId: string;
  data: Record<string, unknown>;
  userId: string | null;
  keep?: number;
}

function parseData(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export const RevisionsService = {
  async create({
    entityType,
    entityId,
    data,
    userId,
    keep = DEFAULT_REVISION_KEEP
  }: CreateRevisionInput): Promise<string> {
    const id = generateUUID();
    await db.insert(revisions).values({
      id,
      entity_type: entityType,
      entity_id: entityId,
      data: JSON.stringify(data),
      created_by: userId,
      created_at: new Date()
    });

    if (keep > 0) {
      await this.prune({ entityType, entityId, keep });
    }

    return id;
  },

  async list({
    entityType,
    entityId,
    limit = 50,
    offset = 0
  }: {
    entityType: RevisionEntityType;
    entityId: string;
    limit?: number;
    offset?: number;
  }): Promise<RevisionSummary[]> {
    const rows = await db
      .select({
        id: revisions.id,
        entity_type: revisions.entity_type,
        entity_id: revisions.entity_id,
        created_by: revisions.created_by,
        created_at: revisions.created_at
      })
      .from(revisions)
      .where(and(eq(revisions.entity_type, entityType), eq(revisions.entity_id, entityId)))
      .orderBy(desc(revisions.created_at))
      .limit(limit)
      .offset(offset);

    return rows as RevisionSummary[];
  },

  async get(id: string): Promise<RevisionDetail | null> {
    const [row] = await db.select().from(revisions).where(eq(revisions.id, id)).limit(1);
    if (!row) return null;
    return {
      id: row.id,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      created_by: row.created_by,
      created_at: row.created_at as Date,
      data: parseData(row.data)
    };
  },

  // Keep the newest `keep` revisions for the given entity, drop the rest.
  // Two-step (select-then-delete) instead of a correlated subquery so the
  // query plan stays simple across SQLite/Postgres.
  async prune({
    entityType,
    entityId,
    keep
  }: {
    entityType: RevisionEntityType;
    entityId: string;
    keep: number;
  }): Promise<void> {
    if (keep <= 0) return;
    const survivors = await db
      .select({ id: revisions.id })
      .from(revisions)
      .where(and(eq(revisions.entity_type, entityType), eq(revisions.entity_id, entityId)))
      .orderBy(desc(revisions.created_at))
      .limit(keep);

    if (survivors.length === 0) return;

    await db.delete(revisions).where(
      and(
        eq(revisions.entity_type, entityType),
        eq(revisions.entity_id, entityId),
        notInArray(
          revisions.id,
          survivors.map((r: { id: string }) => r.id)
        )
      )
    );
  },

  // Hard-delete callers (e.g. permanent collection-item delete) call this to
  // drop revision history for the entity. Soft-delete leaves revisions intact
  // so a recovered item still has its history.
  async deleteForEntity({
    entityType,
    entityId
  }: {
    entityType: RevisionEntityType;
    entityId: string;
  }): Promise<void> {
    await db
      .delete(revisions)
      .where(and(eq(revisions.entity_type, entityType), eq(revisions.entity_id, entityId)));
  }
};

// Resolve a per-template `options.revisions` value (boolean | { keep: number } | undefined)
// to either `null` (disabled) or the configured cap.
export function resolveRevisionsKeep(value: unknown): number | null {
  if (!value) return null;
  if (value === true) return DEFAULT_REVISION_KEEP;
  if (typeof value === 'object' && value !== null) {
    const keep = (value as { keep?: unknown }).keep;
    if (typeof keep === 'number' && keep > 0) return Math.floor(keep);
  }
  return null;
}
