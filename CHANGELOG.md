# Changelog

All notable changes to SailorCMS are documented here.

## [0.5.3] - 04-05-2026

### Fixed

- **Bumped `@sveltejs/vite-plugin-svelte` from `^5.1.1` to `^6.0.0` to match the `vite@^7` we already ship.** Sailor's own `package.json` was internally inconsistent: vite was pinned at `^7.3.2`, but `@sveltejs/vite-plugin-svelte@5.1.1` only declares `vite@^6.0.0` as its peer. Bun installed it anyway (it's permissive about peer mismatches); npm 8+ refuses to resolve the tree, so any consumer trying to deploy with `npm install` (e.g. on Coolify, Vercel, or any CI that uses npm) hit `ERESOLVE` failures. The dep-mirroring loop in `cms-update.js` already mirrors sailor's devDependencies into consumer projects on every `core:update`, so consumers get the bump automatically — no consumer-side action needed beyond running `npx sailor core:update`. v6 supports the same svelte 5 + vite 7 stack we use, so no API breakage.

- **`patchSvelteConfig` now upgrades existing `vitePreprocess(...)` calls that are missing `script: true`.** The 0.5.1 patcher only fired when `vitePreprocess(` was absent — a config with bare `vitePreprocess()` (the SvelteKit default) matched the regex, so the patcher skipped the whole block. Without `script: true`, `<script lang="ts">` blocks in shipped node_modules `.svelte` files (sailor admin chrome, lucide, bits-ui) don't get TS-stripped and the svelte parser fails the build with `Unexpected token` on the first identifier. The patcher now has a second branch: if `vitePreprocess(...)` is present without `script: true`, it rewrites the call in place — empty `()` becomes `({ script: true })`, an existing options object gets `script: true` spliced in.

## [0.5.2] - 04-05-2026

### Changed

- **`getImage()` forwards `position` to the transform endpoint.** The 0.5.1 `position` plumbing existed end-to-end through `<Image>` and `getFileUrl`, but `getImage()` (the CMS-internal helper used by media library, file fields, etc.) destructured `width/height/quality/format/resize` only — so passing `position` was a silent no-op. Now wired through. Media library grid (`MediaGrid.svelte`) opts in with `position: 'top'` so heads stay visible on portrait thumbs instead of getting clipped by the default centered cover crop.
- **Admin media thumbnails switched from `object-cover` to `object-contain`.** 0.5.1 moved admin thumbs to `object-cover object-top` to stop heads getting clipped on portraits — but the same crop just shifts the problem on logos and wide images, where it lops off the left/right edges instead. For a media library where the goal is to _recognize_ the asset, contain (no crop, letterbox the difference against a subtle `bg-muted/40`) handles photos, logos, and screenshots equally well. Applied to `FileWithControls.svelte` (covers `MediaGrid`, `MediaTable`, `FileField`, `RecoverySection`), `RecentMedia.svelte` dashboard tile, and both file-picker thumbnails. The server-side `position` plumbing from 0.5.1 stays — callers needing a cropped/anchored image can still opt in via `<Image position="top">` etc.; this only changes the unstyled defaults.
- **`MediaEditModal` preview shows the whole image.** Previously fixed `h-96 w-full object-cover object-top`, which clipped the bottom of any portrait or anything taller than 384px. Now `max-h-[60vh] object-contain` with a flex-centered `bg-muted/40` panel, so the asset fits the modal regardless of orientation and the user actually sees what they're editing.

### Fixed

- **`defaultView: 'read'` no longer mangles long sidebar values.** `ReadField` always rendered as a 2-column inline grid (`grid-cols-[minmax(8rem,12rem)_1fr]`), which works fine in the wide main column but in the 320px sidebar leaves only ~135px for the value after the label, gap, and panel padding — long values like multi-paragraph addresses wrapped one word per line. `FieldRenderer` now accepts `variant="sidebar"`, plumbed through to `ReadField`, which switches to a stacked layout (label on top, full-width value below) and adds `break-words` so long URLs / emails wrap cleanly. Wired into both the globals and collections sidebar `<FieldRenderer>` usages. Read-mode rendering branches were also collapsed into a single `valueContent` snippet, removing the prior `isLongForm` duplication.

## [0.5.1] - 04-05-2026

### Added

