import { db } from 'sailorcms/core/db/index.server';
import { eq, inArray } from 'drizzle-orm';
import * as schema from '$sailor/generated/schema';
import { childTableName } from 'sailorcms/core/utils/string';
import { getCollectionType, getGlobalType, getBlockType } from 'sailorcms/core/utils/db.server';

/**
 * Which kind of entity owns the junction being traversed. Picks both the
 * junction's name (`junction_{ownerSlug}_{field}`) and its owner column —
 * the generator derives that column from the owning table's prefix, so a
 * collection-owned junction has `collection_id` and a global-owned one has
 * `global_id` (`cli/tools/generator/core/tables.js`).
 */
export type RelationOwnerType = 'collection' | 'global' | 'block';

const OWNER_KEY: Record<RelationOwnerType, string> = {
  collection: 'collection_id',
  global: 'global_id',
  block: 'block_id'
};

/**
 * Expands a target slug to itself plus all its descendants. Injected rather
 * than imported to keep this module free of a `loaders → collections` cycle.
 */
export type ResolveDescendantsFn = (
  parentSlug: string,
  targetType: string,
  targetKind: 'global' | 'collection'
) => Promise<string[]>;

export interface RelationFilterOptions {
  ownerType: RelationOwnerType;
  /** Slug of the entity declaring the relation, e.g. `products`. */
  ownerSlug: string;
  /** Field name on that entity declaring the many-to-many, e.g. `category`. */
  relationField: string;
  /** Target slug(s) to match. */
  targetValues: string | string[];
  /** Also match items related to any descendant of the target (single value only). */
  recursive?: boolean;
  /** Required when `recursive` is set. */
  resolveDescendants?: ResolveDescendantsFn;
}

async function getOwnerFields(
  ownerType: RelationOwnerType,
  ownerSlug: string
): Promise<Record<string, any> | null> {
  const entityType =
    ownerType === 'collection'
      ? await getCollectionType(ownerSlug)
      : ownerType === 'global'
        ? await getGlobalType(ownerSlug)
        : await getBlockType(ownerSlug);

  return (entityType?.fields as Record<string, any> | undefined) ?? null;
}

/**
 * Walk a many-to-many junction backwards: given target slug(s), return the ids
 * of the owning rows that point at them. Powers `whereRelated` on both
 * `getCollections` and `getGlobals`.
 *
 * Returns owning-row ids. For localized entities the junction's owner column
 * holds the `_locales` row id, so callers filter against `_locales.id` rather
 * than the main table's.
 *
 * Fails loudly on an unresolvable relation, junction or target — a silent
 * empty array here is indistinguishable from "no matches" and hides template
 * or migration mistakes.
 */
export interface RelationFilterResult {
  /** Owning rows that point at one of the targets. */
  ownerIds: string[];
  /** Junction table the match came through, for a correlated ordering. */
  junctionTable: string;
  /** Owner column on that junction (`collection_id` / `global_id` / `block_id`). */
  ownerKey: string;
  /** Target rows the filter resolved to — the descendant set when recursive. */
  targetIds: string[];
}

/**
 * Table and column names for a many-to-many relation, without touching the
 * database.
 *
 * Shared so callers that only need the shape — sorting a list by a relation,
 * say — do not re-derive the junction name and get the snake_case fallback
 * subtly wrong. Returns `null` for anything that is not a many-to-many, since
 * those keep a foreign key on the row and have no junction to join.
 */
export function resolveRelationTables(
  ownerType: RelationOwnerType,
  ownerSlug: string,
  relationField: string,
  fields: Record<string, any> | undefined
): { junctionTable: string; ownerKey: string; targetTable: string } | null {
  // `hasOwn` because `relationField` comes from a query parameter: every object
  // inherits `constructor` and friends, and a plain lookup would resolve one.
  const field = fields && Object.hasOwn(fields, relationField) ? fields[relationField] : undefined;
  const relation = field?.relation;
  if (!relation || relation.type !== 'many-to-many') return null;

  const targetTable = relation.targetGlobal
    ? `global_${relation.targetGlobal}`
    : relation.targetCollection
      ? `collection_${relation.targetCollection}`
      : null;
  if (!targetTable || !(schema as any)[targetTable]) return null;

  // Field names that are already snake_case round-trip unchanged; this covers
  // the ones that don't.
  let junctionTable = childTableName(`junction_${ownerSlug}`, relationField);
  if (!(schema as any)[junctionTable]) junctionTable = `junction_${ownerSlug}_${relationField}`;
  if (!(schema as any)[junctionTable]) return null;

  return { junctionTable, ownerKey: `${ownerType}_id`, targetTable };
}

