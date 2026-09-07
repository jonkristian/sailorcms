// Global-item persister.
//
// Mirror of `collection-item.server.ts` for globals. Handles both flat
// (singleton) and repeatable globals, with localized + non-localized routing
// internalized so callers (admin routes, future API endpoints) don't have to
// know about the storage shape.
//
// Auth is the caller's responsibility — pass `canCreate` / `canUpdate`
// pre-resolved.
//
// Relational dataType isn't wired through this persister yet (uncommon usage
// in practice); the existing `updateRelationalGlobal` command in the route
// keeps its inline logic for now and can be migrated in a follow-up.

import { db } from '../../db/index.server';
import { eq, and, sql } from 'drizzle-orm';
import * as schema from '$sailor/generated/schema';
import { fieldConfigurations } from '$sailor/generated/fields';
import { globalDefinitions } from '$sailor/templates/globals';
import { generateUUID, slugify, normalizeRelationId } from '../../utils/common';
import { ensureUniqueSlug } from '../../utils/slug';
import { TagService } from '../../services/tag.server';
import { SearchIndexService } from '../../services/search-index.server';
import { toSnakeCase } from '../../utils/string';
import { persistReverseRelations } from './reverse-relations.server';
import { getCurrentTimestamp, getCurrentTimestampSeconds } from '../../utils/date';
import { syncArrayRowFiles, clearArrayRowFiles } from './array-row-files.server';
import { getContentSettings } from '../../settings/i18n';
import { log } from '../../utils/logger';
import { runTemplateHook, type TemplateHookUser } from '../../hooks/template-hooks';

export interface SaveGlobalItemOptions {
  globalSlug: string;
  /**
   * Item id. For flat globals, defaults to `globalSlug` (singleton convention).
   * For repeatable globals, defaults to a fresh UUID if omitted (create-new
   * flow). Pass an existing id to update.
   */
  itemId?: string;
  data: Record<string, any>;
  /**
   * Pre-resolved user from the request context. `email` / `name` / `role`
   * are optional — passing the full shape forwards real values to template
   * lifecycle hooks (`ctx.user`); passing only `{ id }` is backwards-compat
   * but leaves hook ctx fields empty.
   */
  user: TemplateHookUser | { id: string } | null;
  canCreate: boolean;
  canUpdate: boolean;
  /**
   * Locale override for localized globals. Resolution order:
   *   1. This argument
   *   2. `data.locale` (so form payloads can carry it)
   *   3. `content.i18n.default` from settings
   */
  locale?: string;
}

export interface SaveGlobalItemResult {
  success: boolean;
  error?: string;
  itemId?: string;
  /** `_locales.id` for localized, same as `itemId` for non-localized. */
  entityId?: string;
}

/**
 * Save a global item — create or update. Handles flat + repeatable globals,
 * localized + non-localized. See `SaveGlobalItemOptions` for the contract.
 */
