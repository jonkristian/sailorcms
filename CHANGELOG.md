# Changelog

All notable changes to SailorCMS are documented here.

## [0.3.5] - 29-04-2026

### Added
- **Soft-delete + Recovery view** — `deleted_at` / `deleted_by` auto-injected on every collection, global, block, file, and tag table. Admin deletes flip from `db.delete` to soft-delete; new `/sailor/recovery` route lists trashed items with one-click Restore (re-instates at root with neutral position) and a separate hard-purge action. Read paths gain a shared `liveOnly()` filter.
- **"In recovery" banner on the edit page** — navigating directly to a soft-deleted item shows an amber banner with one-click Restore.
- **`DeleteDialog` `permanent` flag** — soft-delete copy by default ("You can restore from Recovery"); recovery view's purge passes `permanent={true}` for the original "cannot be undone" wording.

### Changed
- **Collection editor save no longer route-reloads on every save** — `saveCollectionItem` returns the persisted row + tags; client merges into `formData` instead of `invalidateAll()`. First save of a new item still invalidates once so the header flips Create→Save.
- **Save toasts use stable ids** (`collection-save`, `global-save`) — rapid saves coalesce instead of stacking. Same for the layout redirect-error toast and DnD reorder/nest toasts.
- **Default expand/collapse button label** matches actual initial state (everything starts collapsed → button starts as "Expand All").
- **File picker height stable** — Sheet locks at `65vh` instead of growing/shrinking with filtered content count.
- **`useUnsavedChanges()` API** — now takes a `() => boolean` getter; eliminates the `$effect → setHasChanges` pattern at call sites.

### Fixed
- **DnD nest-trap in nestable collections** — the "inside" drop band covered the middle 50% of each row, so drops near the gap between rows nested under the wrong parent; combined with collapsed parents hiding their children, dragged items appeared to vanish. Fixed by shrinking the inside band to the middle 20% and auto-expanding the drop target on `inside` drops.
- **Inline-view global delete didn't actually delete** — guard `if (item.id && item.created_at && ...)` could false-skip the server call when `created_at` was lost through round-trips. Simplified to only check `!id.startsWith('temp-')`; `localItems` is now `$derived` from the prop so post-save state stays in sync.
- **Phantom `tags` columns** dropped from `collection_pages`, `collection_posts`, `global_faq` — leftovers from the 0.3.3 generator bug.

### Internal
- **`$effect` audit: 20 → 3 sites.** Conversions:
  - Prop-mirrors → `$derived` with override (Svelte 5.25+): `DraggableCard.isOpen`, `TagSelector.selectedTagsState`, `LinkDialog.linkUrl/Text/Target`, `ArrayFieldModal.formData`, `MediaEditModal.altText/title/description`, `RepeatableInlineView.localItems`, `RepeatableNestedView.flatItems`, `TagsInput.displayTags`.
  - URL-change effects → `afterNavigate` callback: `+layout.svelte` redirect-error, `useTableFilters` URL-sync.
  - Dialog/step-open effects → trigger at the source event: `PayloadPreview`, `WordPressImport`, `settings/import/+page.svelte`.
  - Lazy-load effect → `$derived` + `{#await}`: `FieldRenderer` WysiwygField.
  - Bidirectional sync effects → one-way data flow: `FilterBar` reads `tableFilters.selectFilters` directly.
  - Callback-prop registration → `$bindable` slot props: `RepeatableNestedView`/`RepeatableInlineView` use `bind:addFn={…}` instead of `exposeAddFunction={...}`.
  - `useTableFilters.hasActive` → `$derived.by`.
- **Remaining `$effect` blocks** (legitimate): `unsaved-changes` (beforeunload listener with teardown), `MediaEditModal` (async tag fetch on file change), `RelationField` (state machine), `file-picker` (`open` prop watcher — Sheet's `onOpenChange` doesn't fire on prop-driven toggles).
- **`liveOnly()` helper** at `core/db/soft-delete.ts` — single source of truth for `deleted_at IS NULL`. No-op fallback for tables without the column.
- **Restore + purge endpoints** split per entity type (`restoreCollectionItem`/`restoreGlobalItem`/`restoreFile`, `purgeCollectionItem`/`purgeGlobalItem`/`purgeFile`). Purge only deletes rows where `deleted_at IS NOT NULL`; `purgeFile` also drops the physical blob.