- **Admin UI internationalization (English + Norwegian bokmål, ~900 keys)** — Paraglide JS compile-time i18n covering the entire `/sailor` admin surface: toasts, headers, pagination, dialogs (delete/link/select), bulk actions, every table and filter bar, sidebar nav, dashboard, settings cluster (site/storage/roles/taggables/database/import), users + RBAC, account, recovery (overview + per-section + sub-pages), collections list + body chrome, globals overview + edit page + EditModal, media library, all field components (FieldRenderer, ArrayField, ArrayFieldModal, RelationField, FileField, TagsInput, TagSelector, file-picker, DateField, BooleanField, ReadField), SEOFields, MediaEditModal, PayloadPreview, AuthWidget, FileUploadProgress, FileWithControls, ThemeToggle, OverlayLoader, DraggableCard, dnd Blocks, dashboard SiteInfo, WysiwygField (all 21 toolbar tooltips), settings sidebar nav, full Import/Export page, WordPressImport multi-step UI, and server-rendered chrome (payload-preview titles, save-button text/submittingText via header actions). `project.inlang/` and `i18n/messages/` live under `src/lib/sailor/` so the consumer-copy distribution model carries them along; CLI `core:update` skips `i18n/messages/` so consumers' refinements survive updates.

- **`language` user preference + browser auto-detection** — new `users.preferences.language` key (`'auto' | 'en' | 'nb-NO' | …`), split out from `date_format`, defaulting to `'auto'`. `core/hooks/sailor-hooks.ts` parses `Accept-Language` q-weighted, tries exact then language-prefix matches against the available Paraglide locales, and falls back to `baseLocale`. Existing users with no `language` set get auto-detection on next request without any migration step.

- **`date_format` independent of UI language** — the regional locale used by `Intl.DateTimeFormat` is now its own preference, defaulting to `'auto'` (follow `language`). Lets users pick a regional date locale (en-GB, de-DE, sv-SE, fr-FR, es-ES…) without changing UI strings, since not every supported date locale has translated UI strings.

- **Compact `LocaleSwitcher` in the admin header** — shadcn-svelte Select with a globe icon, sized to match `ThemeToggle` (h-8). Shows `Auto`, `EN`, `NB`, etc.; selecting applies immediately client-side via Paraglide's `setLocale()` and persists to `users.preferences.language` via the new `updateMyPreferences` remote function, then `invalidateAll()` so server-rendered locale-aware chrome (payload titles, save-button text) re-renders on next nav.

- **`updateMyPreferences` remote function** — generic patch endpoint in `users.remote.ts` that additively merges into the calling user's `users.preferences` JSON blob. Designed for any per-user UI state (default landing page, table vs grid view, page size, density, theme override, etc.) so future preferences land via the same path.

- **i18n centralization helpers** — `toastResult(result, successFn, failFn)` in `core/ui/toast.ts` collapses the repeating `try { … if (result.success) toast.success(); else toast.error(); } catch { toast.error(); }` pattern (migrated through ~30 CRUD sites). `pluralize(count, singular, plural)` in `utils/ui/text.ts` (exported from the consumer-facing barrel) replaces the inline `count === 1 ? 'item' : 'items'` ternaries. `requirePermission(allowed, message)` next to `toastResult` collapses the permission-guard-toast pattern (migrated through ~5 sites). All three are translation-friendly and dedupe the failure message that was previously written twice (else branch + catch).

### Changed

- **`DeleteDialog` and `BulkActionsBar` API: `itemType` → `labels: { singular, plural }`.** The previous string-template approach (`Delete this {itemType}?`) couldn't compose translatable text, since languages like Norwegian need different forms for definite/indefinite and singular/plural. Now both components take an explicit `{ singular, plural }` object. Server loads in `recovery/{collections,globals}/[slug]/+page.server.ts` expose `itemLabels` instead of `itemType` to feed the new shape.

### Added

- **`FileTransformOptions.position`** — exposes Sharp's `resize.position` end-to-end (`'top' | 'right top' | 'right' | 'right bottom' | 'bottom' | 'left bottom' | 'left' | 'left top' | 'center' | 'centre' | 'attention' | 'entropy'`). Cover-cropped thumbnails were always center-anchored, which clipped heads on portraits — callers can now opt into top-anchored cropping or content-aware crop (`attention` / `entropy`). Plumbed through `getFileUrl()` → `/sailor/api/images/transform` → `ImageProcessor.processImage()` → Sharp's `resize({ position })`. Cache key now includes `position` so different anchors don't alias to the same cached buffer. The `<Image>` component (`$sailor/components/sailor/files/image.svelte`) accepts a matching `position` prop.

