# Changelog

All notable changes to SailorCMS are documented here.

## [Unreleased]

## [0.6.5] - 10 May 2026

### Added

- **Type-level access control on globals + collections.** New `access?: AccessRule` on `GlobalDefinition` / `CollectionDefinition` — `'public'` (default) | `'authenticated'` | `{ roles: string[] }`. `getGlobals` / `getCollections` throw `AccessDeniedError` (exported from `sailorcms/utils/data`) when the rule isn't met instead of silently returning `[]`. The `submissions` global is gated to `{ roles: ['admin', 'editor'] }` as the dogfood. Admin (`/sailor/*`) is unaffected — those routes don't go through the public read utilities. Object form is the extension point: per-row ownership / custom predicate / field-level redaction are queued in `ignored/TODO.md` and slot in as new keys on `AccessObject` without breaking existing templates.

### Fixed

- **Soft-deleted and unpublished targets no longer leak through relation fields.** `loadOneToXRelations` and `loadManyToManyRelations` resolved relation targets by pure ID lookup, ignoring `deleted_at` and `status` — a soft-deleted item attached as a relation kept rendering on the public site, and an unpublished/draft target would have leaked the same way. Both loaders now apply `liveOnly(targetTable)` unconditionally and a column-aware status filter; status threads from `getCollections` / `getGlobals` / `getBlocks` (default `'published'`, the admin block loader at `core/data/loaders/blocks.ts` passes `'all'` so previews still see drafts).
- **One-to-X relations on array-row fields round-trip through the admin form.** `saveNestedArrayFields` in `core/content/blocks.server.ts` partitioned array-row fields into array/file/regular but had no `relation` branch — read-side hydration of `studyLink: '<uuid>'` → `{ id, title, ... }` (added in 0.6.3) meant the full object went straight into the SQL params on save and JS coerced it to `'[object Object]'` in the FK column. New branch unwraps `{ id }` back to the scalar before persisting. Many-to-many on array rows remains unsupported (no junction tables for `items.properties`); tracked in `ignored/TODO.md`.

## [0.6.4] - 10 May 2026

### Changed

- **Array-row file persistence consolidated into `core/data/persisters/array-row-files.server.ts`.** `syncArrayRowFiles` / `clearArrayRowFiles` / `clearArrayRowFilesByParent` are now shared by globals' three save sites, collections, and blocks — replacing four near-identical inline copies. Prevents the same drift (the bug below exposed) from recurring the next time the contract changes.

### Fixed

- **Files nested inside array items round-trip through the admin form** (globals + collections). Three-layer asymmetry across entity types: globals + blocks generators emitted `${arrayTable}_${propKey}` relation tables for nested files, **collections didn't** (missing `else if (file)` branch in `createArrayTables`); admin save tried to write file values as columns on the array table (silently no-op'd once the column was removed); admin load only iterated top-level `fields` for `type: 'file'`. Generator now symmetric across globals/collections/blocks; save splits file props out and writes them to the relation table with `parent_id = arrayItemId` (cascade-clears on row delete); load recurses per row, clearing any stale legacy column values to canonicalize on the relation table.

## [0.6.3] - 7 May 2026

### Changed

- **`core:init` bootstraps `.env` with a generated `BETTER_AUTH_SECRET`** when none exists, copying from `.env.sailor` with the secret pre-filled. Existing `.env` left untouched.
- **Image tile backgrounds get a light backdrop in dark mode** (`dark:bg-zinc-100` over `bg-muted/40`) so transparent dark-ink assets stay visible after 0.5.2's switch to `object-contain`. Applied to `FileWithControls`, `RecentMedia`, `MediaEditModal`, and the file-picker thumbnail.

### Added

- **Pagination on three unbounded admin list views**: `/sailor/globals/[slug]` (repeatable + relational only — nestable/inline still load the full set by design), `/sailor/users`, and `/sailor/settings/taggables` (which also gains search). Standard `page` / `pageSize` shape, default 20, capped at 100. Tag stat cards stay site-wide via a separate `TagService.getTagStats()`; the old "Tags by Entity Type" section was removed since it didn't compose with pagination.

### Fixed