### Upgrade notes
- **Run `npx sailor db:update`.** Migration adds `deleted_at`/`deleted_by` and drops legacy phantom `tags` columns. Choose "add column" for every drizzle-kit prompt.
- **`useUnsavedChanges()` callers**: replace `unsavedChanges.setHasChanges(...)` with the getter form: `useUnsavedChanges(() => Object.keys(userChanges).length > 0)`.

## [0.3.4] - 29-04-2026

### Added
- **Live slug normalization on blur** — typing into a slug field and tabbing away now slugifies the value and runs the uniqueness check, mirroring the explicit "Generate slug from title" button. Type "Arne Bjarne", tab out, field becomes `arne-bjarne` (or `arne-bjarne-2` if taken). Same backend call as the button (`getUniqueSlug`), no toast — silent and immediate. The button keeps its toast since it's a deliberate action.

### Changed
- **Server-side slug sanitization on save** — the save path now runs `slugify()` on incoming slug values in `saveCollectionItem`, `updateRepeatableGlobal`, `updateRelationalGlobal`, and `bulkUpdateGlobalItems` before persisting. Any path that bypasses the admin UI (API writes, scripts, imports) gets the same canonicalization the field gives you. `Anders And` → `anders-and`, regardless of how it arrived.
- **Globals get the same `-2`/`-3` dedupe collections already had** — repeatable, relational, and bulk-update global save paths previously relied only on the DB UNIQUE constraint, so a colliding slug surfaced as an error instead of being auto-suffixed. They now go through the shared `ensureUniqueSlug` helper inside the transaction, matching the collection write path.
- **Tag slug generation uses `slugify()`** — `TagService.createTag` was rolling its own regex (no diacritics handling, no length cap), so a tag named "Café" produced `caf` — the é was silently dropped. Now uses the shared `slugify`, which decomposes accents and applies the standard length cap.
- **DnD reorders are silent on success across the board** — `RepeatableNestedView` was emitting a "Items updated successfully" toast on every drop while the collections list stayed silent. Standardized on silent: visual confirmation is the row staying put after invalidation, and toasts on each drop got noisy when reordering several items. Errors still toast in all three reorder paths.

### Fixed
- **`æ`, `ø`, and other non-decomposing Latin letters were stripped from slugs** — `slugify` relied on `String.prototype.normalize('NFD')` to flatten accented characters, but æ/ø/œ/ß/þ/ł/đ aren't accented forms — they're separate Unicode letters with no decomposition. They fell through the `[^\w\s]` strip and disappeared, so "Bjørn" became `bjrn` and "Tær" became `tr`. `slugify` now transliterates these explicitly: æ→ae, ø→o, œ→oe, ß→ss, ð→d, þ→th, ł→l, đ→d (plus their uppercase forms). å was already passing because it does decompose via NFD.
- **`options.sortable` had no effect on simple repeatable / relational globals** — `routes/sailor/globals/(components)/TableView.svelte` (the non-inline, non-nestable view) was rendering `<DataTable>` without `sortable` or `onReorder` props, so even with `options.sortable: true` no drag handle appeared and the row order was unsavable. The backend mutation (`reorderGlobalItems`) and the inline/nested DnD wiring already existed; only the simple table view was missing the wire-up. Now matches the collections list pattern: `+page.svelte` owns a `handleReorder` that calls `reorderGlobalItems`, TableView passes `sortable` + `onReorder` straight through.