### Fixed

- **`runMigrations` patches drizzle-kit's SQLite rebuild bug before invoking `migrate()`.** When a template change pairs additive fields with a non-additive change to an existing field (typically removing `required: true`), drizzle-kit can't express the migration as `ALTER TABLE` and falls back to a full table rebuild (`CREATE __new_X` → `INSERT FROM X` → `DROP X` → `RENAME`). Its rebuild generator has a long-standing bug: the `INSERT INTO __new_X (cols) SELECT cols FROM X` lists the _new_ schema's columns on both sides, so SQLite errors with `no such column: <new-col>` on the SELECT side because those columns don't yet exist on the source table. Manifested most recently as a 17-new-column refactor of a polymorphic submissions global; would fire any time a consumer dropped `required: true` while adding fields. `runMigrations` (`cli/utils.js`) now scans pending migration files for the rebuild pattern, runs `PRAGMA table_info(X)` on the live DB to determine the actual source-table columns, and rewrites both column lists in the file to drop columns that don't exist there — letting the new columns take their declared defaults / NULL on existing rows (which is what the working generator output would have been). If a missing column is `NOT NULL` without a `DEFAULT`, the migration is genuinely undefined (no value to backfill) and the patcher aborts with a precise diagnostic naming the column and pointing at the template field that needs a default or to be made optional. Patches are written back to disk with a `🔧 Patched drizzle/<tag>.sql` log line and should be committed alongside the template change.

- **Admin media thumbnails no longer clip the top of portraits.** `FileWithControls`, `RecentMedia`, file-picker grid + table thumbs, and `MediaEditModal`'s large preview render the raw `file.url` with `object-cover` (no server-side transform), so cropping happens entirely in CSS — and the default `object-position: center` cuts equally from top and bottom, lopping heads off any portrait. Switched these to `object-cover object-top`. For server-transformed images (passing width+height through `<Image>`), pass the new `position` prop to control Sharp's anchor.

- **Block save serializer normalizes one-to-one / one-to-many relation values to scalar ids.** Editing any field on a block that contained a single-FK relation field (e.g. a `partner` relation pointing to another collection) failed at insert time with `[object Object]` bound to the relation column — the column stores a UUID, but the form state held the resolved entity object. The collection-level save path already normalized these (extract `value.id` from object/array/JSON-string shapes before insert) but the block-save path filtered them into `filteredContent` without normalizing. Block writes in `src/routes/sailor/collections/[slug]/[id]/data.remote.ts` now run the same normalization pass, mirroring the collection-level logic.

