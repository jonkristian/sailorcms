// Collection-item persister.
//
// One place where collection saves live, so admin routes / remote functions /
// future bulk-import flows all share the same logic. Handles both localized
// and non-localized collections — the caller passes `locale` (or leaves it
// off) and this file routes the writes to the right table(s).
//
// Auth is the caller's responsibility: this is a data primitive, not an
// access boundary. Pass `canCreate` / `canUpdate` booleans pre-resolved.

import { db } from '../../db/index.server';
import { eq, and, sql } from 'drizzle-orm';
import * as schema from '$sailor/generated/schema';
import { fieldConfigurations } from '$sailor/generated/fields';
import { generateUUID, slugify, sanitizeId } from '../../utils/common';
import { ensureUniqueSlug } from '../../utils/slug';
import { TagService } from '../../services/tag.server';
import { SearchIndexService } from '../../services/search-index.server';
import { RevisionsService, resolveRevisionsKeep } from '../../services/revisions.server';
import { toSnakeCase } from '../../utils/string';
import { getCurrentTimestampSeconds } from '../../utils/date';
import { syncArrayRowFiles, clearArrayRowFilesByParent } from './array-row-files.server';
import { saveNestedArrayFields } from '../../content/blocks.server';
import { getContentSettings } from '../../../utils/data/collections';
import { log } from '../../utils/logger';

export interface SaveCollectionItemOptions {
  collectionSlug: string;
  itemId: string;
  formData: Record<string, any>;
  /** Pre-resolved user from the request context. Persists `last_modified_by`. */
  user: { id: string } | null;
  /** Caller-resolved permission booleans. Persister throws if neither matches the operation. */
  canCreate: boolean;
  canUpdate: boolean;
  /**
   * Optional locale override. When the collection is localized, the persister
   * resolves the active locale in this order:
   *   1. This `locale` argument
   *   2. `formData.locale` (so form submissions can carry it)
   *   3. `content.i18n.default` from settings
   * Non-localized collections ignore the value.
   */
  locale?: string;
}

export interface SaveCollectionItemResult {
  success: boolean;
  error?: string;
  message?: string;
  itemId?: string;
  /** `_locales.id` for localized collections, same as `itemId` for non-localized. */
  entityId?: string;
  /** Persisted main row for client re-hydration (without re-fetching). */
  item?: Record<string, any>;
  /** Tags currently attached to the item (after the save). */
  tags?: Array<{ id: string; name: string }>;
}

/**
 * Save a collection item — create or update. Handles localized + non-localized
 * collections uniformly. See `SaveCollectionItemOptions` for the contract.
 */
