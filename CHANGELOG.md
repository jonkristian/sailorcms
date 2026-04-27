# Changelog

All notable changes to SailorCMS are documented here.

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