- **Dialogs no longer grow wider than the viewport when a field contains long unbreakable text** — pinned `DialogPrimitive.Content`'s grid to `grid-cols-[minmax(0,1fr)]` so children scroll horizontally within the input instead of pushing the dialog wider. Touches every Sailor dialog (fix is in the shadcn primitive — structural). Also bumped `ArrayField` item modal to `sm:max-w-2xl` so a tiptap toolbar fits on one row.
- **File URL repair detects S3 host drift**, not just empty / legacy-local URLs — flags any S3 row whose `url` doesn't start with the active `publicUrl` prefix (covers rotated buckets, CDN swaps, account migrations). Also fixed the repair update passing a string where Drizzle expects a `Date`.
- **`patchSvelteConfig` adds `compilerOptions.experimental.async: true` when `compilerOptions` already exists.** Without it, every admin RPC threw `experimental_async_required` — required by SvelteKit [remote functions](https://svelte.dev/docs/kit/remote-functions). Previously only written when no `compilerOptions` block existed.
- **`Intl.* RangeError: invalid language tag: "auto"` across the admin** when `date_format` was unset or `'auto'`. New `intlLocale()` helper maps `'auto'`/empty → `undefined` (Intl's "use host default"). Bypassed call sites in `users/+page.svelte` and `RecoverySection.svelte` rerouted through `getUserLocale()`.
- **`state_referenced_locally` warnings on the globals list page** — extracted `formData`'s initializer into a `buildInitialFormData()` closure (the rule's own suggested fix). The `svelte-ignore` directive didn't suppress regardless of placement; a `$derived` rewrite broke hydration with `bind:formData` across `{#key}` remounts.
- **Array-item field types honored by the schema generator** — `buildArrayItemFields` now dispatches `number → integer`, `boolean → integer{mode:'boolean'}` (was always TEXT). Existing TEXT columns persist until `npx sailor db:update` regenerates and migrates.
- **One-to-X relations on array rows resolve to full objects** instead of raw FK strings — `loadArrayFields` now runs `loadOneToXRelations` per row. Many-to-many on array rows remains unsupported (no junction tables for `items.properties`); tracked for later.
- **Generated `CollectionTypes` / `GlobalTypes` / `BlockTypes` unions use the same casing as their interface declarations.** The union builder was just stripping whitespace (`"Call to action"` → `Calltoaction`) while the interface side used `toValidIdentifier` (PascalCases each word → `CallToAction`). Multi-word template names broke type resolution in consumer code. Both sides now run through `toValidIdentifier`.

### Docs

- **Getting Started rewrite** — added `npx sv create` prerequisite; replaced manual `svelte.config.js` patch instructions with a note that `core:init` patches automatically (`npx sailor doctor --fix` recovers gaps); described the auto-bootstrapped `.env`.

## [0.6.2] - 5 May 2026

### Changed

- **Postgres consumers now use `migrate()` instead of `drizzle-kit push`**, matching SQLite/libsql. New `runPostgresMigrations()` mirrors the libsql bootstrap (seeds `__drizzle_migrations` from the journal head when tables exist but tracking is empty). Drift detection on Postgres is still a follow-up — `db-repair.js`'s checker is SQLite-specific.
- **`setupSailorFiles` + `updateSailorCoreFiles` collapsed into `mirrorSailorIntoConsumer({ targetDir, mode, force })`.** Pure refactor; no behavior change.
- **`extractSEO()` no longer auto-generates `canonical` from baseUrl + slug.** Self-canonicals are wrong for multi-domain / staging / duplicate-content cases. `canonical` now only emits when the consumer explicitly fills `canonical_url`. Removed the `baseUrl`/`basePath` options on `extractSEO()`. **Behavior change**: sites relying on auto-canonical lose those tags until the field is filled per page.

## [0.6.1] - 5 May 2026

### Changed

- **Bulk-selection toolbar in the media gallery stays visible while a selection is active** — new `selectionActive` prop on `FileWithControls` shows every tile's checkbox without requiring hover.

### Fixed

- **Schema generator escapes non-identifier characters in template names.** Names with em/en dashes etc. (e.g. `Partnere—logobånd`) emitted as invalid TypeScript interfaces. New `toValidIdentifier()` PascalCases parts split on whitespace/dashes/underscores/periods and strips anything outside `[A-Za-z0-9$_]`. Nordic characters (`å`, `ø`, `æ`) preserved — valid TS identifier characters.
- **`<button>` cannot be a child of `<button>` SSR warnings** in three places: `FileWithControls.svelte` (replaced `<div role="button">`+`<Checkbox>` with a `<label>` wrapper), `dnd/Blocks.svelte` and `collections/[slug]/[id]/+page.svelte` "Select all" (replaced inner Checkbox with span+icon, outer button gets `aria-pressed`).
- **`Pagination.svelte` uses `$app/state`'s reactive `page.url`** instead of `window.location.href`. Other intentional `window.*` uses (locale switcher, login redirects, `beforeunload`, `matchMedia`, `window.open`) audited and left alone with comments.
- **Clicking the media gallery's selection checkbox no longer opens the edit modal** — added `stopPropagation` so the label click doesn't bubble to the tile's `onclick`.

## [0.6.0] - 5 May 2026

Structural release: sailor's admin code now lives in `node_modules/sailorcms` and is resolved from the package, not copied into the consumer's tree. Consumer upgrades stop merging admin-code edits and new admin files are picked up automatically.

### Added

- **Admin code resolves from the `sailorcms` package** via wildcard subpath exports. Subtrees migrated: `components/sailor/`, `components/ui/`, `composables/`, `core/`, `remote/`, `scripts/`, `assets/`, `styles/`, `utils/`. `core:update` skips writing these and prunes stale copies. Consumers keep only `templates/`, `generated/`, `i18n/`, route shells, `hooks.server.ts`, and config. `patchSvelteConfig` / `patchViteConfig` inject the required knobs (`sailorcms/*` aliases, `resolve.dedupe`, `ssr.noExternal`, `optimizeDeps.exclude/include`); `cms-init`/`cms-update` strip duplicate framework deps nested under `node_modules/sailorcms/node_modules/`.
- **`npx sailor doctor`** — consumer-side healthcheck with `--fix`. Eight checks: stale admin imports in user-owned scaffold files, scaffold-route clashes, `svelte.config.js` / `vite.config.ts` patches, legacy `db:*` scripts, duplicate nested framework deps, `sailor.sqlite` write-lock. Read-only by default; exits non-zero on unresolved issues for CI.
- **`npx sailor dev:sync-ui`** — maintainer-only command that normalizes `npx shadcn-svelte add` output (rewrites `$lib/components/ui/...` → `sailorcms/components/ui/...`).

### Changed

- **CLI cleanup** — commands grouped by namespace in `--help` (`core:*`, `db:*`, `search:*`, `users:*`, `doctor`, `dev:*`); shared `loadConsumerEnv()` / `createConsumerLibsqlClient()` helpers; `dotenv` chatter suppressed.

### Fixed

- **`cms-init` dep-mirror bug** — was merging sailor's `dependencies` and `devDependencies` into the consumer's `dependencies`. Now classifies correctly with dedupe; `cms-update` collapses any existing duplicates on next run.
- **`patchSvelteConfig` ensures `kit.experimental.remoteFunctions: true`.** Sailor uses SvelteKit [remote functions](https://svelte.dev/docs/kit/remote-functions) for every admin RPC; the patcher now splices the flag into existing `experimental` blocks.
- **`patchSvelteConfig` rewrites function-form `compilerOptions.runes` to flat `true`.** `sv create`'s scaffold returns runes for project files but legacy mode for `node_modules` — Svelte 5 packages like `@lucide/svelte` and `bits-ui` use runes in their shipped source and break SSR in legacy mode.
- **Worked around an upstream `vite-plugin-svelte` bug** where `optimizeDeps.exclude`'d packages misroute virtual CSS lookups, causing Tailwind to parse the `.svelte` `<script>` block as CSS. The five sailor `.svelte` files with `<style>` blocks (`AuthWidget`, `PayloadPreview`, `RevisionsDialog`, `TagsInput`, `WysiwygField`) now import sibling `.css` files. Tracked at [sveltejs/vite-plugin-svelte#1325](https://github.com/sveltejs/vite-plugin-svelte/issues/1325); revert when it lands.

## [0.5.3] - 04-05-2026

### Fixed

- **Bumped `@sveltejs/vite-plugin-svelte` to `^6.0.0`** to match the `vite@^7` we already ship. Bun tolerated the peer mismatch but npm 8+ failed with `ERESOLVE`, breaking deploys on Coolify/Vercel/etc. Consumers get the bump automatically via `core:update`'s dep mirroring.
- **`patchSvelteConfig` upgrades bare `vitePreprocess()` calls to include `script: true`.** Without it, TS-stripping is skipped for shipped `node_modules` `.svelte` files (sailor admin, lucide, bits-ui) and the parser fails with `Unexpected token`. The 0.5.1 patcher only ran when `vitePreprocess(` was absent; now also rewrites empty `()` and splices `script: true` into existing options objects.

## [0.5.2] - 04-05-2026

### Changed

- **`getImage()` forwards `position` to the transform endpoint.** 0.5.1's `position` plumbing reached `<Image>` / `getFileUrl` but the CMS-internal `getImage()` was a silent no-op. Now wired through. `MediaGrid` opts in with `position: 'top'`.
- **Admin media thumbnails switched to `object-contain`** (with subtle `bg-muted/40` letterbox). 0.5.1's `object-cover object-top` fixed portraits but clipped the edges of logos/wide images. Applied to `FileWithControls`, `RecentMedia`, and the file-picker thumbnails. Callers needing crop can still opt in via `<Image position="top">`.
- **`MediaEditModal` preview shows the whole image** — `max-h-[60vh] object-contain` instead of fixed `h-96 object-cover object-top`.

### Fixed

- **`defaultView: 'read'` no longer mangles long sidebar values.** `ReadField`'s 2-column grid wrapped one word per line in the 320px sidebar. New `variant="sidebar"` switches to a stacked layout with `break-words` for long URLs / emails. Read-mode branches collapsed into a single `valueContent` snippet.

## [0.5.1] - 04-05-2026

### Added

- **Admin UI internationalization** (English + Norwegian bokmål, ~900 keys) via [Paraglide JS](https://inlang.com/m/gerre34r/library-inlang-paraglideJs) covering the full `/sailor` surface — toasts, dialogs, tables, filters, fields, settings, recovery, dashboard, WYSIWYG tooltips, and server-rendered chrome. `project.inlang/` and `i18n/messages/` ship under `src/lib/sailor/`; `core:update` preserves consumer refinements in `i18n/messages/`.
- **`language` user preference + browser auto-detection** — new `users.preferences.language` key (`'auto' | 'en' | 'nb-NO' | …`), default `'auto'`. `Accept-Language` parsed q-weighted with exact-then-prefix matching against available locales.
- **`date_format` independent of UI language** — regional locale for `Intl.DateTimeFormat` is its own preference, default `'auto'` (follows `language`). Lets users pick a regional date locale without changing UI strings.
- **Compact `LocaleSwitcher` in the admin header** — shadcn-svelte Select with globe icon. Selecting applies via Paraglide's `setLocale()`, persists via the new `updateMyPreferences` remote, then `invalidateAll()` for server-rendered chrome.
- **`updateMyPreferences` remote function** — generic additive patch into `users.preferences`. Designed for future per-user UI state.
- **i18n centralization helpers** — `toastResult()` (collapses ~30 try/catch toast sites), `pluralize()` (replaces inline ternaries), `requirePermission()` (~5 sites). All translation-friendly.
- **`FileTransformOptions.position`** — exposes Sharp's `resize.position` end-to-end through `getFileUrl()` → transform endpoint → `<Image>`. Cache key includes `position`.

### Changed

- **`DeleteDialog` / `BulkActionsBar` API: `itemType` → `labels: { singular, plural }`.** The string-template approach couldn't compose translatable text (Norwegian needs definite/indefinite + singular/plural forms). Server loads now expose `itemLabels`.

### Fixed

- **`runMigrations` patches drizzle-kit's SQLite rebuild bug** before invoking `migrate()`. When dropping `required: true` while adding fields, drizzle-kit's table-rebuild output lists the _new_ schema's columns on both sides of the `INSERT INTO __new_X SELECT` — SQLite errors `no such column: <new-col>` on the source. The patcher reads `PRAGMA table_info(X)`, drops nonexistent columns from both lists, and aborts with a precise diagnostic if a missing column is `NOT NULL` without a `DEFAULT`. Patched files are written back with a log line and should be committed alongside the template change.
- **Admin media thumbnails no longer clip the top of portraits** — switched raw `<img>` thumbs to `object-cover object-top`. Server-transformed images can opt into anchored cropping via `<Image position="top">`.
- **Block save normalizes one-to-X relation values to scalar ids** — block writes in `collections/[slug]/[id]/data.remote.ts` now run the same `value.id` extraction the collection-level path already had, so saving with a resolved entity object no longer binds `[object Object]` to the FK column.
- **`db:update` no longer false-positives drift when a migration is pending.** Drift detection now only fires when `__drizzle_migrations` is at-or-past the journal head (or on bootstrap with count=0); pending migrations get a pass and run normally.
- **`db:update` self-heals missing `drizzle.config.ts` and `drizzle/meta/_journal.json`** so `rm -rf drizzle/ sailor.sqlite drizzle.config.ts && npx sailor db:update` rebuilds cleanly without re-running `core:init`. Dialect picked from `DATABASE_URL`.
- **`npx sailor db:update` no longer delegates to a project-side `npm run db:update` script** that older `core:init` versions wrote (chaining `drizzle-kit push`, which fails on additive column changes against Turso). The CLI always runs the migrator flow now, and silently strips legacy `db:generate` / `db:push` / `db:update` scripts on every `db:update` / `core:update` (exact match — customized scripts preserved). Run `npx sailor db:repair` if your DB already drifted.
- **`core:update` bumps versions for sailor devDeps consumers placed under `dependencies`.** The previous loop only matched packages under `devDependencies`, so devDeps misclassified by the consumer (e.g. `bits-ui`, `drizzle-kit`, prosemirror packages under `dependencies`) silently froze at install-time.
- **Sailor's runtime UI deps moved from `devDependencies` to `dependencies`** — `bits-ui`, `embla-carousel-svelte`, `formsnap`, `layerchart`, `paneforge`, `sveltekit-superforms`, `tailwind-merge`, `vaul-svelte`, `@tanstack/table-core`. They ship into consumer admin code; the misclassification compounded the loop bug above.
- **`core:init` / `core:update` register `paraglideVitePlugin` in the consumer's `vite.config.ts`.** The 0.5.x i18n rollout depends on Paraglide's compile-time output at `$sailor/i18n/paraglide`; without the plugin, dev-server startup fails with parse errors in unrelated modules. Single idempotent `patchViteConfig()` now handles both Tailwind and Paraglide.
- **`core:init` / `core:update` patch `svelte.config.js` with the preprocessor and compiler options sailor needs** — `vitePreprocess({ script: true })`, `compilerOptions: { runes: true, experimental: { async: true } }`. Without these, the dev server fails with `Unexpected token` in shipped `.svelte` files. New `patchSvelteConfig` helper.
- **Loud end-of-run `⚠️  MANUAL ACTION REQUIRED` banner** when the config patcher couldn't auto-apply (unusual config shapes). Previously buried mid-run.

### Upgrade notes

- **No migration required.** `language` and `date_format='auto'` coexist with existing prefs; users with a previous `date_format` choice keep it. UI language defaults to `'auto'` (browser-detected); override via the topbar `LocaleSwitcher` or `/sailor/account`.
- **Consumers**: run `npx sailor core:update`. `i18n/messages/` and `templates/` are preserved.

## [0.5.0] - 01-05-2026

### Added

- **Crawler exclusion for `/sailor/*`** — `X-Robots-Tag: noindex, nofollow, noarchive` on every admin response, plus a `Disallow: /sailor/` in `static/robots.txt`. Public-site routes unaffected.
- **Per-collection revisions (opt-in)** — new polymorphic `revisions` table snapshots the full submitted payload on every save when a collection template sets `options.revisions: true` (or `{ keep: N }`, default 50). Restore re-runs `saveCollectionItem` with the snapshot — no timestamp-pairing logic. `RevisionsService` owns create/list/get/prune. Pages template ships with revisions enabled.
- **Revision history dialog with inline diff** — `RevisionsDialog.svelte`, opened from the admin header. Revisions preloaded by the route's server load. Older/Newer nav, position indicator. Source view: syntax-highlighted JSON; non-latest revisions show a unified diff against `revisions[0]` (`diffLines` from the `diff` package). Restore re-saves and re-initialises `formData`/`blocks` from a fresh `invalidateAll()`.
- **Header-level revisions button via shared module-level `$state`** — `core/ui/header-revisions.svelte.ts` exposes `{ openHandler, count }`; page publishes, layout reads. Decouples button placement from page-owned dialog logic.
- **`OverlayLoader.svelte`** — viewport-centered spinner masking layout shifts from async-mounting components (Tiptap, lazy imports). Fades out after `requestIdleCallback` (200ms fallback). Per-page opt-in via `minMs`.
- **Per-user preferences + locale-aware date formatting** — new `users.preferences` JSON column. First key is `date_format` (BCP-47), surfaced in `/sailor/account` as a 7-option select; updates merge additively so future keys survive. Helpers in `core/utils/user-preferences.ts` and `core/ui/user-locale.ts` (`getUserLocale()`); Better Auth `additionalFields` exposes the column on session.
- **Date helpers refactored to accept locale** — `formatDate` / `formatTableDate` / `formatDetailedDate` / `formatRelativeTime` (now using `Intl.RelativeTimeFormat`) and new `formatTimestamp` take an optional BCP-47 locale. Every admin call site routed through with `getUserLocale()`.

### Changed

- **Collection-item save invalidates on every save**, not only on create. Previous "merge `result.item` into `formData` and skip invalidation" optimisation left server-loaded data stale (e.g. `data.revisions`). The `untrack(...)`-init guard still protects in-progress edits.

## [0.4.1] - 30-04-2026

### Added

- **`npx sailor db:repair`** — applies missing columns via `ALTER TABLE ADD COLUMN` and reconciles `__drizzle_migrations` so future `db:update` runs apply incrementally. Supports `--dry-run`. SQLite/Turso only.

### Fixed

- **`runMigrations` silently masked schema drift on push→migrate upgrades** — the bootstrap recorded the journal head as "applied" without verifying the DB matched, so behind DBs stayed permanently behind (subsequent runs trusted `__drizzle_migrations` and skipped bootstrap). Drift detection now runs on every `db:update` regardless of bootstrap state, and refuses with a pointer at `db:repair` rather than silently no-op'ing.

### DnD safety

- **DnD drop-on-self orphaned items in nestable collections** — stale `dropPosition='inside'` on the dragged row itself made `handleDrop` emit `parent_id = item.id`, so the row attached as its own child (invisible in tree, not in Recovery). Reproduced on Windows/Chrome only. Fixed at three layers: `handleDrop` bails on self-drops; `updateCollectionItemNesting` rejects `parentId === itemId`; tree builders surface orphans as roots so already-hit rows reappear for re-parenting.

## [0.4.0] - 30-04-2026

### Added

- **SMTP / outbound email** — `utils/mail/server.ts` exposes `sendMail()` / `isMailConfigured()`. Better Auth password-reset and email-verification routes now go through it; consumer-side use (e.g. contact-form handlers) supported. Configured via env (`SMTP_*`, `SMTP_FROM`); no-ops with a warning when unset. Verification gating opt-in via `EMAIL_VERIFICATION=true`.
- **`defaultView: 'read'` on globals** — opens existing items in a compact label/value layout with an Edit toggle. New items still open in edit mode. Submissions template ships with this since it's write-once-then-read. New `mode` prop on `FieldRenderer` dispatches to a new `ReadField`.
- **"In Recovery" badge + Restore action on file fields** — soft-deleted file references show a red Restore badge that calls `restoreFile` in place. Picker/browse paths apply `liveOnly()`; the `ids` lookup branch stays unfiltered so existing references still resolve.
- **Recovery: per-type drill-down with pagination** — `/sailor/recovery` becomes an index; detail pages at `/sailor/recovery/files`, `/sailor/recovery/collections/[slug]`, `/sailor/recovery/globals/[slug]` use the shared `<DataTable>` / `<BulkActionsBar>` / `<Pagination>` building blocks. Multi-select bulk Restore + permanent Delete with single confirmation. Replaces the previous tabbed view (capped at 100 per section).

### Fixed

- **Codegen dropped template `default` for string/select fields** — `schema.js` only forwarded `notNull`/`unique`/`references` to the text adapter. Both layers now carry `default` through.
- **Codegen dropped `mode: 'boolean'` for boolean fields** — paired with the above, defaults flowed through the integer adapter as `.default(false)`, failing drizzle's `number | SQL` typecheck. Generic-field branch forwards `mode`; integer adapter emits `integer('name', { mode: 'boolean' }).default(false)`.
- **Sailor request logger flagged SvelteKit redirects as "Request failed"** — `handleSailorLogging` caught any thrown value, including `redirect(...)`. Now skips `isRedirect()` / `isHttpError()` — those are flow control, not failures.
- **shadcn-svelte components silently lost `data-active` / `data-open` / `data-checked` styling.** Components depend on `@custom-variant` blocks that shadcn-svelte's CLI tailwind.css defines (mapping both `[data-foo]` and `[data-state="foo"]`, since bits-ui emits `data-state="<name>"`). `sailor.css` only declared `@custom-variant dark`. Added the eight missing variants verbatim from upstream.
- **Timestamps stored as milliseconds, read back as year ~58000.** `getCurrentTimestamp()` returns a `Date` and is correct for typed drizzle inserts (drizzle converts to seconds based on column mode), but raw `sql` template paths that bound it directly leaked: libsql serializes `Date` as ms with no column awareness, while the schema is `integer({ mode: 'timestamp' })` (seconds). Swept the affected raw-SQL sites in `collections/[slug]/[id]/data.remote.ts`, `globals/data.remote.ts`, `wordpress-import.server.ts`, and `blocks.server.ts`. New `getCurrentTimestampSeconds()` helper for raw-SQL binding (with JSDoc explaining when to use which). New CLI `npx sailor db:repair-timestamps --dry-run` divides offending `_at` values > `9999999999` by 1000.

### Changed

- **`db:update` applies migrations via `drizzle-orm/migrator` instead of `drizzle-kit push`** on SQLite/libsql. Push hits an upstream bug where the table-rebuild path creates the unique index on `__new_<table>` _before_ dropping the original (index names share a global namespace, so they collide). Migration files do DROP-then-CREATE in the right order. Dev DBs are auto-bootstrapped on first run. Postgres still uses push.
- **`switch.svelte` reverted to canonical `data-checked:` / `data-unchecked:` shorthand** now that the missing `@custom-variant` blocks (see Fixed) are in place; matches upstream shadcn-svelte again.

### Upgrade notes

- **Run `npx sailor db:update`.** The codegen-default fix produces a migration touching columns that previously dropped their defaults (`submissions.status='new'`, `categories.status='active'`, SEO `noindex=false`). The new migrate path handles the SQLite rebuild cleanly.
- **Run `npx sailor db:repair-timestamps`** if your DB has rows showing future dates like "Aug 30, 58296". Use `--dry-run` first.

## [0.3.5] - 29-04-2026

### Added

- **Soft-delete + Recovery view** — `deleted_at` / `deleted_by` auto-injected on every collection, global, block, file, and tag table. Admin deletes flip from `db.delete` to soft-delete; new `/sailor/recovery` route lists trashed items with one-click Restore (re-instates at root with neutral position) and separate hard-purge. Read paths gain a shared `liveOnly()` filter.
- **"In recovery" banner on the edit page** — direct navigation to a soft-deleted item shows an amber banner with one-click Restore.
- **`DeleteDialog` `permanent` flag** — soft-delete copy by default; recovery's purge passes `permanent={true}` for the "cannot be undone" wording.

### Changed

- **Collection editor save no longer route-reloads on every save** — `saveCollectionItem` returns the persisted row + tags; client merges into `formData` instead of `invalidateAll()`. First-save still invalidates once for the Create→Save header flip.
- **Save toasts use stable ids** (`collection-save`, `global-save`, layout redirect-error, DnD reorder/nest) — rapid saves coalesce instead of stacking.
- **Default expand/collapse button label** matches actual initial state (everything starts collapsed → starts as "Expand All").
- **File picker height stable** — Sheet locked at `65vh`.
- **`useUnsavedChanges()` API** — now takes a `() => boolean` getter; eliminates the `$effect → setHasChanges` pattern at call sites.

### Fixed

- **DnD nest-trap in nestable collections** — the "inside" drop band covered the middle 50% of each row; drops near row gaps nested under the wrong parent and disappeared into collapsed children. Shrunk the inside band to 20% and auto-expand on `inside` drops.
- **Inline-view global delete didn't actually delete** — guard `if (item.id && item.created_at && ...)` false-skipped the server call when `created_at` was lost through round-trips. Simplified to `!id.startsWith('temp-')`; `localItems` is now `$derived` from the prop.
- **Phantom `tags` columns** dropped from `collection_pages`, `collection_posts`, `global_faq` — leftovers from the 0.3.3 generator bug.

### Internal

- **`$effect` audit: 20 → 3 sites.** Conversions: prop-mirrors → `$derived` with override (Svelte 5.25+); URL-change effects → `afterNavigate`; dialog/step-open effects → trigger at source event; lazy-load → `$derived` + `{#await}`; bidirectional sync → one-way data flow; callback-prop registration → `$bindable` slot props. Remaining legitimate uses: `unsaved-changes` (beforeunload teardown), `MediaEditModal` (async tag fetch), `RelationField` (state machine), `file-picker` (`open` prop watcher).
- **`liveOnly()` helper** at `core/db/soft-delete.ts` — single source of truth for `deleted_at IS NULL` with no-op fallback for tables without the column.
- **Restore + purge endpoints split per entity type.** Purge only deletes `deleted_at IS NOT NULL` rows; `purgeFile` also drops the physical blob.

### Upgrade notes

- **Run `npx sailor db:update`.** Migration adds `deleted_at`/`deleted_by` and drops legacy phantom `tags` columns. Choose "add column" for every drizzle-kit prompt.
- **`useUnsavedChanges()` callers**: replace `setHasChanges(...)` with the getter form: `useUnsavedChanges(() => Object.keys(userChanges).length > 0)`.

## [0.3.4] - 29-04-2026

### Added

- **Live slug normalization on blur** — tabbing out of a slug field slugifies the value and runs the uniqueness check via the same `getUniqueSlug` the button uses. Silent (no toast); the button keeps its toast since it's a deliberate action.

### Changed

- **Server-side slug sanitization on save** — `saveCollectionItem`, `updateRepeatableGlobal`, `updateRelationalGlobal`, and `bulkUpdateGlobalItems` now run `slugify()` before persisting, so non-UI write paths get the same canonicalization.
- **Globals get the same `-2`/`-3` dedupe collections already had** — repeatable / relational / bulk-update global saves now use the shared `ensureUniqueSlug` inside the transaction instead of relying on the UNIQUE constraint to surface a raw error.
- **Tag slug generation uses `slugify()`** — `TagService.createTag` was rolling its own regex, dropping diacritics ("Café" → `caf`). Shared `slugify` decomposes accents and applies the standard length cap.
- **DnD reorders are silent on success across the board** — `RepeatableNestedView` was emitting a toast on every drop. Standardized on silent (the row staying put is the confirmation); errors still toast.

### Fixed

- **`æ`, `ø`, and other non-decomposing Latin letters were stripped from slugs** — `slugify` relied on `normalize('NFD')` to flatten accents, but æ/ø/œ/ß/þ/ł/đ aren't decomposable; they fell through the `[^\w\s]` strip ("Bjørn" → `bjrn`). Now explicit transliterations: æ→ae, ø→o, œ→oe, ß→ss, ð→d, þ→th, ł→l, đ→d.
- **`options.sortable` had no effect on simple repeatable / relational globals** — `globals/(components)/TableView.svelte` rendered `<DataTable>` without `sortable` / `onReorder` props. Backend (`reorderGlobalItems`) and the inline/nested wiring already existed; just the simple view was missing it.

### Internal

- **DB-aware slug uniqueness consolidated into `core/utils/slug.ts`** — three near-identical `ensureUniqueSlug` loops collapsed into one helper accepting an optional Drizzle transaction. WordPress importer's collision counter shifts from `-1` to `-2` for consistency.

### Upgrade notes

- **Existing slugs are not retroactively normalized.** Pre-0.3.4 rows with non-canonical slugs (`"Bjørn"`, `"Anders And"`) stay untouched until re-saved; their URLs won't resolve through the admin lookup. Re-save or run a one-shot `UPDATE`.

## [0.3.3] - 27-04-2026

### Changed

- **Preview link honors `canonical_url`** — collection edit's Preview navigates to `canonical_url` when set, otherwise the existing `basePath + slug` derivation. Solves the homepage case (slug `front` rendered at `/`).
- **`canonical_url` is override-only** — the SEO panel no longer auto-fills it from `siteUrl + slug`, and "Refresh from Content" no longer touches it. Default canonical still resolves at render time via `seo.ts`. Pre-existing auto-filled rows keep their stored value as explicit overrides; clear by hand to fall back to the default (especially worth doing on collections with a `basePath`, since the old auto-fill omitted it).
- **`drizzle.config.ts` extracted into `sailorDrizzleConfig()`** — the library owns dialect selection, credentials, and `tablesFilter` defaults. User config is a two-line import + `export default sailorDrizzleConfig()`.
- **Dialog widths consolidated** to three canonical sizes: `sm:max-w-md` (confirmations), `sm:max-w-2xl` (edit forms), `sm:max-w-4xl` (wide content). Removed seven one-off widths.

### Fixed

- **`getGlobals` pagination broken** — `total` was the page length, `hasMore` compared `offset + items.length < items.length` (always false). Now matches `getCollections`: parallel `count()` query for `total`, new `baseUrl` / `currentPage` options emit a `pagination` object.
- **drizzle-kit rename prompts for FTS5 shadow tables** — every `db:update` asked to rename `search_index_fts*` to whatever new table was being added. New `tablesFilter` excludes them.
- **Phantom `tags` column on generated tables** — the schema generator emitted `tags TEXT` for any `type: 'tags'` field, even though tag data lives in the polymorphic `taggables` join table. Silent on collections/globals (save path strips tags before INSERT) but broken the first time a **block** declared `type: 'tags'`: SQLite rejected the bind with `[object Object]`. Generator now skips `type === 'tags'` in `buildMainTableFields`. Existing phantom columns are harmless (nullable, unused).
- **Block save / read didn't handle tags.** `saveCollectionItem` now collects `type: 'tags'` fields into `pendingBlockTags` and flushes via `TagService.tagEntity('block_<slug>', blockId, tagNames)`. `loadBlockFields` and `loadCollectionFields` now look up tags per item via `TagService.getTagsForEntity`. Blocks, collections, and globals finally agree on the read path.

### Upgrade notes

- **Replace your `drizzle.config.ts`** with:
  ```ts
  import { sailorDrizzleConfig } from './src/lib/sailor/core/db/drizzle-config';
  export default sailorDrizzleConfig();
  ```
  Picks up the FTS5 `tablesFilter` and lets future fixes propagate via `core:update`. Custom overrides: `sailorDrizzleConfig({ schema: '...', tablesFilter: ['!my_table'] })`.
- **(Optional) Clear stale auto-filled `canonical_url` values** if you previously clicked "Refresh from Content" on a page in a collection with a `basePath` — the stored canonical was generated without the basePath. Clearing falls back to the correct runtime default.

## [0.3.2] - 23-04-2026

### Added

- **Site search** — new `search()` utility at `$sailor/utils/index`, backed by a denormalized `search_index` core table kept current via save hooks. Opt-in per template with `options.searchable: true`. SQLite/Turso uses FTS5 with the trigram tokenizer (substring-friendly), falling back to LIKE on empty FTS results. Results hydrate through `getCollections`/`getGlobals` so URLs, blocks, and ACL work as elsewhere. Ships with `npx sailor search:reindex` and a demo route at `/search`. See `docs/reference/utilities.md`.

### Fixed

- **CLI package-manager detection** — `core:update` now recognizes Bun's text-format `bun.lock` (Bun ≥1.2) alongside legacy `bun.lockb`. Previously fell through to `npm install`, regenerating a stray `package-lock.json`. Detection order also reshuffled so bun/pnpm/yarn take precedence when multiple lockfiles coexist.
- **Collection list DnD handles missing on navigation** — `useTableFilters` captured `defaultSort` / `defaultOrder` as static strings at hook-call time, so reusing `+page.svelte` across collections leaked defaults (e.g. Posts' `'updated_at'` into Pages). Defaults now accept reactive getter functions, and the hook re-syncs from the URL on route change.
- **Switch track invisible** — `Switch` used `data-checked:` / `data-unchecked:` shorthand (compiles to `[data-checked]`), but bits-ui emits `data-state="checked|unchecked"`. Background, dark-mode thumb, and translate all no-op'd. Switched to `data-[state=checked]:` / `data-[state=unchecked]:`.
- **Global tag taggable-type inconsistency** — `addGlobalItemTags` / `removeGlobalItemTags` wrote under bare `'global'` while `updateGlobalItemTags` / `updateRepeatableGlobal` used `global_${slug}`. All paths now agree on the slug-qualified form.

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