- **`db:update` no longer false-positives on drift when a new migration is pending.** After editing templates, `drizzle-kit generate` would produce a fresh migration (e.g. `0001_serious_hydra.sql` adding new block tables); `runMigrations` then ran a drift check that compared the post-migration `generated/schema.ts` against the live DB and bailed with `Schema drift detected; refusing to migrate.` — even though the "missing" tables were exactly what the pending migration was about to add. The drift check now only fires when the DB _claims_ to be up to date (i.e., `__drizzle_migrations`' high-water mark ≥ the latest journal entry's `when`) or when bootstrapping (count === 0). Pending migrations get a pass and `drizzle-orm/libsql/migrator` runs them. Real drift (DBs whose tracking lies about what's been applied) still surfaces — but only when nothing's pending, where the diagnostic message is actually accurate.

- **`db:update` self-heals missing `drizzle.config.ts` and `drizzle/meta/_journal.json`.** Previously, wiping `drizzle/` and `sailor.sqlite` for a clean rebuild errored out with `Required file missing: drizzle.config.ts. Please run "npx sailor core:init" first.` — but `core:init` is overkill for that case (it also reinstalls deps, copies templates, and re-patches `vite.config.ts` / `svelte.config.js`). Both files are recoverable from the package source: the config is a one-line re-export of `sailorDrizzleConfig()`, and the journal is just the empty `{ version: '7', dialect, entries: [] }` seed that `drizzle-kit generate` populates on its first run. `db:update` now restores either if missing (dialect picked from `DATABASE_URL` — `postgresql` if it starts with `postgres`, else `sqlite`) so `rm -rf drizzle/ sailor.sqlite drizzle.config.ts && npx sailor db:update` rebuilds cleanly without touching dependencies or templates.

- **`npx sailor db:update` no longer delegates to a project-side `npm run db:update` script.** Older `core:init` versions wrote a `db:update` package.json script that chained `drizzle-kit push`, and the CLI deferred to it when present — meaning even `npx sailor db:update` ended up running `drizzle-kit push`, which fails with `SQLITE_ERROR: no such column: …` on additive column changes against Turso (e.g. the soft-delete `deleted_at`/`deleted_by` rollout). The CLI now always runs the migrator flow (`generateSchema` → `drizzle-kit generate` → `drizzle-orm/libsql/migrator`) and, on every `db:update` and `core:update`, silently strips the legacy `db:generate` / `db:push` / `db:update` scripts from `package.json` (exact-match only, so customized scripts are preserved). `core:init` no longer writes those scripts. If a Turso DB is already drifted from the broken push attempt, run `npx sailor db:repair`.

- **`core:update` now bumps versions for sailor devDeps that consumers placed under `dependencies`.** The previous dev-deps loop in `cms-update.js` only updated the version if the package was in the consumer's `devDependencies`, and added it to `devDependencies` only if absent from both sections — so any sailor devDep the consumer happened to have under regular `dependencies` (e.g. `bits-ui`, sometimes `drizzle-kit`, `embla-carousel-svelte`, prosemirror packages) silently got skipped on every update, leaving the consumer's `package.json` constraint frozen at install-time. The loop now mirrors the runtime-deps loop: if the consumer has the package under `dependencies`, the version is bumped in place; otherwise it's written to `devDependencies`. Note that bumping the constraint string is what triggers `bun install` / `npm install` to actually re-resolve — if your lockfile pins an older version within an unchanged `^` range, the constraint had to change first.

- **Sailor's runtime UI dependencies moved from `devDependencies` to `dependencies` in `package.json`.** `bits-ui`, `embla-carousel-svelte`, `formsnap`, `layerchart`, `paneforge`, `sveltekit-superforms`, `tailwind-merge`, `vaul-svelte`, and `@tanstack/table-core` are imported by the admin code that ships into consumer projects, so listing them as devDependencies on sailor's side was misleading and conspired with the dev-deps-loop bug above to silently skip them during `core:update`. They're runtime now, where they always should have been.

- **`core:init` and `core:update` now register `paraglideVitePlugin` in the consumer's `vite.config.ts`.** The 0.5.x i18n rollout introduced a hard dependency on Paraglide's compile-time output at `$sailor/i18n/paraglide`, but the config patcher in `cli/utils.js` only injected `@tailwindcss/vite` — it never added paraglide. Consumers upgrading from a pre-i18n sailor version would silently end up with a vite config that has Tailwind but no paraglide, and the admin would fail at dev-server startup because Vite's optimizer couldn't resolve the un-generated i18n runtime (surfaces as parse errors in unrelated downstream modules like `bits-ui`). The patcher in `cli/utils.js` is now a single idempotent function (`patchViteConfig`) that adds both Tailwind and Paraglide if missing, used by both init and update; if it can't auto-patch a non-default config shape, it now prints an explicit instruction line instead of silently moving on.

- **`core:init` and `core:update` now patch `svelte.config.js` with the preprocessor and compiler options sailor needs.** Previously `updateSvelteConfig` only injected the `$sailor` alias — but sailor also requires `preprocess: vitePreprocess({ script: true })` (so `<script lang="ts">` blocks in shipped node_modules .svelte files like `@lucide/svelte` and `bits-ui` parse) and `compilerOptions: { runes: true, experimental: { async: true } }` (sailor relies on runes mode and async components). Without these, the dev server failed during Vite's `optimize-svelte` step with `Unexpected token` in random downstream `.svelte` files. A new `patchSvelteConfig` helper now idempotently adds the alias, the preprocessor import + call, and the compiler options if missing.

- **Loud end-of-run banner when config patching needed manual intervention.** Both `core:init` and `core:update` now print an unmissable `⚠️  MANUAL ACTION REQUIRED` block at the very end of their output, listing every `vite.config.ts` / `svelte.config.js` change the patcher couldn't apply automatically (typically because the consumer has an unusual config shape the regex anchors don't match). Previously these were one-line `console.log` warnings buried in the middle of normal status output and easy to miss.

