# Changelog

All notable changes to SailorCMS are documented here.

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