### Internal
- **DB-aware slug uniqueness consolidated into `core/utils/slug.ts`** — three near-identical `ensureUniqueSlug` loops (in `remote/collections.remote.ts`'s `getUniqueSlug` query, the `saveCollectionItem` transaction, and the WordPress importer) collapsed into one helper that accepts an optional Drizzle transaction. WordPress importer's collision counter shifts from `-1` to `-2` for consistency with the other two paths; functionally equivalent.

### Upgrade notes
- **Existing slugs are not retroactively normalized.** If you have rows with non-canonical slugs from before 0.3.4 (e.g. `"Bjørn"`, `"Anders And"`), they stay untouched until someone re-saves the row. Their public URLs (`/blog/Bjørn`) won't resolve through the admin's lookup. Either re-save each item or run a one-shot `UPDATE` per affected table.

## [0.3.3] - 27-04-2026

### Changed
- **Preview link honors `canonical_url`** — the per-item Preview button on collection edit now navigates to `canonical_url` when it's been set on the item, falling back to the existing `basePath + slug` derivation when empty. Solves the homepage case: a page whose slug is `front` but is canonically rendered at `/` can now point Preview at `/` (or `https://site.test/`) instead of `/front`. No template changes required — set `canonical_url` in the item's SEO panel.
- **`canonical_url` is override-only now** — the SEO panel no longer auto-fills `canonical_url` from `siteUrl + slug`, and "Refresh from Content" no longer touches it. Default canonical resolution still happens at render time via `seo.ts` (which correctly composes `siteUrl + basePath + slug`), so empty means "use the default" — single source of truth, no drift between admin display and runtime output. Existing rows whose `canonical_url` was previously auto-filled keep their stored value as an explicit override; clear them by hand if you want to fall back to the default (especially worthwhile on collections with a `basePath`, where the old auto-fill omitted the basePath).
- **`drizzle.config.ts` extracted into a `sailorDrizzleConfig()` helper** — the library now owns dialect selection, credentials, and `tablesFilter` defaults. User config files are a two-line import + `export default sailorDrizzleConfig()`. Future tablesFilter or backend additions flow through `core:update` without mutating the user's config file.
- **Dialog widths consolidated** to three canonical sizes: default `sm:max-w-md` (448px) for confirmations/short forms, `sm:max-w-2xl` (672px) for edit forms, `sm:max-w-4xl` (896px) for wide content (media editor). Removed seven one-off widths across the admin.

### Fixed
- **`getGlobals` pagination broken** — `total` was set to the paginated page length (not the DB total) and `hasMore` compared `offset + items.length < items.length` (always false). Both now match `getCollections`: a parallel `count()` query populates `total`, and `hasMore` compares against that. New `baseUrl` / `currentPage` options emit a `pagination` object with the same shape `getCollections` uses.
- **drizzle-kit rename prompts for FTS5 shadow tables** — every `db:update` asked about "renaming" sailor's runtime-created FTS virtual table + its internal shadow tables (`_data`, `_idx`, `_content`, `_docsize`, `_config`) to whatever new block/collection was being added. `drizzle-kit` now sees a `tablesFilter` excluding `search_index_fts*` and leaves them alone.
- **Phantom `tags` column on generated tables** — the schema generator was emitting a `tags TEXT` column for any field typed `'tags'`, even though tag data lives in the polymorphic `taggables` join table. Silent on collections/globals (their save path separates tags before INSERT) but visibly broken the first time a **block** template declared `type: 'tags'`: the block save path didn't filter `tags` out, fired the tag array-of-objects at the phantom column, and SQLite rejected the bind with `[object Object]` params. Generator now skips `type === 'tags'` in `buildMainTableFields` for blocks, collections, and globals. Existing phantom columns on pre-0.3.3 tables are harmless — nullable and unused — no migration needed.
- **Block save didn't persist tags** — even with the INSERT unblocked, nothing wrote block tags to `taggables`. `saveCollectionItem` now collects `type: 'tags'` fields into `pendingBlockTags` during the transaction and flushes them afterwards via `TagService.tagEntity('block_<slug>', blockId, tagNames)`, matching the existing collection/global tag-write pattern.
- **Block read didn't load tags** — `loadBlockFields` handled files, arrays, and relations but never looked up tags, so `block.tags` came back undefined on the consumer side even when data existed in `taggables`. Mirrors `globals.ts` now: one `TagService.getTagsForEntity('block_<slug>', block.id)` call per block assigns the result to every `type: 'tags'` field on the block. Zero tag fields → zero extra queries.
- **Collection read didn't load tags either** — same gap as blocks had. `loadCollectionFields` never enriched collection items with tags, so `post.tags` came back empty on the consumer side despite `taggables` rows existing under `collection_<slug>`. Same fix pattern: iterate the collection schema, find `type: 'tags'` fields, one `TagService` call per item, assign. Blocks, collections, and globals now all agree on the read path.

### Upgrade notes
- **Replace your `drizzle.config.ts`** with the new two-liner:
  ```ts
  import { sailorDrizzleConfig } from './src/lib/sailor/core/db/drizzle-config';
  export default sailorDrizzleConfig();
  ```
  This picks up the FTS5 `tablesFilter` (no more drizzle-kit rename prompts) and the imperative dialect/credentials logic now lives inside sailor's library code — future fixes propagate automatically. If you had custom overrides, pass them as options: `sailorDrizzleConfig({ schema: '...', out: '...', tablesFilter: ['!my_table'] })`.
- **(Optional) Clear stale auto-filled `canonical_url` values** — if you previously clicked "Refresh from Content" on a page in a collection with a `basePath` (e.g. `'/blog/'`), the stored canonical was generated without the basePath. Clearing the field falls back to the correct runtime default. Pages without a `basePath` are unaffected.

## [0.3.2] - 23-04-2026

### Added
- **Site search** — new `search()` utility at `$sailor/utils/index`, backed by a denormalized `search_index` core table that's kept current via save hooks on collection, global, and tag mutations. Opt entities in with `options.searchable: true` in the template; the indexer walks top-level text fields, block content (for collections with `blocks: true`), and attached tag names. On SQLite/Turso uses FTS5 with the trigram tokenizer (substring-friendly: "sail" finds "sailor", "mail" finds "email"), falling back to case-insensitive LIKE when FTS returns empty so partial matches still surface. Results hydrate through `getCollections`/`getGlobals` — URLs, blocks, and ACL work the same as everywhere else. Globals bypass the status filter (no draft UI exists for them). Ships with `npx sailor search:reindex` for full rebuilds, `pagination` metadata matching the `getCollections` shape, a `PUBLIC_BASE_URL`-aware demo route at `/search`, and new `options.searchable` fields on `CollectionDefinition` and `GlobalDefinition`. See `docs/reference/utilities.md`.

### Fixed
- **CLI package manager detection** — `core:update` now recognizes Bun's modern text-format lockfile (`bun.lock`, Bun ≥1.2) alongside the legacy `bun.lockb`. Previously fell through to `npm install`, which regenerated a stray `package-lock.json` on each update. Also reordered detection so bun/pnpm/yarn lockfiles take precedence over npm when multiple coexist.
- **Collection list DnD handles missing on navigation** — `useTableFilters` was capturing `defaultSort` / `defaultOrder` as static strings at hook-call time, so when SvelteKit reused the `+page.svelte` instance across collection navigation, the composable held stale defaults from the previous collection (e.g. `'updated_at'` from Posts leaking into Pages). Defaults now accept reactive getter functions, and the hook re-syncs state from the URL on route change. Drag handles show up immediately on navigation without needing a refresh.
- **Switch track invisible** — `Switch` used Tailwind shorthand variants `data-checked:` / `data-unchecked:` (which compile to `[data-checked]` / `[data-unchecked]` attribute selectors), but bits-ui emits `data-state="checked|unchecked"`. Background colors, dark-mode thumb colors, and translate transforms all silently no-op'd, leaving just the bare thumb floating on a transparent track. Switched to `data-[state=checked]:` / `data-[state=unchecked]:` throughout.
- **Global tag taggable-type inconsistency** — `addGlobalItemTags` / `removeGlobalItemTags` were writing tags under a bare `'global'` taggable_type while `updateGlobalItemTags` and `updateRepeatableGlobal` used `global_${slug}`. The two endpoints now agree on the slug-qualified form, matching every other tag write path in the codebase.

## [0.3.1] - 21-04-2026
- **Add Block dialog** — replaced the Card-per-item layout with a tighter button list that uses the same `bg-input-bg` / `border-input` / `rounded-lg` styling as the rest of the form controls, matching the site's unified look from 0.3.0.
- **File picker height** — the Sheet was expanding with content because shadcn's default `data-[side=bottom]:h-auto` had higher CSS specificity than a plain `h-[...]` override. Now caps at `max-h-[65vh]` using matching `data-[side=bottom]:` prefix so it actually takes effect.

### Upgrade notes
- Run `npx sailor db:update` once after upgrading — it adds the `search_index` core table + migration needed by the new search utility. Then optionally `npx sailor search:reindex` to backfill the index from existing content.
- Search is opt-in per entity. Add `options.searchable: true` to any collection or global you want to appear in `search()` results.
- If older tag data was written under the bare `'global'` taggable_type (see Fixed above), the search indexer already looks up both keys defensively, so no manual migration is required for search. Other admin paths may still need attention if they relied on the old bare key.

## [0.3.0] — 21-04-2026

### Added
- **Date picker** — new `DateField` using shadcn-svelte's `Calendar` + `Popover` primitives. Automatically used for `type: 'date'` fields.
- **Switch** — `BooleanField` now renders a `Switch` instead of a select dropdown.
- **Tooltips** — WYSIWYG toolbar icons now use real tooltips via a new `TooltipButton` wrapper (`src/lib/components/sailor/TooltipButton.svelte`) instead of native `title` attributes.
- **InputGroup** — slug field now uses `InputGroup` so the "generate slug" button lives inside the input.
- **JPEG XL detection** on upload — rejects unsupported formats early with a clear error instead of failing deep inside Sharp.
- **Filename collision suffixing** — uploads always get a short timestamp suffix, so same-named uploads no longer overwrite each other.
- **Proactive slug dedup** — clicking "generate slug" now also checks for conflicts server-side and appends `-2`, `-3`, etc.

### Changed
- **Unified form-control styling** — `Input`, `Textarea`, `Select.Trigger`, `RelationField`, `TagSelector`, `TagsInput`, and the WYSIWYG editor container all use the same `bg-input-bg` background, `border-input` border, `rounded-lg` radius, and `h-9` height. One theme variable (`--input-bg`) controls all input backgrounds; tweak in `src/lib/sailor/styles/sailor.css`.
- **Navigation data** — moved from a remote function to direct DB access in `+layout.server.ts`. Fewer RPC round-trips on first load; removes the "use load's fetch" warning.
- **File-field derivations** — `FileField` and `file-picker.svelte`'s `selectedFiles` now use `$derived.by` instead of `$effect` + `.then()` chains. Smaller, more predictable, no race conditions.
- **CLI `core:update`** — now removes files from the user's project that no longer exist in the reference (e.g. deleted components/routes). Previously left orphans behind.
- **Unsaved-changes warning** — replaced custom modal with `window.confirm()`; no longer fights with the browser's native beforeunload dialog.

### Fixed
- **Scandinavian character uploads** — `æøå` in filenames no longer break S3 signing or local storage.
- **Block save after drag-and-drop reorder** — block type schemas with `core: true, hidden: true` system fields (e.g. `sort`) no longer shadow the correct persisted value. System columns always win during INSERT OR REPLACE.
- **EXIF image rotation** — Sharp now honours EXIF orientation on resize; uploaded portrait photos no longer appear sideways.
- **Slug uniqueness on save** — transaction now auto-suffixes on collision instead of failing; UNIQUE constraint errors translated to friendly messages as a fallback.
- **Stale form state after save** — re-hydrates `formData` from refreshed server data so server-side mutations (auto-suffixed slug, generated fields) aren't overwritten.
- **"Unsaved changes" dialog on every upload** — Vite no longer watches `static/uploads/`, so uploading doesn't trigger HMR reload.
- **Svelte remote-function call contexts** — corrected across server loads, universal loads, component templates, and event handlers. See `docs/` for the matrix.

### Removed
- Custom `ExitWarningDialog.svelte` (replaced by native `window.confirm()`).
- `getNavigationData` remote function (inlined into `+layout.server.ts`).

### Upgrade notes
- `sailor core:update` will now delete files removed from the reference. Most of these are cruft, but worth eyeballing the cleanup output on the first upgrade.

## [0.2.1] — 26-11-2025

### Fixed
- Missing array and relational data display inside a block.

## [0.2.0] — 02-10-2025

### Changed
- **Settings system** — complete refactor with renamed settings table consolidating all configuration.
- **Developer utils** — cleaner separation of concerns, improved type safety, better relational data loading.
- **Schema generation** — improved handling of relational data and naming conventions; core tables generated first.
- **Relations** — standardized on `parent_id` / `parent_type` instead of `global_id` / `collection_id`.
- **File fields** — always use relational tables (collections, globals, blocks). ⚠ Breaking change for existing data: in-row file columns (e.g. `collection_posts.featured_image`) are moved to junction tables (e.g. `collection_posts_featured_image`). Existing data must be manually backfilled before `sailor db:update` drops the old columns. No built-in migration tool.
- **Main API/nav** — moved to a remote function.
- **Preview links** — changed from buttons to anchor tags.
- **Access control** — removed custom implementation, replaced with `better-auth`'s admin plugin.

### Fixed
- Relational data handling in blocks and arrays.
- Block array tables now correctly use `block_id` for first-level arrays.
- Setting user passwords in admin interface.
- Settings now load correctly during build.
- WordPress import now correctly follows file relational pattern.

### Added
- `items:` as default key for file arrays and other arrays in templates.
- `excludePaths` for excluding folders in file management.

## [0.1.1] — 25-09-2025

### Fixed
- Small fixes following initial release.

## [0.1.0 — Rough Ocean] — 24-09-2025

Initial public release.
