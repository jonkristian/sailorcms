# Template lifecycle hooks

Declare `hooks: { afterCreate?, afterUpdate? }` on a collection or global template to react to content events without wiring the side-effect into every save endpoint. The killer use cases:

- Submission-form mail notifications
- External search reindex (Algolia, Meilisearch)
- CDN cache invalidation (Cloudflare, Vercel)
- Webhook fan-out to N external endpoints
- Email subscribers on publish
- Cross-collection sync (saving a Project updates a related Activity row)

## Shape

```ts
import type { GlobalDefinition } from 'sailorcms/core/types';
import { sendMail } from 'sailorcms/core/utils/mail';

export const submissionsGlobal: GlobalDefinition = {
  name: { singular: 'Submission', plural: 'Submissions' },
  slug: 'submissions',
  description: 'Public contact-form submissions',
  dataType: 'repeatable',
  fields: {
    subject: { type: 'string', required: true },
    email: { type: 'email', required: true },
    message: { type: 'textarea', required: true }
  },
  hooks: {
    afterCreate: async ({ item, log }) => {
      log.info('new submission', { id: item.id, email: item.email });
      await sendMail({
        to: 'team@example.com',
        subject: `New submission: ${item.subject}`,
        text: `From ${item.email}\n\n${item.message}`
      });
    }
  }
};
```

That's it. The hook fires after every save committed through the admin or through `createGlobalItem`. No per-endpoint wiring.

## When hooks fire

| Event         | Triggers                                                                                                                                            |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `afterCreate` | A new row is inserted into the main table — OR a new `_locales` row is inserted for an existing item (each translation is a discrete content event) |
| `afterUpdate` | An existing main row is updated — OR an existing `_locales` row is updated                                                                          |

Both fire **after** the write commits and after sailor's own post-write side-effects (search reindex, tags, revisions) run. The hook sees a fully-committed item.

For localized entities, `ctx.locale` is set to the BCP-47 code of the `_locales` row that just saved. Use it to branch ("only notify on `nb-NO` saves") or to refetch the right translation.

## Context

```ts
interface TemplateHookCtx {
  item: Record<string, unknown>; // post-write row (see below)
  slug: string;
  kind: 'collection' | 'global';
  user: { id: string; email: string; name: string; role: string } | null;
  locale?: string; // localized entities only
  log: Logger; // sailor's structured logger
}
```

**`item` is the raw row** — block content, file relations, and many-to-many relations are NOT auto-hydrated. If your hook needs the enriched shape, call `getCollections({ itemId: ctx.item.id })` or `getGlobals({ itemId: ctx.item.id })` from inside the hook.

**`user` is `null`** for system writes (notably `createGlobalItem` from a public `+server.ts` endpoint — no session there). Use `ctx.item.author` if you need the actor id for those paths.

**No `previousItem` in v1.** Diff / change-detection use cases (e.g. "email only when status flipped to published") need v2's pre-write capture. Workaround for now: re-fetch the previous state from a sibling table you maintain, or denormalize the bit you need (e.g. `published_at: Date | null` and check for transition).

## What hooks can do

- Call any helper or external API (`fetch`, `sendMail`, third-party SDKs)
- Read the database via the sailor utils (`getCollections`, `getGlobals`)
- Write to other collections via `createGlobalItem` (or the admin path)
- Throw — the framework catches and logs (your write is not rolled back)

## What hooks should NOT do

- **Long-running work** (image analysis, social-card generation, large fetches). The hook is synchronous in the save path; a slow hook = slow save. Queue these instead with your own job runner.
- **Block-level reactions.** Blocks save as part of the parent collection's write. Branch inside the parent's `afterUpdate` if you need block-specific behavior.
- **Validate or abort the write.** v1 has no `before*` hooks; once `afterCreate` fires, the row is already in the DB. Validation belongs at the form layer (or a future `beforeCreate` in v2).

## Error semantics

A hook that throws is caught by the framework. The error goes to sailor's structured logger; in dev mode it also `console.warn`s for visibility (silent failure is the worst dev experience).

**A failing hook never rolls back the user write.** This is deliberate — the user's content save is the primary operation; the hook is a side-effect. If you need at-least-once delivery for your notification / webhook / sync, implement retry in the hook itself or queue from the hook and let your queue handle delivery semantics.

## Reentrancy

Hooks may trigger other writes that fire their own hooks. A simple chain like `afterCreate on submissions → createGlobalItem on activity_log` is fine.

The framework enforces a depth limit of **3** via `AsyncLocalStorage`. A runaway chain (hook on A writes B → hook on B writes A → ...) throws clearly at depth 4 instead of exhausting the DB pool. If you hit this limit, your hooks are looping; break the cycle.

## Performance

Hooks add nothing to a save that doesn't declare them (zero-cost when absent). When declared, the post-tx hook runner adds:

- One `SELECT` for the post-write row (`saveGlobalItem` only — `saveCollectionItem` already fetched it)
- The hook's own runtime

Keep hook bodies fast or push them to a queue. A 2-second `sendMail` adds 2 seconds to the admin save's perceived latency.

## Out of scope (v1)

| Feature                                       | Why deferred                                                                                                              | Workaround                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `beforeCreate` / `beforeUpdate`               | Mutation + abort semantics need careful design (do you re-run validation? how do errors surface to the editor?)           | Validate at the form layer                                                  |
| `afterDelete`                                 | Sailor uses soft-delete + recovery; "after delete" is ambiguous (soft? hard? both?). Will land with explicit naming in v2 | None — re-design pending                                                    |
| `previousItem` snapshot                       | Cheap to add lazily but no concrete consumer yet; v2 will pick a shape based on demand                                    | Denormalize the bit you need, or re-fetch from a sibling table you maintain |
| Tight `item` typing                           | Requires generator changes to thread per-template row types                                                               | Cast `ctx.item as MyTemplateRow` if you've imported the generated type      |
| Admin observability (hook badge, run history) | Useful but orthogonal — ships when consumer demand surfaces                                                               | Log from inside the hook; tail with your existing log infrastructure        |
| Block-level hooks                             | Blocks belong to their parent; surfacing them separately doubles the API                                                  | Branch inside the parent's `afterUpdate` on `ctx.item.blocks`               |

## Reference: every call site that fires hooks

| Code path                                              | Fires                                               |
| ------------------------------------------------------ | --------------------------------------------------- |
| Admin collection save (`saveCollectionItem` persister) | `afterCreate` on new row, `afterUpdate` on existing |
| Admin global save (`saveGlobalItem` persister)         | Same, for globals                                   |
| `createGlobalItem` (public-endpoint utility)           | `afterCreate` only; `user: null`                    |

Recovery routes (restore, hard delete) and bulk imports (WordPress import) **do not** fire hooks — they bypass the persisters by design. If you need to react to a WordPress import, run a post-import script.