### Upgrade notes

- **No migration required.** `users.preferences` keeps its existing shape; `language` and the new `date_format='auto'` value just coexist with prior `date_format` choices. Users who previously picked `date_format: 'nb-NO'` keep that as their date locale; UI language defaults to `'auto'` and follows their browser, which they can override per-user from the topbar `LocaleSwitcher` or `/sailor/account`.
- **Consumer projects on a prior version**: run `npx sailor core:update` to pull the new admin code. `i18n/messages/` is preserved on update so any local translation refinements you've made stick. `templates/` is preserved as before.

## [0.5.0] - 01-05-2026

### Added

- **Crawler exclusion for `/sailor/*`** — `handleSailorHooks` now sets `X-Robots-Tag: noindex, nofollow, noarchive` on every admin response (UI, auth pages, and the `/sailor/api/auth` handler), and a new `static/robots.txt` adds a belt-and-braces `Disallow: /sailor/`. Public-site routes (`(site)/*`) are unaffected; the per-page SEO `noindex` field continues to govern public content.

- **Per-collection revisions (opt-in)** — new polymorphic `revisions` table (codegen-emitted, indexed on `(entity_type, entity_id, created_at)`) snapshots the full submitted payload on every save when a collection template sets `options.revisions: true` (or `{ keep: N }`, default cap 50). Each save = one row containing the entire reconstructible formData (row + array fields + blocks + file relations + tags), so restore is just re-running `saveCollectionItem` with the snapshot — no timestamp-pairing or diff-merge logic. `RevisionsService` (`core/services/revisions.server.ts`) owns create/list/get/prune/deleteForEntity. Hard-delete via `purgeCollectionItem` drops the entity's revisions; soft-delete leaves them intact so a recovered item still has its history. Pages template ships with revisions enabled. Globals coverage is the next round.

- **Revision history dialog with inline diff** — `RevisionsDialog.svelte`, opened from a History icon button rendered in the admin header next to the existing PayloadPreview action. Page revisions are preloaded by the per-route server load and passed into the dialog as data, so every interaction (browsing, diff, restore) is zero-fetch. Older / Newer arrow nav with position indicator (`N of M (latest)`); dialog opens to the most recent revision by default. Source view renders the snapshot as syntax-highlighted JSON (new sync `highlightJsonSync()` helper added to `core/ui/syntax-highlighting.ts`). For any non-latest revision, the source view becomes a unified diff against `revisions[0]`: removed lines (rose, line-marker on the left), added lines (emerald), context lines unchanged. Diff implementation uses `diffLines()` from the `diff` package — JSON pretty-printed for stable line alignment. Restore re-runs the save command with the snapshot's payload, then re-initialises `formData` and `blocks` from a fresh `invalidateAll()` (extracted `buildBlocksFromPage()` helper) so the form state stays in sync without a hard reload. Save handler now also calls `invalidateAll()` post-save so newly-created revisions appear in the dialog without manual refresh.

- **Header-level revisions button via shared module-level `$state`** — `core/ui/header-revisions.svelte.ts` exposes a tiny store (`{ openHandler, count }`) that the page publishes to in an `$effect` and the layout-rendered `HeaderRevisionsButton.svelte` reads. Decouples button placement (admin header, alongside PayloadPreview) from dialog logic and restore (still page-owned, since they touch local form state). Tooltip shows revision count.

- **`OverlayLoader.svelte`** — viewport-centered spinner that masks the layout shifts caused by async-mounting components (Tiptap editors initializing in `onMount`, lazy imports, etc.) on heavy edit pages. Renders children immediately and overlays a fixed-position spinner until `requestIdleCallback` fires (or 200ms fallback for Safari), then fades out via CSS opacity. Wired into the collection edit page, globals edit page, and globals list/inline-edit page. Optional `minMs` prop enforces a minimum visible duration to avoid flicker on fast loads. Per-page opt-in (rather than admin-layout-wide) so routes without async-mount weight aren't burdened by an unnecessary loading flash.