export async function saveGlobalItem(opts: SaveGlobalItemOptions): Promise<SaveGlobalItemResult> {
  const { globalSlug, data, user, canCreate, canUpdate, locale } = opts;

  if (!globalSlug || !data) {
    return { success: false, error: 'Global slug and data are required' };
  }

  if (!user?.id) {
    return { success: false, error: 'Unauthorized' };
  }

  if (!canUpdate && !canCreate) {
    return { success: false, error: 'You do not have permission to update content' };
  }

  try {
    const globalTypeRow = await db.query.globalTypes.findFirst({
      where: eq(schema.globalTypes.slug, globalSlug)
    });

    if (!globalTypeRow) {
      return { success: false, error: 'Global not found' };
    }

    const dataType = globalTypeRow.data_type;
    if (dataType !== 'flat' && dataType !== 'repeatable') {
      return {
        success: false,
        error: `saveGlobalItem doesn't yet support data_type='${dataType}'. Use the legacy command path.`
      };
    }
    const isFlat = dataType === 'flat';

    const globalFields = JSON.parse(globalTypeRow.schema);

    // For flat globals, the id is the slug (singleton convention). For
    // repeatable, use the provided id or generate a fresh one (create path).
    //
    // `data.id` is accepted as a fallback because a form payload naturally
    // carries it: without this, passing the id inside `data` silently takes the
    // create branch and fails as "no permission to create content", which
    // points nowhere near the cause.
    const itemId = isFlat ? globalSlug : opts.itemId || (data as any)?.id || generateUUID();

    // Categorize fields — same pattern as collections.
    const arrayFields: Record<string, any[]> = {};
    const fileFields: Record<string, any> = {};
    const tagFields: Record<string, any[]> = {};
    // Many-to-many values live in a junction, not on the main row — the
    // generator emits no column for them. They must not reach `regularFields`.
    const manyToManyFields: Record<string, any[]> = {};
    const reverseFields: Record<string, any[]> = {};
    const regularFields: Record<string, any> = {};

    Object.entries(data).forEach(([key, value]) => {
      const fieldDef = globalFields[key];

      if (fieldDef?.type === 'array') {
        try {
          arrayFields[key] = Array.isArray(value) ? value : [value];
        } catch (error) {
          log.warn(`Failed to parse array field ${key}`, { value, error });
          arrayFields[key] = [];
        }
      } else if (fieldDef?.type === 'file') {
        fileFields[key] = value;
      } else if (fieldDef?.type === 'tags') {
        let parsedTags = value;
        if (typeof value === 'string') {
          try {
            parsedTags = JSON.parse(value);
          } catch {
            parsedTags = [];
          }
        }
        tagFields[key] = Array.isArray(parsedTags) ? parsedTags : [];
      } else if (fieldDef?.type === 'relation' && fieldDef?.relation?.type === 'many-to-many') {
        manyToManyFields[key] = Array.isArray(value) ? value : [];
      } else if (fieldDef?.type === 'reverse') {
        // Written to the forward side's junction, never to a column here.
        reverseFields[key] = Array.isArray(value) ? value : [];
      } else if (key !== 'id' && fieldDef) {
        regularFields[key] = value;
      }
    });

    if (regularFields.slug) regularFields.slug = slugify(String(regularFields.slug));

    const globalTable = schema[`global_${globalSlug}` as keyof typeof schema];
    if (!globalTable) {
      return { success: false, error: `Global table for '${globalSlug}' not found` };
    }

    // Localized detection + locale resolution.
    const isLocalized = (fieldConfigurations as any).globals?.[globalSlug]?.localized === true;
    const localesTable = isLocalized
      ? (schema[`global_${globalSlug}_locales` as keyof typeof schema] as any)
      : null;
    const currentLocale = isLocalized
      ? locale ||
        (typeof data.locale === 'string' && data.locale.trim()) ||
        getContentSettings().defaultLocale
      : null;
    const fkField = `${globalSlug}_id`;

    if (isLocalized && !currentLocale) {
      return {
        success: false,
        error: `saveGlobalItem('${globalSlug}'): no locale resolved. Pass data.locale or set content.i18n.default.`
      };
    }

    let entityId: string = itemId;
    // Whether this save is a CREATE vs UPDATE — tracked in the outer scope
    // so the post-tx hook firing knows which event to dispatch. For
    // localized globals, each translation save is a discrete event: a new
    // `_locales` row counts as CREATE even if the main row pre-existed.
    let wasCreate = false;
    // Child tables anchor on `global_<slug>` for both modes. For localized
    // rows the FK columns reference the `_locales` row id (`entityId`
    // post-upsert).
    const tablePrefix = `global_${globalSlug}`;

    await db.transaction(async (tx: any) => {
      const now = getCurrentTimestamp();

      if (isLocalized && localesTable && currentLocale) {
        // ── Localized save path ──────────────────────────────────────────
        // Main keeps its full shape (additive across the localized flip);
        // canonical editable content lands in `_locales` keyed on
        // (item_id, locale). Pre-migration content columns on main stay
        // until `sailor doctor` is run with --fix.

        // 1. Identity row (main): upsert. Flat globals enforce id = slug
        // singleton; repeatable use whatever itemId was passed/generated.
        const existingMain = await tx
          .select({ id: (globalTable as any).id })
          .from(globalTable)
          .where(eq((globalTable as any).id, itemId))
          .limit(1);

        if (existingMain.length === 0) {
          if (!canCreate) throw new Error('You do not have permission to create content');
          await tx.insert(globalTable).values({ id: itemId, created_at: now });
        } else if (!canUpdate) {
          throw new Error('You do not have permission to update this content');
        }

        // 2. Content row (_locales): upsert keyed on (item_id, locale).
        const localeContentKeys = Object.keys(globalFields).filter(
          (key) => !['id', 'created_at', 'updated_at', 'last_modified_by'].includes(key)
        );
        const payloadLocale: Record<string, any> = {};
        for (const [k, v] of Object.entries(regularFields)) {
          if (!localeContentKeys.includes(k)) continue;
          if (k === 'parent_id') {
            let vv: any = v;
            if (Array.isArray(vv) && vv.length > 0) vv = vv[0]?.id || vv[0] || null;
            else if (typeof vv === 'object' && vv !== null) vv = (vv as any).id || null;
            payloadLocale[k] = vv;
          } else {
            payloadLocale[k] = normalizeRelationId(k, v);
          }
        }

        const existingLocale = await tx
          .select({ id: localesTable.id })
          .from(localesTable)
          .where(and(eq(localesTable[fkField], itemId), eq(localesTable.locale, currentLocale)))
          .limit(1);

        // Slug uniqueness scoped to (slug, locale) when slug field exists.
        if (payloadLocale.slug && localesTable.slug) {
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
          await tx
            .update(localesTable)
            .set({
              ...payloadLocale,
              updated_at: now,
              last_modified_by: user.id
            })
            .where(eq(localesTable.id, entityId));
        } else {
          entityId = generateUUID();
          wasCreate = true;
          await tx.insert(localesTable).values({
            id: entityId,
            [fkField]: itemId,
            locale: currentLocale,
            updated_at: now,
            last_modified_by: user.id,
            ...payloadLocale
          });
        }
      } else {
        // ── Non-localized save path ─────────────────────────────────────
        const existing = await tx
          .select({ id: (globalTable as any).id })
          .from(globalTable)
          .where(eq((globalTable as any).id, itemId))
          .limit(1);

        if (regularFields.slug) {
          regularFields.slug = await ensureUniqueSlug({
            table: globalTable as any,
            slug: regularFields.slug,
            excludeId: itemId,
            tx
          });
        }

        if (existing.length > 0) {
          if (!canUpdate) throw new Error('You do not have permission to update this content');

          const updateFields = Object.keys(regularFields).filter(
            (key) => !['id', 'created_at', 'updated_at', 'sort'].includes(key)
          );

          if (updateFields.length > 0) {
            const updateData: Record<string, any> = {
              updated_at: now,
              last_modified_by: user.id
            };
            updateFields.forEach((key) => {
              if (key === 'parent_id') {
                let v: any = regularFields[key];
                if (Array.isArray(v) && v.length > 0) v = v[0]?.id || v[0] || null;
                else if (typeof v === 'object' && v !== null) v = (v as any).id || null;
                updateData[key] = v;
              } else {
                updateData[key] = normalizeRelationId(key, regularFields[key]);
              }
            });
            // Allow explicit sort updates from form payload (repeatable only).
            if (
              !isFlat &&
              data.sort !== undefined &&
              data.sort !== '' &&
              !isNaN(Number(data.sort))
            ) {
              updateData.sort = Number(data.sort);
            }

            await tx
              .update(globalTable)
              .set(updateData)
              .where(eq((globalTable as any).id, itemId));
          }
        } else {
          if (!canCreate) throw new Error('You do not have permission to create content');
          wasCreate = true;

          // Resolve author (only repeatable globals have author by default;
          // flat globals' main row was traditionally written with author too,
          // preserved here for compatibility).
          let authorValue: any = regularFields.author;
          if (Array.isArray(authorValue) && authorValue.length > 0) {
            authorValue = authorValue[0]?.id || authorValue[0] || user.id;
          } else if (typeof authorValue === 'object' && authorValue !== null) {
            authorValue = (authorValue as any).id || user.id;
          }
          if (!authorValue) authorValue = user.id;

          const insertData: Record<string, any> = {
            id: itemId,
            author: authorValue,
            last_modified_by: user.id,
            created_at: now,
            updated_at: now
          };
          if (!isFlat) insertData.sort = 0;

          Object.keys(regularFields).forEach((key) => {
            if (['id', 'created_at', 'updated_at'].includes(key)) return;
            // `author` and `last_modified_by` are pre-resolved above (line
            // 313 + line 324) and default to `user.id` when the form sends
            // an empty value. Skipping them here keeps that default — the
            // generic loop would otherwise clobber it with the empty
            // string the form-init seeds for every field.
            if (key === 'author' || key === 'last_modified_by') return;
            if (key === 'parent_id') {
              let v: any = regularFields[key];
              if (Array.isArray(v) && v.length > 0) v = v[0]?.id || v[0] || null;
              else if (typeof v === 'object' && v !== null) v = (v as any).id || null;
              insertData[key] = v;
            } else {
              insertData[key] = normalizeRelationId(key, regularFields[key]);
            }
          });

          await tx.insert(globalTable).values(insertData);
        }
      }

      // Handle array fields. For localized: tables under `<prefix>_<field>`
      // with `global_id` referencing the `_locales` row (entityId set above).
      for (const [fieldName, arrayItems] of Object.entries(arrayFields)) {
        const fieldDef = globalFields[fieldName];
        if (fieldDef?.type !== 'array' || !fieldDef?.items?.properties) continue;

        const snakeCaseFieldName = toSnakeCase(fieldName);
        const relationTableName = `${tablePrefix}_${snakeCaseFieldName}`;
        const relationTable = schema[relationTableName as keyof typeof schema];

        if (!relationTable) continue;

        // Get existing items + diff approach (matches the old commands).
        const existingItems = await tx
          .select()
          .from(relationTable)
          .where(eq((relationTable as any).global_id, entityId));

        const existingItemsMap = new Map(existingItems.map((item: any) => [item.id, item]));
        const newItemsMap = new Map(arrayItems.map((item: any) => [item.id, item]));

        const itemsToDelete = existingItems.filter((item: any) => !newItemsMap.has(item.id));

        for (const item of itemsToDelete) {
          await clearArrayRowFiles(
            tx,
            relationTableName,
            (item as any).id,
            fieldDef.items.properties
          );
          await tx.delete(relationTable).where(eq((relationTable as any).id, item.id));
        }

        for (let i = 0; i < arrayItems.length; i++) {
          const item = arrayItems[i];
          const existingItem = existingItemsMap.get(item.id);
          const arrayItemId = item.id || generateUUID();

          if (existingItem) {
            const updateData: Record<string, any> = {
              sort: i,
              updated_at: getCurrentTimestamp()
            };
            Object.entries(fieldDef.items.properties).forEach(([propKey, propDef]) => {
              if ((propDef as any).type === 'file') return;
              updateData[propKey] = (item as any)[propKey] || null;
            });
            await tx
              .update(relationTable)
              .set(updateData)
              .where(eq((relationTable as any).id, item.id));
          } else {
            const insertData: Record<string, any> = {
              id: arrayItemId,
              global_id: entityId,
              sort: i,
              created_at: getCurrentTimestamp(),
              updated_at: getCurrentTimestamp()
            };
            Object.entries(fieldDef.items.properties).forEach(([propKey, propDef]) => {
              if ((propDef as any).type === 'file') return;
              insertData[propKey] = (item as any)[propKey] || null;
            });
            await tx.insert(relationTable).values(insertData);
          }

          await syncArrayRowFiles(
            tx,
            relationTableName,
            arrayItemId,
            fieldDef.items.properties,
            item,
            'global'
          );
        }
      }

      // Reverse fields — edits made from the side that does not own the
      // relation. Reconciled by target rather than deleted wholesale.
      await persistReverseRelations(tx, globalFields, itemId, reverseFields);

      // Many-to-many fields. Anchored on the main row id (`itemId`), not the
      // `_locales` row — that is what `persistGlobalRelations` uses, and reads
      // have to find what writes put there. Delete-and-reinsert, so the
      // picker's array order becomes the junction's `sort`.
      for (const [fieldName, relationItems] of Object.entries(manyToManyFields)) {
        const fieldDef = globalFields[fieldName];
        const junctionTableName =
          fieldDef?.relation?.through || `junction_${globalSlug}_${toSnakeCase(fieldName)}`;
        if (!(schema as any)[junctionTableName]) continue;

        await tx.run(
          sql`DELETE FROM ${sql.identifier(junctionTableName)} WHERE global_id = ${itemId}`
        );

        let relationSort = 0;
        for (const entry of relationItems) {
          const targetId = typeof entry === 'object' && entry ? (entry as any).id : entry;
          if (!targetId) continue;
          await tx.run(
            sql`INSERT INTO ${sql.identifier(junctionTableName)}
                (id, global_id, target_id, sort, created_at, updated_at)
                VALUES (${generateUUID()}, ${itemId}, ${targetId}, ${relationSort}, ${getCurrentTimestampSeconds()}, ${getCurrentTimestampSeconds()})`
          );
          relationSort++;
        }
      }
    });

    // Handle tag fields outside the transaction to avoid lock contention.
    // `taggable_type = 'global_<slug>'` for both modes; for localized the
    // `taggable_id` is the `_locales` row id (entityId post-upsert).
    const tagTaggableType = `global_${globalSlug}`;
    for (const [fieldName, tags] of Object.entries(tagFields)) {
      try {
        const tagNames = TagService.toTagNames(tags);
        await TagService.tagEntity(tagTaggableType, entityId, tagNames);
      } catch (error) {
        log.error(`Failed to save tags for field ${fieldName}`, {}, error as Error);
      }
    }

    // Single file fields — write outside the tx to avoid locking the main row.
    for (const [fieldName, fileValue] of Object.entries(fileFields)) {
      try {
        const snake = toSnakeCase(fieldName);
        const relationTableName = `${tablePrefix}_${snake}`;
        const relationTable = (schema as any)[relationTableName];

        if (!relationTable) {
          log.warn(`File relation table not found: ${relationTableName}`, {
            fieldName,
            globalSlug
          });
          continue;
        }

        let fileId: any = fileValue;
        if (Array.isArray(fileId) && fileId.length > 0) {
          fileId = fileId[0]?.id || fileId[0] || null;
        } else if (typeof fileId === 'object' && fileId !== null) {
          fileId = (fileId as any).id || null;
        }

        await (db as any)
          .delete(relationTable)
          .where(
            and(
              eq((relationTable as any).parent_id, entityId),
              eq((relationTable as any).parent_type, 'global')
            )
          );

        if (fileId) {
          await (db as any).insert(relationTable).values({
            id: generateUUID(),
            parent_id: entityId,
            parent_type: 'global',
            file_id: fileId,
            sort: 0,
            created_at: getCurrentTimestamp()
          });
        }
      } catch (error) {
        log.error(`Failed to save file field ${fieldName}`, { fieldName }, error as Error);
      }
    }

    // Search reindex — pass locale so the right translation's row gets updated.
    await SearchIndexService.onSaveSafe('global', globalSlug, itemId, currentLocale ?? undefined);

    // Template lifecycle hook. Same contract as the collection persister:
    // fires after every post-tx side-effect (search reindex, tags, files);
    // for localized globals each translation save fires its own event with
    // `ctx.locale` set. Never throws — runner traps + logs.
    const hooksDecl = (globalDefinitions as Record<string, any>)[globalSlug]?.hooks;
    if (hooksDecl) {
      const [mainRow] = await db
        .select()
        .from(globalTable)
        .where(eq((globalTable as any).id, itemId))
        .limit(1);
      let savedRow: any = mainRow;
      if (isLocalized && localesTable && entityId) {
        const [localeRow] = await db
          .select()
          .from(localesTable)
          .where(eq((localesTable as any).id, entityId))
          .limit(1);
        if (localeRow) {
          savedRow = { ...mainRow, ...localeRow, id: mainRow.id, _localeId: localeRow.id };
        }
      }
      await runTemplateHook(wasCreate ? 'afterCreate' : 'afterUpdate', hooksDecl, {
        item: savedRow,
        slug: globalSlug,
        kind: 'global',
        user: {
          id: user.id,
          email: (user as TemplateHookUser).email ?? '',
          name: (user as TemplateHookUser).name ?? '',
          role: (user as TemplateHookUser).role ?? ''
        },
        locale: currentLocale ?? undefined,
        log
      });
    }

    return { success: true, itemId, entityId };
  } catch (error) {
    log.error('Failed to save global item', { globalSlug }, error as Error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save global item'
    };
  }
}