export async function saveCollectionItem(
  opts: SaveCollectionItemOptions
): Promise<SaveCollectionItemResult> {
  const { collectionSlug, itemId, formData, user, canCreate, canUpdate, locale } = opts;

  if (!collectionSlug || !itemId || !formData) {
    return { success: false, error: 'Collection slug, item ID, and form data are required' };
  }

  try {
    // Resolve the collection schema + options from the DB-side registry so
    // this primitive doesn't have to know about the template module layout.
    const collectionType = await db.query.collectionTypes.findFirst({
      where: (collectionTypes: any, { eq }: any) => eq(collectionTypes.slug, collectionSlug)
    });

    if (!collectionType) {
      return { success: false, error: 'Collection not found' };
    }

    const collectionSchema = JSON.parse(collectionType.schema);
    const collectionOptions = collectionType.options ? JSON.parse(collectionType.options) : {};
    let collectionFields = collectionSchema.properties || collectionSchema;

    // Add SEO fields if SEO is enabled
    if (collectionOptions.seo) {
      const { SEO_FIELDS } = await import('../../types');
      collectionFields = {
        ...collectionFields,
        ...SEO_FIELDS
      };
    }

    // Get all block types for block processing
    const allBlockTypes = await db.query.blockTypes.findMany();
    const availableBlocks: Record<string, any> = {};
    for (const blockType of allBlockTypes) {
      availableBlocks[blockType.slug] = {
        name: blockType.name,
        slug: blockType.slug,
        description: blockType.description,
        fields: JSON.parse(blockType.schema)
      };
    }

    // Separate fields by type — categorize the incoming formData by what the
    // schema says about each field, so the transaction body can address each
    // bucket (main columns, arrays, files, junctions, tags) cleanly.
    const regularFields: Record<string, any> = {};
    const arrayFields: Record<string, any[]> = {};
    const relationFields: Record<string, any[]> = {};
    const tagFields: Record<string, any[]> = {};
    const fileFields: Record<string, any> = {};

    Object.entries(formData).forEach(([key, value]) => {
      // Skip blocks - they're handled separately
      if (key === 'blocks') return;

      const fieldDef = collectionFields[key];

      if (fieldDef?.type === 'array') {
        arrayFields[key] = value as any[];
      } else if (fieldDef?.type === 'file') {
        fileFields[key] = value;
      } else if (fieldDef?.type === 'relation') {
        const relType = fieldDef?.relation?.type;
        if (relType === 'one-to-one' || relType === 'one-to-many') {
          let v: any = value;
          try {
            v = typeof v === 'string' && v.startsWith('{') ? JSON.parse(v) : v;
          } catch {}
          if (Array.isArray(v) && v.length > 0) v = v[0]?.id || v[0] || null;
          else if (typeof v === 'object' && v !== null) v = v.id || null;
          regularFields[key] = v ?? null;
        } else {
          try {
            const raw = typeof value === 'string' ? JSON.parse(value) : value;
            relationFields[key] = Array.isArray(raw) ? raw : [];
          } catch {
            relationFields[key] = Array.isArray(value) ? value : [];
          }
        }
      } else if (fieldDef?.type === 'tags') {
        try {
          const raw = typeof value === 'string' ? JSON.parse(value) : value;
          const arr = Array.isArray(raw) ? raw : [];
          tagFields[key] = arr;
        } catch {
          tagFields[key] = Array.isArray(value) ? value : [];
        }
      } else if (fieldDef?.type === 'boolean') {
        // Hidden-input form values arrive as strings ('true', 'false', '', '1'),
        // toggles send real booleans. Coerce to boolean once — drizzle stores
        // the int via { mode: 'boolean' }.
        regularFields[key] = value === true || value === 'true' || value === '1' || value === 1;
      } else {
        if (key === 'parent_id') {
          let v: any = value;
          if (Array.isArray(v) && v.length > 0) v = v[0]?.id || v[0] || null;
          else if (typeof v === 'object' && v !== null) v = v.id || null;
          regularFields[key] = sanitizeId(v);
        } else {
          regularFields[key] = value;
        }
      }
    });

    // Normalize author if provided; fallback handled during create
    if (regularFields.author !== undefined) {
      let a: any = regularFields.author;
      if (Array.isArray(a) && a.length > 0) a = a[0]?.id || a[0] || null;
      else if (typeof a === 'object' && a !== null) a = a.id || null;
      regularFields.author = a;
    }

    // Block-scoped tag writes — collected during the tx, flushed after commit
    // so TagService doesn't run inside the write transaction.
    const pendingBlockTags: Array<{ blockType: string; blockId: string; tagNames: string[] }> = [];

    const collectionTable = schema[`collection_${collectionSlug}` as keyof typeof schema];
    if (!collectionTable) {
      return { success: false, error: `Collection table for '${collectionSlug}' not found` };
    }

    // Localized collections store editable fields on `<slug>_locales`.
    // Resolve the active locale once and thread `entityId` / `tablePrefix`
    // / `junctionPrefix` through the array/file/junction/block sections below
    // so each write targets the right scope.
    const isLocalized =
      (fieldConfigurations as any).collections?.[collectionSlug]?.localized === true;
    const localesTable = isLocalized
      ? (schema[`collection_${collectionSlug}_locales` as keyof typeof schema] as any)
      : null;
    const currentLocale = isLocalized
      ? locale ||
        (typeof formData.locale === 'string' && formData.locale.trim()) ||
        getContentSettings().defaultLocale
      : null;
    const fkField = `${collectionSlug}_id`;

    const result = await db.transaction(async (tx: any) => {
      // entityId is the parent for arrays/files/junctions/blocks below.
      // For localized: the `_locales` row id (set after upsert). For
      // non-localized: just the main row id (= itemId from the URL).
      let entityId: string = itemId;
      // Child tables anchor on `collection_<slug>` for both modes. For
      // localized rows the FK columns reference the `_locales` row id
      // (`entityId` post-upsert).
      const tablePrefix = `collection_${collectionSlug}`;
      const junctionPrefix = collectionSlug;

      if (isLocalized) {
        // ── Localized save path ──────────────────────────────────────────
        // Main keeps its full shape (additive, so flipping localized is
        // non-destructive), but new edits land in `_locales` keyed on
        // (item_id, locale). Pre-migration content columns on main stay
        // until `sailor doctor` is run with --fix to clean them up.

        if (!currentLocale) {
          throw new Error(
            `saveCollectionItem('${collectionSlug}'): no locale resolved. Pass formData.locale or set content.i18n.default.`
          );
        }

        // 1. Identity row (main): check existing, upsert with just id/author.
        const existingMain = await tx
          .select({ id: (collectionTable as any).id, author: (collectionTable as any).author })
          .from(collectionTable)
          .where(eq((collectionTable as any).id, itemId))
          .limit(1);

        const now = new Date();
        let author = regularFields.author;
        if (!author && user?.id) author = user.id;

        if (existingMain.length > 0) {
          if (!canUpdate) throw new Error('You do not have permission to update this content');
          if (regularFields.author !== undefined) {
            await (tx as any)
              .update(collectionTable)
              .set({ author: regularFields.author })
              .where(eq((collectionTable as any).id, itemId));
          }
        } else {
          if (!canCreate) throw new Error('You do not have permission to create content');
          await (tx as any).insert(collectionTable).values({
            id: itemId,
            author: author || null,
            created_at: now
          });
        }

        // 2. Content row (_locales): upsert keyed on (item_id, locale).
        const localeContentKeys = Object.keys(collectionFields).filter(
          (key) => !['id', 'created_at', 'updated_at', 'last_modified_by', 'author'].includes(key)
        );
        const payloadLocaleRaw = Object.fromEntries(
          Object.entries(regularFields).filter(([key]) => localeContentKeys.includes(key))
        );
        const payloadLocale: Record<string, any> = {};
        for (const [k, v] of Object.entries(payloadLocaleRaw)) {
          if (k === 'parent_id') {
            let vv: any = v;
            if (Array.isArray(vv) && vv.length > 0) vv = vv[0]?.id || vv[0] || null;
            else if (typeof vv === 'object' && vv !== null) vv = (vv as any).id || null;
            payloadLocale[k] = vv;
          } else {
            payloadLocale[k] = v;
          }
        }
        const existingLocale = await tx
          .select({ id: localesTable.id })
          .from(localesTable)
          .where(and(eq(localesTable[fkField], itemId), eq(localesTable.locale, currentLocale)))
          .limit(1);

        if (payloadLocale.slug) {
          payloadLocale.slug = await ensureUniqueSlug({
            table: localesTable as any,
            slug: slugify(String(payloadLocale.slug)),
            excludeId: existingLocale[0]?.id ?? null,
            locale: currentLocale,
            localeColumn: 'locale',
            tx
          });
        }

        if (existingLocale.length > 0) {
          entityId = existingLocale[0].id as string;
          await (tx as any)
            .update(localesTable)
            .set({
              ...payloadLocale,
              updated_at: new Date(),
              last_modified_by: user?.id || null
            })
            .where(eq(localesTable.id, entityId));
        } else {
          entityId = generateUUID();
          await (tx as any).insert(localesTable).values({
            id: entityId,
            [fkField]: itemId,
            locale: currentLocale,
            updated_at: new Date(),
            last_modified_by: user?.id || null,
            ...payloadLocale
          });
        }
      } else {
        // ── Non-localized save path ─────────────────────────────────────
        const existing = await tx
          .select({
            id: (collectionTable as any).id,
            status: (collectionTable as any).status,
            author: (collectionTable as any).author
          })
          .from(collectionTable)
          .where(eq((collectionTable as any).id, itemId))
          .limit(1);

        if (existing.length > 0) {
          if (!canUpdate) {
            throw new Error('You do not have permission to update this content');
          }

          const schemaKeys = Object.keys(collectionFields);
          const payloadMainRaw = Object.fromEntries(
            Object.entries(regularFields).filter(
              ([key]) =>
                schemaKeys.includes(key) &&
                !['id', 'created_at', 'updated_at', 'last_modified_by', 'sort'].includes(key)
            )
          );

          const payloadMain: Record<string, any> = {};
          for (const [k, v] of Object.entries(payloadMainRaw)) {
            if (k === 'parent_id') {
              let vv: any = v;
              if (Array.isArray(vv) && vv.length > 0) vv = vv[0]?.id || vv[0] || null;
              else if (typeof vv === 'object' && vv !== null) vv = (vv as any).id || null;
              payloadMain[k] = vv;
            } else {
              payloadMain[k] = v;
            }
          }

          if (payloadMain.slug) {
            payloadMain.slug = await ensureUniqueSlug({
              table: collectionTable as any,
              slug: slugify(String(payloadMain.slug)),
              excludeId: itemId,
              tx
            });
          }

          const updateData: Record<string, any> = {
            ...payloadMain,
            updated_at: new Date(),
            last_modified_by: user?.id || null
          };

          if (regularFields.author !== undefined) updateData.author = regularFields.author;

          await (tx as any)
            .update(collectionTable)
            .set(updateData)
            .where(eq((collectionTable as any).id, itemId));
        } else {
          if (!canCreate) {
            throw new Error('You do not have permission to create content');
          }

          const now = new Date();
          let author = regularFields.author;
          if (!author && user?.id) author = user.id;

          const schemaKeys = Object.keys(collectionFields);
          const payloadMainRaw = Object.fromEntries(
            Object.entries(regularFields).filter(
              ([key]) =>
                schemaKeys.includes(key) &&
                !['id', 'created_at', 'updated_at', 'last_modified_by', 'sort', 'author'].includes(
                  key
                )
            )
          );

          const payloadMain: Record<string, any> = {};
          for (const [k, v] of Object.entries(payloadMainRaw)) {
            if (k === 'parent_id') {
              let vv: any = v;
              if (Array.isArray(vv) && vv.length > 0) vv = vv[0]?.id || vv[0] || null;
              else if (typeof vv === 'object' && vv !== null) vv = (vv as any).id || null;
              payloadMain[k] = vv;
            } else {
              payloadMain[k] = v;
            }
          }

          if (payloadMain.slug) {
            payloadMain.slug = await ensureUniqueSlug({
              table: collectionTable as any,
              slug: slugify(String(payloadMain.slug)),
              excludeId: itemId,
              tx
            });
          }

          const createData: Record<string, any> = {
            id: itemId,
            author: author || null,
            last_modified_by: user?.id || null,
            created_at: now,
            updated_at: now,
            ...payloadMain
          };

          await (tx as any).insert(collectionTable).values(createData);
        }
      }

      // Handle array fields — these use `<tablePrefix>_<fieldName>` tables
      // with `collection_id` referencing the appropriate parent (main for
      // non-localized, _locales for localized — entityId set above).
      if (Object.keys(arrayFields).length > 0) {
        for (const arrayFieldName of Object.keys(arrayFields)) {
          const fieldDef = collectionFields[arrayFieldName];
          if (fieldDef?.type === 'array' && fieldDef.items?.type === 'object') {
            const relationTableName = `${tablePrefix}_${arrayFieldName}`;
            const relationTable = schema[relationTableName as keyof typeof schema];
            if (relationTable) {
              await clearArrayRowFilesByParent(
                tx,
                relationTableName,
                entityId,
                'collection_id',
                fieldDef.items.properties
              );
              await tx.run(sql`
                DELETE FROM ${sql.identifier(relationTableName)}
                WHERE collection_id = ${entityId}
              `);
            }
          }
        }

        for (const [arrayFieldName, arrayItems] of Object.entries(arrayFields)) {
          const fieldDef = collectionFields[arrayFieldName];
          if (fieldDef?.type === 'array' && fieldDef.items?.type === 'object') {
            const relationTableName = `${tablePrefix}_${arrayFieldName}`;

            for (let index = 0; index < arrayItems.length; index++) {
              const item = arrayItems[index];
              const arrayItemId = item.id || generateUUID();

              const columns = ['id', 'collection_id', 'sort', 'created_at', 'updated_at'];
              const nowSec = getCurrentTimestampSeconds();
              const values = [arrayItemId, entityId, index, nowSec, nowSec];

              Object.entries(fieldDef.items.properties).forEach(([propKey, propDef]) => {
                if ((propDef as any).type === 'file') return;
                columns.push(propKey);
                values.push((item as any)[propKey] ?? null);
              });

              if (
                fieldDef.nestable &&
                fieldDef.items?.properties?.parent_id !== undefined &&
                (item as any).parent_id !== undefined
              ) {
                const rawParentId = (item as any).parent_id;
                const safeParentId =
                  rawParentId && rawParentId === arrayItemId ? null : rawParentId;
                columns.push('parent_id');
                values.push(safeParentId);
              }

              const relationTable = schema[relationTableName as keyof typeof schema];
              if (relationTable) {
                await tx.run(sql`
                  INSERT OR REPLACE INTO ${sql.identifier(relationTableName)}
                  (${sql.join(
                    columns.map((c) => sql.identifier(c)),
                    sql`, `
                  )})
                  VALUES (${sql.join(
                    values.map((v) => sql`${v}`),
                    sql`, `
                  )})`);

                await syncArrayRowFiles(
                  tx,
                  relationTableName,
                  arrayItemId,
                  fieldDef.items.properties,
                  item,
                  'collection'
                );
              }
            }
          }
        }
      }

      // Handle file fields (relation tables)
      if (Object.keys(fileFields).length > 0) {
        for (const [fieldName, fieldValue] of Object.entries(fileFields)) {
          const fileTableName = `${tablePrefix}_${fieldName}`;
          const fileTable = schema[fileTableName as keyof typeof schema];
          if (!fileTable) continue;

          await tx.run(sql`
            DELETE FROM ${sql.identifier(fileTableName)}
            WHERE parent_id = ${entityId} AND parent_type = 'collection'
          `);

          if (!fieldValue) continue;

          const rawValues: any[] = Array.isArray(fieldValue) ? fieldValue : [fieldValue];
          const fileIds: (string | null)[] = rawValues.map((val) => {
            if (val && typeof val === 'object') {
              return (val as any).id ?? null;
            }
            return (val as any) ?? null;
          });

          for (let i = 0; i < fileIds.length; i++) {
            const fileId = fileIds[i];
            if (!fileId) continue;
            await tx.run(sql`
              INSERT INTO ${sql.identifier(fileTableName)}
              (${sql.join(
                [
                  sql.identifier('id'),
                  sql.identifier('parent_id'),
                  sql.identifier('parent_type'),
                  sql.identifier('file_id'),
                  sql.identifier('sort'),
                  sql.identifier('created_at')
                ],
                sql`, `
              )})
              VALUES (${generateUUID()}, ${entityId}, 'collection', ${fileId}, ${i}, ${getCurrentTimestampSeconds()})
            `);
          }
        }
      }

      // Handle many-to-many relation fields (junction tables)
      if (Object.keys(relationFields).length > 0) {
        for (const [fieldName, relationItems] of Object.entries(relationFields)) {
          const fieldDef = collectionFields[fieldName];
          if (fieldDef?.type !== 'relation') continue;

          let junctionTableName =
            fieldDef.relation?.through || `junction_${junctionPrefix}_${toSnakeCase(fieldName)}`;
          let junctionTable = schema[junctionTableName as keyof typeof schema];

          if (!junctionTable && !fieldDef.relation?.through) {
            junctionTableName = `junction_${junctionPrefix}_${fieldName}`;
            junctionTable = schema[junctionTableName as keyof typeof schema];
          }

          if (!junctionTable) continue;

          await tx.run(sql`
            DELETE FROM ${sql.identifier(junctionTableName)}
            WHERE collection_id = ${entityId}
          `);

          for (const item of relationItems as any[]) {
            const targetId =
              typeof item === 'string' ? item : item && item.id ? item.id : undefined;
            if (!targetId) continue;

            await tx.run(sql`
              INSERT INTO ${sql.identifier(junctionTableName)}
              (${sql.join(
                [
                  sql.identifier('id'),
                  sql.identifier('collection_id'),
                  sql.identifier('target_id'),
                  sql.identifier('created_at'),
                  sql.identifier('updated_at')
                ],
                sql`, `
              )})
              VALUES (${generateUUID()}, ${entityId}, ${targetId}, ${getCurrentTimestampSeconds()}, ${getCurrentTimestampSeconds()})
            `);
          }
        }
      }

      // Handle blocks if any
      if (formData.blocks && Array.isArray(formData.blocks)) {
        for (const blockTypeSlug of Object.keys(availableBlocks)) {
          const blockTable = schema[`block_${blockTypeSlug}` as keyof typeof schema];
          if (blockTable) {
            const blockFileFields = Object.entries(
              availableBlocks[blockTypeSlug]?.fields || {}
            ).filter(([, fieldDef]: [string, any]) => (fieldDef as any)?.type === 'file');

            for (const [fieldName] of blockFileFields) {
              const fileTableName = `block_${blockTypeSlug}_${fieldName}`;
              const fileTable = schema[fileTableName as keyof typeof schema];
              if (fileTable) {
                await tx.run(sql`
                  DELETE FROM ${sql.identifier(fileTableName)}
                  WHERE parent_type = 'block' AND parent_id IN (
                    SELECT id FROM ${sql.identifier(`block_${blockTypeSlug}`)}
                    WHERE collection_id = ${entityId}
                  )
                `);
              }
            }

            await tx.run(sql`
              DELETE FROM ${sql.identifier(`block_${blockTypeSlug}`)}
              WHERE collection_id = ${entityId}
            `);
          }
        }

        for (const block of formData.blocks) {
          const blockType = availableBlocks[block.blockType];
          if (!blockType) continue;

          const SYSTEM_COLUMNS = new Set([
            'id',
            'collection_id',
            'sort',
            'created_at',
            'updated_at'
          ]);

          const blockTagFields: Record<string, any[]> = {};
          const allowedContentEntries = Object.entries(block.content || {}).filter(
            ([key, value]) => {
              if (SYSTEM_COLUMNS.has(key)) return false;
              const fieldDef = blockType.fields?.[key];
              if (!fieldDef) return false;
              if (fieldDef.type === 'array') return false;
              if (fieldDef.type === 'file') return false;
              if (fieldDef.type === 'relation' && fieldDef.relation?.type === 'many-to-many')
                return false;
              if (fieldDef.type === 'tags') {
                try {
                  const raw = typeof value === 'string' ? JSON.parse(value) : value;
                  blockTagFields[key] = Array.isArray(raw) ? raw : [];
                } catch {
                  blockTagFields[key] = Array.isArray(value) ? value : [];
                }
                return false;
              }
              return true;
            }
          );
          const filteredContent: Record<string, any> = Object.fromEntries(allowedContentEntries);

          for (const [fieldName, fieldDef] of Object.entries(blockType.fields || {})) {
            const f = fieldDef as any;
            if (f?.type !== 'relation') continue;
            const relType = f?.relation?.type;
            if (relType !== 'one-to-one' && relType !== 'one-to-many') continue;
            if (!(fieldName in filteredContent)) continue;
            let v: any = filteredContent[fieldName];
            try {
              v = typeof v === 'string' && v.startsWith('{') ? JSON.parse(v) : v;
            } catch {}
            if (Array.isArray(v) && v.length > 0) v = v[0]?.id || v[0] || null;
            else if (typeof v === 'object' && v !== null) v = v.id || null;
            filteredContent[fieldName] = v ?? null;
          }

          for (const [fieldName, fieldDef] of Object.entries(blockType.fields || {})) {
            const f = fieldDef as any;
            if (SYSTEM_COLUMNS.has(fieldName)) continue;
            if (filteredContent[fieldName] !== undefined) continue;
            if (!f?.required) continue;
            if (f?.type === 'array' || f?.type === 'file') continue;
            if (f?.type === 'relation' && f?.relation?.type === 'many-to-many') continue;
            if (f?.type === 'boolean') filteredContent[fieldName] = false;
            else if (f?.type === 'number' || f?.type === 'integer') filteredContent[fieldName] = 0;
            else filteredContent[fieldName] = '';
          }

          const blockNowSec = getCurrentTimestampSeconds();
          const blockData = {
            ...filteredContent,
            id: block.id || generateUUID(),
            collection_id: entityId,
            sort: block.sort ?? 0,
            created_at: blockNowSec,
            updated_at: blockNowSec
          };

          for (const [, tags] of Object.entries(blockTagFields)) {
            const tagNames = (Array.isArray(tags) ? tags : [])
              .map((t: any) =>
                typeof t === 'object' && t !== null
                  ? t.name || t.value || undefined
                  : typeof t === 'string'
                    ? t
                    : undefined
              )
              .filter(Boolean) as string[];
            pendingBlockTags.push({
              blockType: block.blockType,
              blockId: blockData.id,
              tagNames
            });
          }

          const blockTable = schema[`block_${block.blockType}` as keyof typeof schema];
          if (blockTable) {
            await tx.run(sql`
              INSERT OR REPLACE INTO ${sql.identifier(`block_${block.blockType}`)}
              (${sql.join(
                Object.keys(blockData).map((key) => sql.identifier(key)),
                sql`, `
              )})
              VALUES (${sql.join(
                Object.values(blockData).map((val) => sql`${val}`),
                sql`, `
              )})`);

            const blockArrayFields: Record<string, any[]> = {};
            Object.entries(block.content).forEach(([key, value]) => {
              const fieldDef = blockType.fields[key];
              if (fieldDef?.type === 'array') {
                blockArrayFields[key] = value as any[];
              }
            });

            if (Object.keys(blockArrayFields).length > 0) {
              await saveNestedArrayFields(
                tx,
                { id: blockData.id, blockType: block.blockType },
                blockType.fields,
                blockArrayFields
              );
            }

            const blockRelationFields = Object.entries(blockType.fields || {}).filter(
              ([, fieldDef]: [string, any]) =>
                fieldDef?.type === 'relation' && fieldDef?.relation?.type === 'many-to-many'
            );

            for (const [fieldName] of blockRelationFields as [string, any][]) {
              let junctionTableName = `junction_${block.blockType}_${toSnakeCase(fieldName)}`;
              let junctionTable = schema[junctionTableName as keyof typeof schema];

              if (!junctionTable) {
                junctionTableName = `junction_${block.blockType}_${fieldName}`;
                junctionTable = schema[junctionTableName as keyof typeof schema];
              }

              if (!junctionTable) continue;

              await tx.run(sql`
                DELETE FROM ${sql.identifier(junctionTableName)}
                WHERE block_id = ${blockData.id}
              `);

              const fieldValue = (block.content || {})[fieldName];
              if (!fieldValue || !Array.isArray(fieldValue)) continue;

              for (const relatedId of fieldValue) {
                const targetId = typeof relatedId === 'object' ? relatedId.id : relatedId;
                if (!targetId) continue;

                await tx.run(sql`
                  INSERT INTO ${sql.identifier(junctionTableName)}
                  (id, block_id, target_id, created_at, updated_at)
                  VALUES (${generateUUID()}, ${blockData.id}, ${targetId}, ${getCurrentTimestampSeconds()}, ${getCurrentTimestampSeconds()})
                `);
              }
            }

            const blockFileFieldsSave = Object.entries(blockType.fields || {}).filter(
              ([, fieldDef]: [string, any]) => fieldDef?.type === 'file'
            );

            for (const [fieldName] of blockFileFieldsSave as [string, any][]) {
              const fileTableName = `block_${block.blockType}_${fieldName}`;
              const fileTable = schema[fileTableName as keyof typeof schema];
              if (!fileTable) continue;

              await tx.run(sql`
                DELETE FROM ${sql.identifier(fileTableName)}
                WHERE parent_id = ${blockData.id} AND parent_type = 'block'
              `);

              const fieldValue = (block.content || {})[fieldName];
              if (!fieldValue) continue;

              const rawValues: any[] = Array.isArray(fieldValue) ? fieldValue : [fieldValue];
              const fileIds: (string | null)[] = rawValues.map((val) => {
                if (val && typeof val === 'object') {
                  return (val as any).id ?? null;
                }
                return (val as any) ?? null;
              });

              for (let i = 0; i < fileIds.length; i++) {
                const fileId = fileIds[i];
                if (!fileId) continue;
                await tx.run(sql`
                  INSERT INTO ${sql.identifier(fileTableName)}
                  (${sql.join(
                    [
                      sql.identifier('id'),
                      sql.identifier('parent_id'),
                      sql.identifier('parent_type'),
                      sql.identifier('file_id'),
                      sql.identifier('sort'),
                      sql.identifier('created_at')
                    ],
                    sql`, `
                  )})
                  VALUES (${generateUUID()}, ${blockData.id}, 'block', ${fileId}, ${i}, ${getCurrentTimestampSeconds()})
                `);
              }
            }
          }
        }
      }

      return { itemId, entityId, tablePrefix };
    });

    // Post-tx: tags, search reindex, revisions. Each one is non-blocking for
    // the others — a failure in revisions shouldn't undo the save or block
    // the search index update.

    if (Object.keys(tagFields).length > 0) {
      const taggableType = result.tablePrefix;
      const taggableId = result.entityId;
      for (const [, tags] of Object.entries(tagFields)) {
        const tagNames = Array.isArray(tags)
          ? ((tags as any[])
              .map((t: any) =>
                typeof t === 'object' && t !== null
                  ? t.name || t.value || undefined
                  : typeof t === 'string'
                    ? t
                    : undefined
              )
              .filter(Boolean) as string[])
          : [];
        await TagService.tagEntity(taggableType, taggableId, tagNames);
      }
    }

    for (const { blockType, blockId, tagNames } of pendingBlockTags) {
      await TagService.tagEntity(`block_${blockType}`, blockId, tagNames);
    }

    await SearchIndexService.onSaveSafe(
      'collection',
      collectionSlug,
      result.itemId,
      currentLocale ?? undefined
    );

    // Snapshot a revision when the template opts in. For localized collections,
    // `entityId` is the `_locales` row id, so revisions are scoped per-translation.
    const revisionKeep = resolveRevisionsKeep(collectionOptions.revisions);
    if (revisionKeep !== null) {
      try {
        await RevisionsService.create({
          entityType: `collection:${collectionSlug}`,
          entityId: result.entityId,
          data: formData,
          userId: user?.id ?? null,
          keep: revisionKeep
        });
      } catch (err) {
        log.error(
          'Failed to create revision',
          { collectionSlug, itemId: result.itemId },
          err as Error
        );
      }
    }

    // Return the persisted row so the client can re-hydrate without a full
    // route reload. For localized collections the canonical content lives on
    // `_locales` — joining main + locales (and letting locales overwrite on
    // key collision) yields the same shape the loader produces. Pull only
    // identity from main when localized; main content columns may have been
    // dropped by `doctor --fix`.
    const localizedMainIdentity = isLocalized
      ? {
          id: (collectionTable as any).id,
          created_at: (collectionTable as any).created_at,
          deleted_at: (collectionTable as any).deleted_at,
          deleted_by: (collectionTable as any).deleted_by,
          author: (collectionTable as any).author
        }
      : null;
    const [mainRow] = await (
      localizedMainIdentity
        ? db.select(localizedMainIdentity).from(collectionTable)
        : db.select().from(collectionTable)
    )
      .where(eq((collectionTable as any).id, result.itemId))
      .limit(1);
    let savedRow: any = mainRow;
    if (isLocalized && localesTable && result.entityId) {
      const [localeRow] = await db
        .select()
        .from(localesTable)
        .where(eq((localesTable as any).id, result.entityId))
        .limit(1);
      if (localeRow) {
        savedRow = { ...mainRow, ...localeRow, id: mainRow.id, _localeId: localeRow.id };
      }
    }
    // Tags are keyed by the per-locale row id for localized collections.
    const tagTaggableId = result.entityId ?? result.itemId;
    const savedTags = await TagService.getTagsForEntity(
      `collection_${collectionSlug}`,
      tagTaggableId
    );

    return {
      success: true,
      message: 'Item saved successfully',
      itemId: result.itemId,
      entityId: result.entityId,
      item: savedRow,
      tags: savedTags
    };
  } catch (error) {
    log.error('Failed to save collection item', {}, error as Error);

    // Walk the error chain — libsql/drizzle put the human SQLite reason on `cause`
    const parts: string[] = [];
    const seen = new Set<any>();
    let current: any = error;
    while (current && !seen.has(current)) {
      seen.add(current);
      if (current.message) parts.push(String(current.message));
      if (current.code) parts.push(String(current.code));
      current = current.cause;
    }
    const blob = parts.join(' ');

    let friendly: string;
    const uniqueAny = blob.match(/UNIQUE constraint failed:\s*([^\s\n,]+)/i);
    const notNull = blob.match(/NOT NULL constraint failed:\s*([^\s\n,]+)/i);
    if (uniqueAny) {
      friendly = `Duplicate value for ${uniqueAny[1]}.`;
    } else if (notNull) {
      friendly = `Required field missing: ${notNull[1]}.`;
    } else if (/FOREIGN KEY constraint failed/i.test(blob)) {
      friendly = 'Referenced item no longer exists.';
    } else {
      friendly = error instanceof Error ? error.message : 'Failed to save item';
    }

    return { success: false, error: friendly };
  }
}