/** Owning-row ids only. Most callers want this. */
export async function buildRelationshipSubquery(options: RelationFilterOptions): Promise<string[]> {
  return (await resolveRelationFilter(options)).ownerIds;
}

/**
 * As above, but keeps what the match came through.
 *
 * `orderBy: 'relation'` needs to order by the junction rather than by a column
 * on the collection, which means a correlated subquery against the same
 * junction and the same resolved targets — ordering the returned ids in JS
 * instead would only sort the current page, since pagination happens in SQL.
 */
export async function resolveRelationFilter(
  options: RelationFilterOptions
): Promise<RelationFilterResult> {
  const {
    ownerType,
    ownerSlug,
    relationField,
    targetValues,
    recursive = false,
    resolveDescendants
  } = options;

  const label = `whereRelated: ${ownerType} '${ownerSlug}', field '${relationField}'`;

  // Resolve the relation once — both descendant expansion and the join need
  // the target, and reading it twice is how the targetCollection case used to
  // get missed on the second read.
  const fields = await getOwnerFields(ownerType, ownerSlug);
  if (!fields) {
    throw new Error(`${label} — ${ownerType} type '${ownerSlug}' not found.`);
  }

  const relation = fields[relationField]?.relation;
  if (!relation) {
    throw new Error(`${label} — no relation declared on that field.`);
  }

  // Only many-to-many gets a junction table; the other types put a foreign key
  // on the row itself. Without this check the junction lookup below fails with
  // "run db:update", pointing at a command that can never create that table.
  if (relation.type !== 'many-to-many') {
    throw new Error(
      `${label} — whereRelated needs a many-to-many relation, but this one is '${relation.type}'. ` +
        `Only many-to-many relations get a junction table to traverse.`
    );
  }

  let targetSlug: string;
  let targetKind: 'global' | 'collection';
  let targetTableName: string;
  if (relation.targetGlobal) {
    targetSlug = relation.targetGlobal;
    targetKind = 'global';
    targetTableName = `global_${targetSlug}`;
  } else if (relation.targetCollection) {
    targetSlug = relation.targetCollection;
    targetKind = 'collection';
    targetTableName = `collection_${targetSlug}`;
  } else {
    throw new Error(`${label} — relation declares neither targetGlobal nor targetCollection.`);
  }

  let values = Array.isArray(targetValues) ? targetValues : [targetValues];

  if (recursive && values.length === 1) {
    if (!resolveDescendants) {
      throw new Error(`${label} — recursive requested but no descendant resolver was provided.`);
    }
    values = await resolveDescendants(values[0], targetSlug, targetKind);
  }

  let junctionTableName = childTableName(`junction_${ownerSlug}`, relationField);
  let junctionTable = schema[junctionTableName as keyof typeof schema];

  // Field names that are already snake_case round-trip unchanged; this covers
  // the ones that don't.
  if (!junctionTable) {
    junctionTableName = `junction_${ownerSlug}_${relationField}`;
    junctionTable = schema[junctionTableName as keyof typeof schema];
  }

  if (!junctionTable) {
    throw new Error(
      `${label} — junction table '${junctionTableName}' not found in schema. Run 'npx sailor db:update'.`
    );
  }

  const targetTable = schema[targetTableName as keyof typeof schema];
  if (!targetTable) {
    throw new Error(
      `${label} — target table '${targetTableName}' not found in schema. Run 'npx sailor db:update'.`
    );
  }

  const ownerKey = OWNER_KEY[ownerType];
  if ((junctionTable as any)[ownerKey] === undefined) {
    throw new Error(
      `${label} — junction '${junctionTableName}' has no '${ownerKey}' column. Run 'npx sailor db:update'.`
    );
  }

  const empty: RelationFilterResult = {
    ownerIds: [],
    junctionTable: junctionTableName,
    ownerKey,
    targetIds: []
  };

  if (values.length === 0) {
    return empty;
  }

  const rows = await db
    .select({
      ownerId: (junctionTable as any)[ownerKey],
      targetId: (junctionTable as any).target_id
    })
    .from(junctionTable)
    .innerJoin(targetTable, eq((junctionTable as any).target_id, (targetTable as any).id))
    .where(inArray((targetTable as any).slug, values));

  const typedRows = rows as Array<{ ownerId: string; targetId: string }>;
  return {
    ownerIds: [...new Set(typedRows.map((row) => row.ownerId))],
    junctionTable: junctionTableName,
    ownerKey,
    targetIds: [...new Set(typedRows.map((row) => row.targetId))]
  };
}