- **Per-user preferences + locale-aware date formatting** — new `users.preferences` text column (codegen-emitted) holding a JSON blob; first key is `date_format` (BCP-47 locale string). Surfaced in `/sailor/account` as a 7-option select (en-US / en-GB / nb-NO / de-DE / fr-FR / sv-SE / es-ES); the update action merges the patch additively into the existing JSON, so future preference keys (theme, density, etc.) survive partial saves. New helpers `core/utils/user-preferences.ts` (`parsePreferences` / `mergePreferences` / `resolvePreferences`, all tolerant of either a JSON string or a pre-parsed object), `core/ui/user-locale.ts` (`getUserLocale()` reads from `page.data.user.preferences` with default fallback), and a Better Auth `additionalFields: { preferences }` config so `getSession()` returns the column in user objects. The admin layout's server load queries `users.preferences` directly as a defensive pass — guarantees fresh data even if a session cache hasn't picked up the new field yet.

- **Date helpers refactored to accept locale** — `formatDate` / `formatTableDate` / `formatDetailedDate` / `formatRelativeTime` in `core/utils/date.ts` now take an optional BCP-47 `locale` (defaulting to `'en-US'`). `formatRelativeTime` upgraded to use `Intl.RelativeTimeFormat` so phrases like "2 hours ago" localise correctly. New `formatTimestamp(date, locale)` for the `toLocaleString`-style "5/1/2026, 12:11:14 PM" output the revisions dialog uses. Audited every admin call site (collection list/edit, globals list/edit, users list/edit, account, dashboard recent-\* widgets, file picker, DataTable, RevisionsDialog, FieldRenderer, ReadField, DateField, MediaTable, TableView) and routed each through the helpers with `getUserLocale()`. Switching the locale in `/sailor/account` now affects every date in the admin without per-page wiring.

### Changed

- **Collection-item save now invalidates after every save**, not only when creating a new item. The previous code merged `result.item` into `formData` and skipped invalidation as an optimisation, which left server-loaded auxiliary data (`data.revisions`, etc.) stale until the next route navigation. Now fires `void invalidateAll()` after successful saves so dependent UI (the History dialog being the immediate driver) sees fresh data without blocking the user. The `formData`/`blocks` `untrack(...)`-init guard still protects in-progress edits from being clobbered.

## [0.4.1] - 30-04-2026

### Added

- **`npx sailor db:repair`** — applies missing columns to a drifted DB via `ALTER TABLE ADD COLUMN` and reconciles `__drizzle_migrations` so future `db:update` runs apply incrementally. Supports `--dry-run`. SQLite/Turso only; Postgres uses `drizzle-kit push` and isn't affected by the bug below.

### Fixed

- **`runMigrations` silently masked schema drift** — when upgrading from push-mode to migrate-mode (0.4.0+), the bootstrap recorded the journal head as "applied" without verifying the DB actually matched. If the DB was behind (e.g., new template fields added but never pushed), `drizzle.migrate()` then thought everything was up to date and skipped the migrations that would have added the missing columns — leaving permanent silent drift on stage/prod boxes that hadn't kept pace. The bug was double-bad: any DB that was already incorrectly bootstrapped before this fix shipped would never self-heal, because subsequent runs trusted `__drizzle_migrations` and skipped the bootstrap path entirely. Now: drift detection runs on **every** `db:update`, regardless of bootstrap state. If any column or table from `generated/schema.ts` is missing in the DB, `db:update` refuses with a clear error pointing at `db:repair` rather than silently no-op'ing.

### DnD safety

