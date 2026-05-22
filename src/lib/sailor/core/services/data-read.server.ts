/**
 * Framework-internal data reads.
 *
 * These helpers are intentionally outside `utils/data` because they bypass the
 * type-level `access` rule that `getGlobals` / `getCollections` enforce for
 * consumer reads. The bypass exists because some readers are the framework
 * itself — the search-index rebuild, save hooks, cron jobs, CLI commands —
 * which have no user context to authenticate as. Faking a synthetic admin
 * user to pass `assertAccess` would conflate "trusted internal caller" with
 * "an admin did this", and would lie to any future audit-log layer.
 *
 * Consumer code (`+page.server.ts`, `*.remote.ts`, custom endpoints) MUST
 * read via `sailorcms/utils/data` so the access rule applies. Only the
 * framework's own services should import from here.
 */

export { _loadGlobalUnchecked as readGlobal } from 'sailorcms/utils/data/globals';
export { _loadCollectionUnchecked as readCollection } from 'sailorcms/utils/data/collections';
