// Template lifecycle hooks (v1).
//
// Templates can declare `hooks: { afterCreate?, afterUpdate? }` to react to
// content events without wrapping every save site. The killer cases:
// submission-form mail notifications, external search reindex, CDN cache
// invalidation, webhook fan-out, cross-collection sync.
//
// Semantics:
//  - After-only in v1 (no `beforeCreate`/`beforeUpdate` mutation/abort).
//  - `afterDelete` deferred (sailor's soft-delete vs hard-delete makes the
//    surface ambiguous; revisit in v2 with clearer naming).
//  - Hooks fire AFTER the write commits. A hook that throws cannot roll back
//    the user write — the framework catches, logs, and continues. Production
//    failures go to the structured logger; dev mode also `console.warn`s for
//    visibility.
//  - Reentrancy is depth-limited (3). A hook that triggers another write
//    will fire that entity's hooks too, but a runaway chain throws clearly
//    instead of exhausting the DB pool.
//  - For localized entities, the hook fires PER `_locales` row save with
//    `ctx.locale` set. Each translation is a discrete content event.
//
// Out of scope for v1 (documented):
//  - Long-running derived-data generation (image analysis, social-card render)
//    — those need queues; do them outside the save path.
//  - Block-level hooks. Blocks save as part of their parent collection's
//    write; consumers branch inside the parent's `afterUpdate` if they need
//    block-specific behavior.
//  - Tight item typing. `ctx.item` is `Record<string, unknown>` in v1;
//    consumers can cast to the generated row type if they want. Tightening
//    is a generator-side change for v2.

import { AsyncLocalStorage } from 'node:async_hooks';
import { log } from 'sailorcms/core/utils/logger';

export type TemplateHookKind = 'collection' | 'global';
export type TemplateHookEvent = 'afterCreate' | 'afterUpdate';

export interface TemplateHookUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface TemplateHookCtx<T = Record<string, unknown>> {
  /**
   * The post-write row. Raw row data only — block content, file relations,
   * and many-to-many relations are NOT auto-hydrated. If you need the
   * enriched shape, call `getCollections({ itemId: ctx.item.id })` or
   * `getGlobals({ itemId: ctx.item.id })` from inside the hook.
   *
   * For localized entities, this is the `_locales` row that just saved
   * (merged with main-table identity columns).
   */
  item: T;
  /** The collection/global slug. */
  slug: string;
  /** Whether the entity is a collection or global. */
  kind: TemplateHookKind;
  /**
   * The user who triggered the save, or null for system / public-endpoint
   * writes (e.g. `createGlobalItem` from a contact-form `+server.ts` doesn't
   * have a session user).
   */
  user: TemplateHookUser | null;
  /**
   * BCP-47 locale whose `_locales` row just saved. Only set on localized
   * entity saves; absent on non-localized entities.
   */
  locale?: string;
  /**
   * Sailor's structured logger — use this instead of `console.*` so hook
   * output flows through the same log routing as the rest of the framework
   * (file sinks, log levels, structured fields).
   */
  log: typeof log;
}

export interface TemplateHooks<T = Record<string, unknown>> {
  /**
   * Fires after a new item is inserted. For localized entities, fires per
   * `_locales` row save with `ctx.locale` set — each translation is a
   * discrete content event.
   */
  afterCreate?: (ctx: TemplateHookCtx<T>) => void | Promise<void>;
  /**
   * Fires after an existing item is updated. v1 ships without a pre-write
   * snapshot — `ctx.item` is the post-write row only. A `getPreviousItem`
   * lazy callback (or opt-in pre-write capture) is queued for v2 once the
   * diff / change-detection use cases prove out.
   */
  afterUpdate?: (ctx: TemplateHookCtx<T>) => void | Promise<void>;
}

const MAX_HOOK_DEPTH = 3;
const depthStore = new AsyncLocalStorage<number>();

/**
 * Run a single template hook with try/catch + depth tracking. Never throws.
 * Caller must not rely on hook success for the user write — the write has
 * already committed by the time we get here.
 */
export async function runTemplateHook(
  event: TemplateHookEvent,
  hooks: TemplateHooks | undefined,
  ctx: TemplateHookCtx
): Promise<void> {
  if (!hooks) return;
  const fn = hooks[event];
  if (!fn) return;

  const depth = (depthStore.getStore() ?? 0) + 1;
  if (depth > MAX_HOOK_DEPTH) {
    log.error('Template hook depth exceeded — skipping', {
      event,
      slug: ctx.slug,
      kind: ctx.kind,
      depth,
      max: MAX_HOOK_DEPTH
    });
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        `⚠ sailor: template hook depth exceeded (${MAX_HOOK_DEPTH}) for ${ctx.kind}:${ctx.slug} ${event} — chain skipped`
      );
    }
    return;
  }

  try {
    await depthStore.run(depth, async () => {
      await fn(ctx);
    });
  } catch (err) {
    log.error('Template hook threw', {
      event,
      slug: ctx.slug,
      kind: ctx.kind,
      locale: ctx.locale,
      itemId: (ctx.item as { id?: string })?.id,
      error: err
    });
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        `⚠ sailor: ${ctx.kind}:${ctx.slug} ${event} hook threw — see logger for details:\n  `,
        (err as Error)?.message ?? err
      );
    }
  }
}