- **DnD drop-on-self orphaned items in nestable collections.** Dropping a row on the dragged row itself with stale `dropPosition='inside'` (carried over from an earlier hover on a different row, since `handleDragOver` early-bails when target equals dragged) caused `handleDrop` to emit `parent_id = item.id`. The hierarchy builder then attached the row as its own child — invisible in the tree, never entering Recovery (it wasn't deleted, just orphaned). Reproduced on Windows/Chrome but not Linux due to how each OS routes `drop` events when the cursor releases over the source row. Patched `DataTable.svelte` and `dnd/Blocks.svelte` `handleDrop` to bail on `draggedIndex === dropIndex` and on stale `dragOverIndex` mismatches; added defense at the API boundary in `updateCollectionItemNesting` (rejects `parentId === itemId`) and in the collection/global array-field upserts (coerces self-references to `null` on write); and made the tree builders surface orphans as roots so any rows that got hit before this fix reappear at the top of the list, available for re-parenting or deletion through the normal UI.

## [0.4.0] - 30-04-2026

### Added

- **SMTP / outbound email** — new `utils/mail/server.ts` exposes `sendMail()` and `isMailConfigured()` for both internal use (Better Auth password-reset and email-verification flows now route through it) and consumer-side use (e.g. contact-form submission handlers). Configured via env (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`); when unset, `sendMail()` no-ops and warns. Verification gating is opt-in via `EMAIL_VERIFICATION=true`. Import as `import { sendMail } from '$sailor/utils/mail/server'`.
- **`defaultView: 'read'` on globals** — new `GlobalDefinition.options.defaultView` flag that opens existing items in a compact static presentation (label / value rows, no input chrome) with an Edit toggle. New items always open in edit mode. Submissions template ships with `defaultView: 'read'` since they're write-once-then-read. Implemented via a new `mode` prop on `FieldRenderer` that dispatches to a new `ReadField` component, so any future caller of `FieldRenderer` can opt into read mode.
- **"In Recovery" badge + Restore action on file fields** — when a file field references a soft-deleted file, `FileWithControls` now renders a red "Restore" badge in the bottom-right corner. Clicking it calls `restoreFile` and refreshes the field in place — no trip to `/sailor/recovery` required. Picker / browse paths (`getFiles` search/list) now apply `liveOnly()` so deleted files no longer appear as selection options; the `ids` lookup branch stays unfiltered so already-referenced files still resolve for the badge.
- **Recovery: per-type drill-down with pagination.** `/sailor/recovery` becomes an index page listing each type with deleted items (Files, plus each collection and each global with deletions) and a count badge. Detail pages `/sailor/recovery/files`, `/sailor/recovery/collections/[slug]`, `/sailor/recovery/globals/[slug]` paginate server-side via `?page=N&pageSize=20`, use the shared `<DataTable>` / `<BulkActionsBar>` / `<Pagination>` admin building blocks, and support multi-select bulk Restore + permanent-Delete with a single confirmation dialog. The Files detail page shows preview thumbnails matching `/sailor/media`. Replaces the previous one-page tabbed view (which capped at 100 items per section and had no pagination).

### Fixed

- **Codegen dropped template `default` for string/select fields** — `schema.js` only forwarded `notNull`/`unique`/`references` to the text adapter, and the text adapter signature didn't accept `default` at all. Adding a `required: true` string field with a template default to a non-empty table hit the SQLite rebuild trap. Both layers now carry `default` through.
- **Codegen dropped `mode: 'boolean'` for boolean fields** — paired with the above, boolean defaults flowed through the integer adapter as `integer('featured').default(false)`, which fails drizzle's `number | SQL` typecheck. Generic-field branch now also forwards `mode`, and the integer adapter emits `integer('name', { mode: 'boolean' }).default(false)` when set.
- **Sailor request logger flagged SvelteKit redirects as "Request failed"** — `handleSailorLogging` caught any thrown value in its `catch` block and routed it through `log.error('Request failed', …)`, including `redirect(...)` which is a `{ status, location }` object with no `name`/`message`/`stack`. Resulted in noisy `[ERROR] Request failed { error: { name: undefined, … } }` lines on every auth redirect, post-login redirect, etc. Now skips `isRedirect()` and `isHttpError()` — those are SvelteKit flow control, not failures.
- **shadcn-svelte components silently lost active / open / checked styling** — components ship with `data-active:`, `data-open:`, `data-checked:` etc. shorthand classes that depend on `@custom-variant` blocks shadcn-svelte's CLI tailwind.css defines (mapping both `[data-foo]` and `[data-state="foo"]`, since bits-ui emits `data-state="<name>"` rather than the boolean form). This project's `sailor.css` only declared `@custom-variant dark`, so every other selector silently no-op'd. Symptoms: Tabs active-tab background invisible (only the workaround on `Switch`'s checked state was caught and inlined as `data-[state=checked]:` previously), Select dropdown open/close animations not firing, similar quiet failures on Accordion / Dialog / Dropdown / Checkbox state styling. Added the eight missing `@custom-variant` blocks (`data-active`, `data-open`, `data-closed`, `data-checked`, `data-unchecked`, `data-disabled`, `data-horizontal`, `data-vertical`) verbatim from upstream. All shadcn-svelte primitives now style their state correctly.
- **Timestamps stored as milliseconds, read back as years ~58000** — `getCurrentTimestamp()` returns a `Date` and is correct for **typed** drizzle inserts (drizzle converts to seconds based on column mode), but every raw `sql` template path that bound it directly leaked. The libsql driver serializes `Date` as milliseconds with no column awareness, while the schema is `integer({ mode: 'timestamp' })` (seconds) — so reads multiply by 1000 and produce dates like `Aug 30, 58296`. `blocks.server.ts` had the same bug via raw `Date.now()`. Most user-visible damage came from the collection save path: editing a collection item, saving an array field, attaching a featured image, or saving any item containing blocks pushed dozens of rows per save into the future.

  **Affected paths swept:**
  - `routes/sailor/collections/[slug]/[id]/data.remote.ts` (six sites: array-field upsert, file-relation insert, junction insert, `blockData` raw INSERT, block junction insert, block file-relation insert)
  - `routes/sailor/globals/data.remote.ts` (six sites: reorder UPDATEs, partial-save UPDATEs, raw INSERT VALUES on relational/repeatable globals, bulk-update INSERT)
  - `core/services/wordpress-import.server.ts` (two raw-SQL fallbacks: collection insert and category junction insert; collection postData fallback now converts any `Date` value to seconds before binding so imported `<post_date>` timestamps survive)
  - `core/content/blocks.server.ts` (block array upsert + block file-relation insert)

  Added a new `getCurrentTimestampSeconds()` helper to `core/utils/date.ts` (returns Unix seconds as `number`) for raw-SQL parameter binding, with JSDoc on both helpers explaining when to use which. The existing `getCurrentTimestamp()` (returns `Date`) keeps its semantics for typed drizzle inserts/updates.

  **New CLI**: `npx sailor db:repair-timestamps` (with `--dry-run`) walks every `_at`-suffixed integer column in every table, finds rows where the value exceeds `9999999999` (year 2286 in seconds — anything bigger is unmistakably ms-leakage), and divides by 1000 to bring them back to the expected seconds resolution.

### Changed

- **`db:update` now applies migrations via `drizzle-orm/migrator` instead of `drizzle-kit push`** on SQLite/libsql. Sidesteps a push bug where the SQLite table-rebuild path issues `CREATE UNIQUE INDEX <final_name> ON __new_<table>` _before_ dropping the original — index names share a global namespace, so the name collides. Migration files do DROP-then-CREATE-INDEX in the right order, so applying them via `migrate()` is collision-free. Dev DBs that previously kept in sync via push are auto-bootstrapped on first run (one row inserted into `__drizzle_migrations` marking the latest journal entry as applied; you'll see `📋 Adopted N pre-existing migration(s) …`). Postgres still uses push (no SQLite rebuild trap; no behaviour change).
- **`switch.svelte` reverted to canonical `data-checked:` / `data-unchecked:` shorthand** — the file previously diverged from upstream shadcn-svelte using `data-[state=checked]:` as a workaround for the missing custom-variants (see Fixed above). With the variants now in place, the shorthand resolves correctly and the workaround is no longer needed; the file matches upstream's selector style again.

### Upgrade notes

- **Run `npx sailor db:update`.** The codegen-default fix forwards previously-dropped defaults (e.g. `submissions.status='new'`, `categories.status='active'`, SEO `noindex=false`), so drizzle generates a migration that touches affected columns. On SQLite this triggers the table-rebuild dance for any collection/global with SEO fields or status defaults — the new migrate path handles it cleanly. No manual recovery needed.
- **Run `npx sailor db:repair-timestamps`** if your DB has rows showing future dates like "Aug 30, 58296" in admin tables. Use `--dry-run` first to see what would change. Only existing rows need fixing; new writes go through the corrected path.

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
- **Global tag taggable-type inconsistency** — `addGlobalItemTags` / `removeGlobalItemTags` were writing tags under a bare `'global'` taggable*type while `updateGlobalItemTags` and `updateRepeatableGlobal` used `global*${slug}`. The two endpoints now agree on the slug-qualified form, matching every other tag write path in the codebase.

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
