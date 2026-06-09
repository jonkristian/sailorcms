# Changelog

All notable changes to SailorCMS are documented here.

## [Unreleased]

### Added

- **Block grouping** — wrap blocks into layout containers in the collection editor: a block's group icon wraps it in a group, drag others in (one level deep, per-locale). Opt-in via `settings.ts` `blocks.groups` (declare it to enable) — with developer-defined `fields` (same field format as blocks). Render on the frontend with `getBlockTree()` / `isBlockGroup()`; optional `blockGroupAttrs()` (`sailorcms/utils/blocks`) maps a group's config to `data-*` attributes for CSS-driven layout (mechanical, no baked-in styling).
- **`color` field type** — swatch + hex input; usable in any template or group field.
- **Block editor: placeholder blocks** — a block with no visible (non-hidden) fields renders as a flat header labelled "Placeholder" instead of an empty padded card; block subtitle is hidden when it would be "Untitled".
- **`getCollections({ includeBlocks: 'grouped' })`** — each item's `.blocks` is the block-grouping tree (blocks + group nodes) instead of the flat list, so a slug-based route gets grouped blocks in one call (no separate `getBlockTree`). `true` stays flat.
- **`getImage(fileRef, opts)` accepts a file-field value** — pass a file-field object or array directly (not just an id/path); resolves to the first file's id. Drops `getImage(field.id)` / first-of-array boilerplate. New `resolveFileRef()` helper exported from `sailorcms/utils/files`.
- **`sailor content:purge-locale <code>`** — destructive cleanup CLI for a locale that's been removed from `content.i18n.locales`. Deletes every `_locales` row matching the code across localized collections + globals, sweeps orphan `taggables` (polymorphic — no FK cascade), and clears matching `search_index` + FTS rows. Refuses to touch the default locale, and refuses if the locale is still listed in settings (override with `--force`). Interactive by default (re-type the code to confirm); `--yes` for non-interactive runs.
- **`doctor` `i18n:orphan-locales` check** — surfaces `_locales` rows whose locale code is no longer in `content.i18n.locales`. Read-only (no `--fix`); the remedy is `content:purge-locale`.
- **`doctor` `globals:flat-id-mismatch` check** — flags flat (singleton) global rows whose `id` ≠ `slug` (which makes `getGlobals('<slug>')` silently return null). Read-only; the runtime warning now names the convention too.
- **Template lifecycle hooks (v1)** — collection/global templates can declare `hooks: { afterCreate, afterUpdate }` to react to saves (mail, webhooks, cache invalidation, cross-entity sync). Depth-guarded; failures isolated. See `docs/core-concepts/template-hooks.md`.
- **Search index deep coverage** — the indexer now walks array rows, file metadata (alt/title/description), and relation target labels (title/name/label), not just top-level strings — so search hits content nested in blocks/arrays/relations.
- **Image variant pre-warm on upload** — `storage.images.prewarmBreakpoints` generates responsive variants fire-and-forget after upload, so the first request isn't a cold transform. Zero-cost when unset.
- **Image cache hygiene** — per-file variant purge when a file is deleted (recovery purge), plus `enforceImageCacheSize` (a `cache.maxSize` sweeper) with a button in storage settings. Works for local + S3 caches.
- **Search index health UI** — `/sailor/settings/search` shows total indexed rows, FTS availability, and per-entity / per-locale breakdowns, with a rebuild button (`getSearchIndexHealth` / `reindexSearchIndex` remotes).
- **Mobile responsiveness** — pagination, the settings nav (mobile drawer), and the collection/global edit-page sidebars now lay out correctly at 375px.
- **Generator freshness dev-warning** — `ensureGeneratedFreshness()` logs a one-shot dev warning when `templates/` is newer than `generated/schema.ts` (forgot to run `db:update`). No-op in production.
- **ESLint guard for public-site components** — `components/sailor/site/**` may not import `$sailor/generated/*` (in sibling-link dev that alias resolves to sailor's own workspace, not the consumer's).

### Fixed

- **Globals dropped top-level file fields on save** — file fields (e.g. a testimonial `avatar`) were written as scalar columns (`no such column`); now persisted to their `global_<slug>_<field>` relation tables in both the single-item and bulk save paths.
- **camelCase file/array field keys silently skipped** — load + save built child-table names from the raw field key, but the generator snake_cases them, so `coverMobile` → `…_coverMobile` (doesn't exist) and the value was dropped with no error. Snake-cased the lookups across both item loaders, the shared file loader, the collection persister (incl. block files), and the WordPress importer.
- **Global `tags` + many-to-many fields dropped on save** — excluded from the scalar write (correct) but never written to their `taggables` / junction tables; now persisted on both the single-item and bulk save paths (which shared the gap).
- **Search indexed `title`/`slug` twice** — when a template declares them as explicit fields, the deep-coverage refactor double-counted them in the FTS body (skewed relevance). Restored the dedup guard.
- **Boolean group settings reloaded unchecked** — `block_groups` rows read via raw SQL return int `1/0`; `BooleanField` now accepts those (not just `true`/`'true'`).
- **`createGlobalItem` rejects localized globals** — was silently inserting a main row + indexing it without locale, leaving the item invisible to search and disconnected from the `_locales` machinery. Now throws with the same `dataType: 'flat'` / `localized: true` symmetry the JSDoc already implied.

## [0.8.2] - 01 June 2026

### Added

- **`getCollectionsFor(event, slug, opts)` / `getGlobalsFor(event, slug, opts)`** — sugar overloads that pick `locale` off `event.locals.contentLocale`, `user` off `event.locals.user`, and stamp the `'sailor:content-locale'` dependency tag automatically. Erases the `dependsOnContentLocale(event)` + `const locale = ... ?? getDefaultLocale()` + manual `user` threading from every localized loader. Existing `getCollections(slug, opts)` / `getGlobals(slug, opts)` stay unchanged for non-localized reads and request-less callers (cron jobs, scripts).
- **`getCurrentTranslations()`** (`sailorcms/utils/i18n`) — reactive accessor that reads `page.data` via `$app/state` and runs `extractTranslations` on it. Drops the `$derived(extractTranslations(page.data))` wiring from every localized layout: `<LanguageSwitcher translations={getCurrentTranslations()} ... />`. `extractTranslations(data)` stays for server-side / non-Svelte callers.
- **`content.i18n.urlStrategy`** setting (`'default-at-root' | 'symmetric'`, default `'default-at-root'`) — declare the public-site URL shape once in `templates/settings.ts`; `buildLocaleHref`, `buildLocaleHomeHref`, `defaultLangParamMatcher`, and `<LanguageSwitcher routeShape="flat">` all read it. Flip the value to change every generated URL without touching helpers.
- **`buildLocaleHomeHref(locale)`** (`sailorcms/utils/i18n`) — one-liner for brand/home links: `'/'` for the default locale under `'default-at-root'`, `'/<urlLang>'` otherwise. Reads `urlStrategy` / `defaultLocale` / `urlAliases` from settings.
- **`defaultLangParamMatcher`** (`sailorcms/utils/i18n`) — strategy-aware `lang` param matcher; drop straight into `src/params/lang.ts` as `export const match: ParamMatcher = defaultLangParamMatcher;`. Replaces the hand-rolled "refuse default URL form + delegate to urlToContentLocale" matcher from docs §8.
- **`<LanguageSwitcher urlStrategy={...}>`** prop — forwarded into the internal `flatRouteHref` so flipping `content.i18n.urlStrategy` propagates to the switcher. Defaults to `'default-at-root'` for backward compatibility; component still doesn't read settings itself (same workspace-context reason as `locales` / `urlAliases`).
- **`routePattern` option on `getCollections` / `getCollectionsFor` / `getGlobals` / `getGlobalsFor` / `search`** — pass `'/blog'` and pagination `baseUrl` derives via `buildLocaleHref` using the resolved locale + configured `urlStrategy`. Drops the `baseUrl: buildLocaleHref({ locale, section: 'blog', translation: null })` line from every paginated localized list loader. Explicit `baseUrl` always wins; no-op when i18n isn't configured.
- **`<HreflangLinks>`** (`components/sailor/site/HreflangLinks.svelte`) — emits `<link rel="alternate" hreflang>` markup inside `<svelte:head>` for every published translation plus `x-default` pointing at the default locale's URL. Mirrors `<LanguageSwitcher>`'s prop pattern (`translations` + `defaultLocale` + `urlAliases` + `urlStrategy` + optional `section` / `origin` / `buildHref`). Filters draft translations; skips locales without a slug on section routes (no fake "blog post alternates" pointing at the locale home). `origin` defaults to `page.url.origin`. `routeShape="home"` shortcut for the home route — every alternate is the locale root regardless of any slug the home row carries, dropping the universal `buildHref={(l) => buildLocaleHomeHref(l)}` override every consumer would otherwise add.
- **`generateLocalizedSitemap`** (`sailorcms/utils/site`) — server-side helper that enumerates collections + extraUrls and emits a sitemap XML with `<xhtml:link rel="alternate" hreflang>` alternates per translation (one `<url>` per language version, each carrying the full alternate set — Google's documented pattern). One-line consumer call from `sitemap.xml/+server.ts`. Filters drafts; handles non-localized collections + i18n-less sites gracefully; per-collection `limit` defaults to 50,000 (sitemap spec ceiling); per-translation `updated_at` drives `<lastmod>` so each locale's URL reports its own freshness. Per-collection `homeSlug` opts the front-page item into locale-root URLs (`/`, `/no`) instead of `/<section>/<slug>` — drops the universal "/pages/home is wrong" papercut for collections that hold a home item. Same-`<loc>` entries are deduped automatically (a localized item with full hreflang siblings beats a bare extraUrl) so a stray duplicate doesn't make it past the generator. `extraUrls` with `localized: true` now treats `path` as a literal URL pattern — `'/blog'` emits `/blog` + `/no/blog`, not `/blog/blog` + `/no/blog/blog` (the previous path-as-section-slug bug).
- **`updated_at` on `includeTranslations` payload** — translation rows now carry `updated_at` alongside `locale`/`slug`/`status`. Use it to compute staleness ("the nb-NO translation is older than the en source"). `extractTranslations` / `getCurrentTranslations` widened accordingly; non-localized callers see no behavior change.
- **`<LanguageSwitcher>` staleness signal** — when a chip's translation `updated_at` is older than the default locale's, the `<a>` gets `data-stale=""`. Pure attribute hook — sailor doesn't impose visuals; consumer styles `a[data-stale] { … }` however they like (asterisk, color shift, badge). No-op when `defaultLocale` is missing or translations don't carry timestamps. The default locale's own chip is never stale (source can't be stale relative to itself).
- **Cross-locale revisions in the History dialog** — for localized collections, the dialog now merges revisions across all of an item's `_locales` siblings into one chronological stream with per-row locale chips. Per-translation storage is unchanged (each `_locales` row owns its own history); the merge happens at read time. Diff is scoped to the same-locale latest peer so the "vs latest" comparison stays meaningful. Restore disables for non-active-locale revisions with a "Switch to {locale} to restore" hint — admins use the editor's existing locale switcher to flip to a sibling and restore from there (writing a `nb-NO` snapshot into the active `en` row would clobber the wrong content). `RevisionsService.list` accepts `entityIds: string[]` as a back-compat-safe alternative to `entityId`.
- **`extractSEO` locale-awareness** — new `currentUrl` and `translations` options. `currentUrl` (absolute) becomes the canonical fallback when `item.canonical_url` is empty, so each localized URL self-canonicalizes instead of every locale sharing one canonical (or none). `translations` (same array fed to `<HreflangLinks>`) emits one `og:locale:alternate` per published sibling locale — drafts and the current locale are filtered out. Both are opt-in; non-localized sites passing neither see no change. Closes a silent SEO breakage where the meta-tags blob looked right per-page but told crawlers "this is the only language version."
- **`buildLocalePath(path, locale, opts?)`** (`sailorcms/utils/i18n`) — locale-prefixes a literal URL path. Use when you have a final path string (a back-link, a related-post URL, a menu entry) and don't want to decompose it into `{ section, slug, translation }` just to feed `buildLocaleHref`. `'/blog/' + slug` → `/blog/<slug>` (default-locale under default-at-root) or `/no/blog/<slug>` (other locales). Reads `urlStrategy` / `defaultLocale` / `urlAliases` from settings; same opts surface as `buildLocaleHref`. Sitemap's `extraUrls.localized` branch now flows through it instead of inlining the prefix arithmetic.
- **`isFallback` / `requestedLocale` on fallback rows** — when `fallback: 'default'` returns the default-locale row because the asked-for translation is missing, the row now carries `isFallback: true` plus `requestedLocale: '<asked-for code>'`. Replaces the internal `_localeFallback` marker (which conflated truthiness check with locale value). Drops the `item._localeFallback ? "Translation for X pending" : ...` decode every consumer was hand-rolling; the new shape reads directly as `{#if item.isFallback}Translation for {item.requestedLocale} pending{/if}`.
- **`generateRobotsTxt({ origin, sitemap, disallow?, allow?, userAgent?, extra? })`** (`sailorcms/utils/site`) — minimal robots.txt builder symmetric with `generateLocalizedSitemap`. Stamps `Sitemap:` absolute (robots.txt requires it); multi-sitemap setups pass an array. `disallow: ['/sailor']` is the recipe-not-default (the helper stays unopinionated; consumers may mount the admin elsewhere or not at all).
- **`content.home = { collectionSlug, itemSlug }`** settings declaration — first-class statement of "which item IS the homepage." `getHomeConfig()` (`sailorcms/utils/i18n`) returns the declaration or null. `getHomeItem(opts?)` / `getHomeItemFor(event, opts?)` (`sailorcms/utils/data`) resolve it into a real row via `getCollections`, mirroring the `*For` event-aware sugar. Sitemap auto-detects: declaring `content.home` makes the matching collection's home item emit at locale roots (`/`, `/no`) with full hreflang alternates — no per-call `homeSlug` needed. The per-call option stays as an explicit override (or to opt out for a specific collection — passing `homeSlug: undefined` explicitly opts out, omitting the key uses the global declaration). The admin slug field renders a small "Homepage" badge with a tooltip warning when the current row matches `content.home`, so editors notice before renaming the slug. The product-y "Set as homepage" admin toggle (DB-backed by `itemId`, survives slug renames) is queued — it'll read through the same `getHomeItem` helper.
- **`generateLocalizedSitemap({ strictTranslations: true })`** — strict mode: a translation must carry a non-null slug to emit a `<url>` (the home item's slug-doesn't-matter carve-out is dropped under strict). Default stays `false` (current behavior — an auto-created `_locales` row with no slug still emits, signaling "this locale is coming" to crawlers and relying on `fallback: 'default'` to serve content). Parallel to `fallback: 'strict'` on the data loaders — same word, same intent ("only emit what's real"). Flip on once your translation set has stabilized and you don't want placeholder URLs in Search Console.

## [0.8.1] - 29 May 2026

### Added

- **`sailorcms/utils/i18n` entry point** — pure, client-safe content-i18n config helpers (`getContentSettings`, `getContentLocales`, `getDefaultLocale`, `getUrlLangs`, `urlToContentLocale`, `contentToUrlLang`). Re-exports the canonical definitions from `core/settings/i18n`. Use this import path in any file that ships to the browser (param matchers, universal loaders, components). `sailorcms/utils/data` keeps the same functions for server-side callers but pulls in `db` transitively — the new entry point sidesteps that.
- **`dependsOnContentLocale(event)` helper + `CONTENT_LOCALE_DEP` constant + `watchContentLocale(extractUrlLang)` client hook** (`sailorcms/utils/i18n` / `sailorcms/utils/data`) — call `dependsOnContentLocale(event)` from a load function to subscribe it to "content locale changed"; call `watchContentLocale((path) => path.split('/')[1] || null)` once at the root of your localized layout. Together they trigger re-runs on SPA navigation between locale prefixes for loaders that read only `event.locals.contentLocale` (not `event.params.lang`). Without `watchContentLocale`, the dep tag is no-op standalone — SvelteKit's auto-rerun tracks param reads, not `depends()` tags, and nothing else in sailor invalidates the tag.
- **`sailorcms/app` package export — ambient `App.Locals` type augmentation.** Consumer adds `/// <reference types="sailorcms/app" />` to their `src/app.d.ts` and `event.locals.user` / `.security` / `.contentLocale` get typed in every load / handler. Replaces the manual augmentation every consumer was writing by hand.
- **`buildLocaleHref({ locale, translation, section?, strategy?, ... })` helper** (`sailorcms/utils/i18n` / `sailorcms/utils/data`) — one-line href construction for the common `/[section]/[slug]` shape under either `'default-at-root'` (default) or `'symmetric'` URL strategies. Handles URL aliases + missing-translation fallback (section root or site home). Drop-in for `<LanguageSwitcher>`'s `buildHref` callback when the route shape is flat; consumers with custom URL layouts still write the callback by hand.
- **`getDefaultLocale()` helper** — like `getContentSettings().defaultLocale` but throws clearly when `content.i18n.default` isn't configured. Use in matcher / loader / switcher code paths that require it to function, so misconfiguration fails loudly at boot instead of as a downstream `undefined`-surprise. Plain `getContentSettings().defaultLocale` still returns `string | undefined` for callers that handle the absent case themselves.
- **`includeTranslations: true` option on `getCollections` / `getGlobals`** — attaches per-item `translations: Array<{ locale, slug, status }>`. Opt-in, one extra query per item. Always empty for non-localized entities. Wired through all collection + global localized read paths.
- **Multi-item reads on localized repeatable globals** — `getGlobals('projects')` (no `itemId` / `itemSlug`) on a localized repeatable global now works the same way as the equivalent collection call. Was a known limitation deferred from 0.8.0; new `handleRepeatableLocalizedGlobalMulti` mirrors the collection multi-item localized path (INNER JOIN + status/parent_id on `_locales` + count + pagination + groupBy). Single-item reads continue to honor `fallback: 'default'`.
- **`<LanguageSwitcher>` consumer-site component** at `components/sailor/site/LanguageSwitcher.svelte` — semantic `<a hreflang>` list, `Intl.DisplayNames` labels, `aria-current="page"`. Required props: `translations`, `currentLocale`, `locales`. One of `buildHref` (custom URL construction) or `routeShape="flat"` + `defaultLocale` (component detects current section from `page.url.pathname` and computes hrefs via `buildLocaleHref` internally — `/[section]/[slug]` URLs Just Work without the wrapper callback). Other optional props: `urlAliases`, `compact` (uppercased URL alias / 2-letter fallback), `showFlags` (regional-indicator emoji from the locale's region subtag — e.g. `nb-NO` → 🇳🇴; bare locales like `en` get no flag by default, supply via `flagFor`), `shortLabelFor` / `labelFor` / `flagFor` overrides, `showMissing`, `hideIfNoTranslations` (hide the switcher entirely when the item has zero translations). `<ul>` carries `data-compact` / `data-with-flags` attributes for CSS hooks.
- **URL aliases (`content.i18n.urlAliases`)** + helpers — settings map content locales to URL segments (`{ 'nb-NO': 'no' }` gives `/no/...` URLs while content stays tagged `nb-NO`). New `getUrlLangs()`, `urlToContentLocale(seg)`, `contentToUrlLang(locale)` helpers (in `sailorcms/utils/i18n` and re-exported from `sailorcms/utils/data`). Locales without an alias use their BCP-47 code unchanged.
- **`resolveContentLocale` option on `handleSailorHooks`** — when supplied, the hook stamps `event.locals.contentLocale` for downstream loaders and rewrites `<html lang="...">` on the public-site response. Admin tree unchanged (still paraglide-driven). Removes the per-consumer `transformPageChunk` boilerplate for the path-prefix routing pattern. Return type is `string | null | undefined` so consumers can chain sailor helpers without casting.
- **`resolveReadLocale` strict gate** — when `fallback: 'strict'` + >1 configured content locales + no `locale` passed, the read throws instead of silently serving the default. Forces explicit thread-through on multilingual routes; default mode unchanged.
- **`docs/core-concepts/content-translation.md` §8 "Path-prefix routing recipe"** — copy-pasteable walkthrough using the SEO-safe shape (default locale at root, non-defaults prefixed). One page route per URL via SvelteKit's optional `[[lang=lang]]` matcher; covers settings, matcher, hook resolver, loader, `<LanguageSwitcher>` with deep-linked alternates. Explicitly discourages the symmetric `/en/...` + `/no/...` shape because flipping an established site to it rewrites every URL (broken backlinks, redirect chains, search-ranking reset).

### Changed (breaking for 0.8.0 adopters)

- **Settings shape: `content.i18n.{locales, default, fallback}`** — was `content.{locales, defaultLocale, fallback}`. Cleaner namespacing. Migrate `templates/settings.ts` manually; no auto-migration.

### Changed (breaking for `<LanguageSwitcher>` consumers)

- **`<LanguageSwitcher>` no longer reads `$sailor/generated/settings` internally** — `locales` is now a **required** prop, and `urlAliases` is a new optional prop (default `{}`). Reason: the previous internal default broke in sibling-link dev setups because vite resolved the `$sailor` alias against sailor's own workspace instead of the consumer's, surfacing as a split-brain switcher (wrong order, wrong defaults). Pass them explicitly from `getContentLocales()` / `getContentSettings().urlAliases` at the call site — that resolves correctly in any vite context. Migration: add two props at every `<LanguageSwitcher>` usage; doc recipe (§8) updated.

### Changed (internal layering)

- **`getContentSettings` (and the other pure i18n helpers) moved to `core/settings/i18n`** as the canonical home; both `utils/i18n` and `utils/data/collections` now re-export from there. 7 core loaders / persisters / services updated to import from `core/settings/i18n` directly instead of reaching into `utils/data/collections` (a `core → utils` direction the boundary rule explicitly forbids).
- **Removed defensive `localizedMainIdentity` inline shapes** from 6 loaders/persisters (`utils/data/{collections,globals}.ts`, `core/data/loaders/{collection,global}-{item,list}.server.ts`, `core/data/persisters/collection-item.server.ts`). They were added during the doctor `--fix` era to avoid `SELECT collection.title` against a table where the column had been manually dropped. Now that the schema generator emits identity-only main directly for localized entities, Drizzle's typed `mainTable` only contains identity columns — plain `.select({ main: mainTable, locale: localesTable })` produces the same SQL the inline shapes did, without the boilerplate.
- **Schema generator emits identity-only main for localized entities in steady state** — was relaxed-full-main + `_locales`, with `doctor --fix` doing an out-of-band DROP COLUMN to clean up. That dropped state wasn't recorded in `__drizzle_migrations`, so the next `db:update` detected drift and refused to migrate. Now: the canonical localized shape is **identity-only main + `_locales`**. `db:update` runs in two phases — phase 1 emits the transitional shape (relaxed full main) for entities currently flipping so the data-copy migrator has columns to read from; phase 2 emits the steady-state shape and drizzle's normal migrate path drops the vestigial cols (recorded properly, no drift). End result: no doctor `--fix` step required, no schema drift, no `db:repair` needed for new flips.
- **Doctor's `i18n:vestigial-main-columns` check demoted to informational** (`fixable: false`). The remedy is `npx sailor db:update` — phase 2 drops vestigial cols via a real drizzle migration. The auto-fix DROP COLUMN is gone; it's exactly what caused the drift loop.
- **`SAILOR_TRANSITIONAL_LOCALIZED` env var** — comma-separated entity slugs that `db:generate` should emit in transitional shape. Set automatically by `db:update`'s phase 1; consumers shouldn't need to touch it directly. Empty / unset means all localized entities emit in steady-state shape.

### Fixed

- **`process is not defined` in the browser when consumer matchers / universal loaders import from `sailorcms/utils/data`** — those exports transitively pulled `core/db/index.server` → dotenv → `process.env`, which crashes once bundled for the client. The new `sailorcms/utils/i18n` entry is the pure path; doc recipe (§8) updated to use it in the param matcher + layout.
- **i18n migrator missed `block_*.collection_id`** — flipping a blocks-enabled collection to `localized: true` left blocks pointing at `main.id` while the loader expected `_locales.id`; pages rendered empty after migration. `repointChildren()` now walks every `block_*` table with a `collection_id` column and updates them alongside arrays / files / m2m junctions.
- **Localized list `sortBy` resolved to dropped main column** — `(main as any)[sortBy] ?? localesTable[sortBy]` picked `main.sort` (dropped by doctor) over `_locales.sort` (canonical). Inverted priority — fixes 500 on `/sailor/collections/<slug>` for nestable localized collections post-cleanup.
- **`entityLabelJoin` `COALESCE(_locales.col, main.col)` referenced dropped main columns** — recovery list / dashboard recent-activity / future audit surfaces failed when doctor had run. Now reads `title` / `updated_at` / `last_modified_by` straight from `_locales` for localized entities; non-localized path unchanged.
- **Admin item-route load swallowed the original error** — `/sailor/collections/[slug]/+page.server.ts` catch now logs `err` before re-throwing the generic 500. Diagnoses bubble to the dev terminal instead of being lost.
- **Creating a translation of a localized global duplicated / stole nested array rows from the source translation** — `core/data/loaders/global-item.server.ts` was missing the prefill-reid logic that `collection-item.server.ts` already had. Array rows arrived from the default-locale prefill with their original ids; the persister's `INSERT OR REPLACE` then re-pointed them under the new translation's `_locales.id` (or duplicated, depending on FK shape). Now: on the `_localePrefilledFrom` path, top-level array rows + their nested children get fresh UUIDs before render (via the shared `reidNestedRows` helper extracted to `core/data/i18n-prefill.server.ts`). Source translation keeps its content; new translation gets a clean clone.
- **`og:locale` meta tag emitted the static admin `siteLang` on localized public sites** — wrong metadata: a Norwegian `/no/about` page tagged itself as `en_US` (or whatever the admin's `siteConfig.lang` was). Crawlers and social embeds saw the wrong language for every translation. `extractSEO()` now accepts an optional `contentLocale` arg; when provided, it takes precedence over `siteLang` for og:locale emission. Consumer wiring: pass `event.locals.contentLocale` (or `data.locale`) from your localized layout/route loader.

### Known limitations

- **WordPress import doesn't support localized target collections** — slug lookup against `main.slug` fails when doctor dropped it. Marked with a `TODO` in `core/services/wordpress-import.server.ts`; importing into a localized collection isn't a supported path in this release.

## [0.8.0] - 22 May 2026

### Added

- **`entityLabelJoin(kind, slug)` in `sailorcms/utils/data/entity-label.server`** — shared JOIN + COALESCE primitive for resolving the display title / `updated_at` / `last_modified_by` of any collection or global, picking the editable copy from `_locales` for localized kinds. Recovery list (collections + globals) and dashboard recent-activity feed go through it; future audit / list / sidebar-preview surfaces shouldn't re-derive the localized split.
- **i18n auto-migration in `db:update`** — flipping an existing populated entity to `localized: true` now seeds `_locales` from main at the default content locale, re-points child-table FK columns at `_locales.id`, and rewrites legacy `<base>_locales` `taggable_type` rows to the unified `<base>`. Idempotent. `sailor doctor` flags vestigial main content columns afterward; `doctor --fix` drops them via SQLite `ALTER TABLE DROP COLUMN`.

### Changed

- **Admin item routes accept slug or UUID; `/new` is a sentinel redirect** — `/sailor/collections/<slug>/<id>` and `/sailor/globals/<slug>/<id>` (repeatable only) look up `<id>` as the row's UUID first, then fall back to `slug` (per-locale `_locales.slug` for localized). `<id>='new'` triggers a 307 to `/<freshly-generated-uuid>` so refresh / share / save all target the same row. "Add" buttons in list views already navigated to a freshly-generated UUID; `/new` is now back-compat for legacy links only.
- **`/sailor/settings/taggables` renamed to `/sailor/settings/tags`** — `taggables` is the polymorphic-join DB table name; admins see them as tags. Route folder, i18n keys (`settings_nav_tags_*`), layout nav, admin-search registration, and the in-page filter base URL all updated. The `taggables` DB table keeps its name.
- **Dashboard recent-activity collapses per-row user lookup into a single in-query JOIN** — previously fetched each row's modifier user one-at-a-time (N+1) and read `title` straight from main (returned 'Untitled' for localized rows since main's content is vestigial). Now joins `users` in-query via a `COALESCE(last_modified_by, author)` expression, and reads display columns via `entityLabelJoin`. Added a `toDate()` normalizer because drizzle's `mode: 'timestamp'` decode only fires for direct column references — COALESCE-wrapped values return raw seconds.
- **Localized main tables emit content columns nullable + non-unique** — `opts.relaxed` threaded through `cli/tools/generator/entities/{collections,globals}.js` → `createMainTable` → `buildFieldDefinitions` drops `notNull` / `unique` on every non-identity column (plus nullable `updated_at`) when the entity declares `localized: true`. Required so `ALTER TABLE ADD COLUMN` succeeds on populated tables during the non-localized → localized flip (SQLite refuses `NOT NULL` without default on existing rows). Vestigial post-migration; flagged by `sailor doctor`.

### Fixed

- **`saveCollectionItem` returned the main row for localized collections, blanking the form on save** — `result.item` was main, which post-flip has nullable / NULL content columns. The client's `formData = { ...formData, ...result.item }` then clobbered the freshly-saved title / slug / etc. with NULLs until manual refresh. Persister now merges main + `_locales` (with `_localeId` exposed) so the returned shape matches what the loader produces.
- **Creating a translation removed blocks from the source translation** — loader prefill returned the default-locale block + nested-array rows with their existing IDs; the persister's `INSERT OR REPLACE` on block save re-pointed those rows at the new locale's `_locales.id`, deleting them from the source. Loader now assigns fresh UUIDs to every block, nested array item, and page-level array row when `_localePrefilledFrom` is set, so the save inserts new rows and the source translation keeps its content.
- **Recovery purge of a localized item failed with `FOREIGN KEY constraint failed`** — `_locales` rows reference main; `DELETE FROM <main>` couldn't run while children existed. Purge now drops `_locales` rows for the item first within the same call, then deletes main. Applied to both collection and global purge.
- **Recovery / bulk-selection bar stayed at "3 of 0 selected" after a purge** — `useBulkSelection` held raw IDs that didn't intersect with the current items list. Selection now reports `selectedItems.filter(id ∈ live items)`, so any external mutation (purge, restore, invalidate) keeps the bar in sync. Affects every consumer (collection / global / files / recovery lists).
- **New collection / repeatable-global items saved with `id='new'` literal string** — loader stamped `page.id = itemId` even when `itemId === 'new'` (the route param), client submitted that back on save, persister inserted with `id: 'new'`. List row link then pointed at `/new` (back to the Create page) and a second Create attempt PK-collided. Loader generates a real UUID upfront; route load redirects `/.../new` → `/.../<uuid>` so refresh / share / save all target the persisted row. Flat globals (singleton-keyed-by-slug) are unaffected by design.
- **New repeatable-global items saved with empty `author` / `last_modified_by`** — generic `Object.keys(regularFields).forEach(...)` in the persister's INSERT branch ran after the pre-resolved `user.id` defaults and clobbered them with the empty strings the form-init seeds for every field. The author / `last_modified_by` keys are now skipped in that loop so the resolved defaults stick. Pre-existing rows aren't backfilled (cosmetic in the dashboard activity feed only — affected items show "Unknown User").
- **Users list "Opprettet" column rendered `-`** — `displayUsers` was pre-formatting `created_at` to a locale string, then the DataTable cellRenderer called `formatDate(...)` again, hit `isNaN(new Date(localizedString))`, returned `-`. Dropped the pre-format; cellRenderer handles it.
- **User detail breadcrumb rendered the user UUID** — the layout breadcrumb reads `page.data.page?.title` for the last-segment label; the user route returned `targetUser`, not `page`. Load now exposes `page: { title: user.name ?? user.email ?? 'New user' }`.
- **Nested array new-item header rendered the row's raw UUID** — `ArrayField.svelte`'s wildcard display-name fallback walked `Object.values(item)` looking for the first non-empty string and picked up either `id` or a parent FK like `global_id`. Now excludes `id`, any `*_id` column, and well-known system keys (`sort`, `created_at`, `updated_at`, `status`, `locale`); empty rows fall through to "Item N".
- **`$derived` reassignment misuse in `ArrayFieldModal`, `DraggableCard`, `RepeatableNestedView`** — three components declared state with `$derived(...)` then reassigned it in handlers (silently clobbered values on parent re-render, surfaced as `derived_inert` warnings on dialog teardown). Converted to `$state` + `onOpenChange` re-seed (`ArrayFieldModal`), `$bindable open` prop (`DraggableCard`), and a two-layer `$derived` optimistic-override (`RepeatableNestedView`) — no `$effect`. One residual `derived_inert` from inside bits-ui's Dialog / Select primitives is hands-off per CLAUDE.md and non-blocking.
- **`getImage` dropped `position` on the UUID branch** — `utils/files/client.ts`'s `getImageUrl` forwarded `width` / `height` / `resize` / `quality` / `format` to `/sailor/api/images/transform` but skipped `position`, so `getImage(uuid, { resize: 'cover', position: 'top' })` silently center-cropped (Sharp's default). Path-based inputs were unaffected. The transform endpoint already reads `position` from the query string.

## [0.7.5] - 22 May 2026

### Added

- **`createGlobalItem({ slug, data, authorId?, status? })` in `sailorcms/utils/data`** — public helper for inserting into a repeatable global (contact form, newsletter signup, anything where a visitor writes to a CMS-managed table). Validates `slug` against `globalDefinitions`, fills `id` / `status` / `last_modified_by` defaults, and — crucially — calls `SearchIndexService.onSaveSafe('global', slug, id)` so the new row appears in the admin command palette (⌘K) immediately. Raw `db.insert(...)` from `core/db` skips the FTS sync, so direct-insert rows were invisible to admin search until the next `npx sailor search:reindex`. Singletons (`dataType: 'flat'`) are unsupported by design — those upsert and should go through the admin save path.
- **Inline status toggle on the repeatable-globals list view** — clickable pill next to each row that cycles through the template's `status` options and persists immediately via a new `updateGlobalItemStatus` remote command (single-field write — won't clobber unsaved edits on other fields of the same item). Only renders when the template declares a `status` field with 2+ options; respects `update:content` permission. The whole row header is now also clickable to expand/collapse (drag handle, trash, selection checkbox, and the status pill stop propagation). Applies to every consumer of `DraggableCard` (inline globals, nested globals, array fields, blocks editor).

### Changed

- **`getGlobals` now filters repeatable globals by `status` (default `'published'`)** — previously the option only applied to relation targets, so top-level rows leaked drafts. Pass `status: 'all'` for admin previews. Singletons (`dataType: 'flat'`) have no status column and are unaffected. Internal callers updated: `search-index.server.ts` reindex paths pass `status: 'all'` (else draft submissions silently drop out of FTS); `utils/data/search.ts` propagates the caller's status to globals too (was collections-only).
- **Shipped global templates declare `status` explicitly** — `faq`, `menus`, `submissions`, `categories` now define a `status` field in the template rather than inheriting silently from `CORE_FIELDS`. All four default to `'published'` (submissions hide the field since the user-facing triage lives on `inquiry_status`); `categories` switched from `active` / `inactive` to `draft` / `published` for filter compatibility. Consumer globals that don't customize status still inherit the `CORE_FIELDS` options (`draft` / `published` / `private` / `archived`).
- **New-item default status for globals flipped from `'draft'` to `'published'`** — applies to the three places that hardcoded a fallback when the template doesn't declare a `status.default`: inline list (`RepeatableInlineView.addItem`), nested list (`RepeatableNestedView.handleAddNew`), and the dedicated edit page (`globals/[slug]/[id]/+page.server.ts`). Taxonomy / list-style content is usually publishable on creation, so the inverted default matches expectations for status-agnostic globals like `bransjer`. Collection forms keep the editorial-workflow `'draft'` default. Existing rows aren't migrated; backfill once with `UPDATE global_<slug> SET status = 'published' WHERE status != 'published'` for taxonomies / config-style globals.

### Fixed

- **Search reindex skipped protected globals/collections silently** — `SearchIndexService.reindexEntity` / `reindexAll` called `getGlobals` / `getCollections` without a user, so any entity with a non-public `access` rule (e.g. submissions with `access: { roles: ['admin', 'editor'] }`) hit `AccessDeniedError`, which `onSaveSafe` then caught and logged as a warning. Effect: rows were saved but never entered FTS, so `createGlobalItem` for submissions appeared to work but the row never showed up in ⌘K, and `npx sailor search:reindex` silently skipped them too. New `sailorcms/core/services/data-read.server.ts` exports `readGlobal` / `readCollection` — framework-internal reads that bypass the type-level access rule because the caller has no user to authenticate as. `getGlobals` / `getCollections` are unchanged on the public side. Run `npx sailor search:reindex` once after upgrade to backfill the missing rows.

## [0.7.4] - 15 May 2026

### Added

- **Auth + system email templates take overridable strings** — `passwordResetTemplate` / `emailVerificationTemplate` / `testEmailTemplate` accept `subject` / `heading` / `intro` / `cta` / `fallbackLine` with English defaults. CMS-internal callers (Better Auth, settings/mail test action) thread paraglide messages so reset/verify/test emails match the user's locale; new `auth_email_*` and `mail_test_email_*` keys in `en` / `nb-NO`.
- **`emailLayout` accepts `subject` and `preheader`** — `subject` populates `<title>` (used as inbox preview fallback in some clients), `preheader` injects a hidden span at the top of the body (the snippet shown next to the subject in inbox listings).
- **`Turnstile.svelte` exposes `reset` as a bindable callback** — `bind:reset` lets the parent call `reset()` after a server-side verify failure instead of wrapping the widget in `{#key}`. Calls `turnstile.reset(widgetId)` so the iframe stays mounted. Component also auto-resets on `expired-callback` and `error-callback`.

### Changed

- **`emailLayout` no longer emits a default "Sent via Sailor CMS" footer** — same layout is reused for recipient-facing notifications where CMS branding would leak. Pass `footerText` explicitly to render one. Auth + test emails get no footer now; `submissionNotificationTemplate` still wires its `footerNote` through.
- **Email templates drop the Google Fonts `<link>` + `@import url(...)`** — Gmail strips the `@import`, Outlook ignores the `<link>`, either way it was a privacy ping to Google on image load. Font stack is now system-only (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif`).

## [0.7.3] - 15 May 2026

### Changed

- **`/sailor/api/images/transform` 302-redirects to the storage public URL on cache hits** — instead of streaming the cached bytes through Node on every request. Adds `ImageProcessor.getCacheRedirectUrl()` (S3 HEAD probe + in-memory positive cache, 5-min TTL) plus a redirect branch on the endpoint. Cache miss path is unchanged: process synchronously, write to cache, return buffer; the next request for the same variant hits the redirect path. Local-storage consumers redirect to `/uploads/cache/<key>.<fmt>` (served by SvelteKit's static handler); S3/R2 consumers redirect to `${S3_PUBLIC_URL}/cache/<key>.<fmt>` (served by R2/CDN edge). Run `npx sailor core:update` to pick up the consumer-side endpoint change.
- **Image cache key now includes a path hash** — was filename-stem only (`abc_1600x1200_q88.webp`), so two files sharing a basename could collide and serve each other's cached bytes. Now `abc_<10-char-sha1>_1600x1200_q88.webp` per source path. Existing cache entries become unreachable on next deploy and are effectively orphaned in R2; sweep them with a one-liner if storage cost matters (`aws s3 rm --recursive s3://<bucket>/cache/` regenerates on demand).
- **R2 / S3 cache PUTs set `Cache-Control: public, max-age=31536000, immutable`** — the cache key is now content-stable per source path, so once the 302 redirect delivers a variant the browser can hold onto it forever. Previously R2 served the bytes with no Cache-Control header at all, relying on browser heuristics.
- **`/sailor/settings/storage` action cards laid out in a 3-column grid** (Import / Repair / Image Cache) instead of stacked rows. Storage Overview sits above the grid; Current Configuration unchanged.

### Added

- **Purge image cache button on `/sailor/settings/storage`** — wipes every variant under `cache/` on the configured storage provider (S3 list+batch-delete; local fs unlink) and resets the in-process state. Behind `hasPermission('update', 'settings')`. New `ImageProcessor.purgeStorageCache()` + `purgeImageCache` remote command. Variants regenerate on demand; first paint of each page after a purge is slower until the cache rewarms.
- **Storage Overview card on `/sailor/settings/storage`** — bordered list with a `/` root row showing aggregate `N folders · M files · X total` on top and child rows per top-level folder (count + size + an "Excluded from import" badge at the far right if matched by `storage.excludePaths`: defaults `cache/`, `backup/`, `backups/`, `.tmp/`, `.git/`). S3/R2 does one `ListObjectsV2` per folder bounded to 1000 keys (renders `1000+` if `IsTruncated` and propagates a `+` suffix into the root total); local provider walks recursively with the same cap. Added `StorageFolderSummary` to the storage provider interface.

## [0.7.2] - 15 May 2026

### Added

- **`site.lang` system setting** — BCP-47 tag for the public-site content language (e.g. `en`, `en-US`, `nb-NO`), set on `/sailor/settings`. Independent of the admin UI locale, since "Norwegian site, English admin" is a valid setup. Surfaced through `getSiteSettings()` as `siteLang` and consumed by `extractSEO()` for `og:locale`. The public site's `<html lang>` is the consumer's call — set it in `app.html`.
- **SEO meta-tag upgrade** in `utils/content/seo.ts` — `generateMetaTags()` now emits `og:type`, `og:site_name`, `og:locale` (xx_YY from `siteLang`), `<meta name="author">`, plus `article:published_time` / `article:modified_time` / `article:author` / `article:tag` when `og:type === 'article'`. `extractSEO()` accepts `siteLang`, `ogType`, and `authorName` and auto-derives `published_time` / `modified_time` / `tags` from the item. **`authorName` is opt-in by design** — sailor never reads the item's `author` column for it, since that column tracks who last edited the row (which a migration or admin fix can desync from who actually wrote it). Pass it explicitly when you want a byline.
- **`generateJsonLd(item, options)` in `utils/content/seo.ts`** — emits `<script type="application/ld+json">` blocks for `BlogPosting` (when `type: 'article'`) and `BreadcrumbList` (when `item.breadcrumbs` is populated via `includeBreadcrumbs: true` on `getCollections`). Absolute URLs derive from `siteUrl`; without it, image / `mainEntityOfPage` / breadcrumb item URLs are skipped rather than emitting Google-rejected relative paths. JSON inside the script tag escapes `</` to avoid premature tag close. Dev-site `(site)/blog/[slug]` + `(site)/pages/[slug]` wired up as working examples.

### Changed

- **`core:init` / `core:update` refuse to run inside the sailorcms package source** — same `isCorePackage()` gate as `doctor --fix`. Prevents a newcomer who cloned the repo from accidentally overwriting upstream templates/config with itself.
- **Generator warns on `many-to-many` relations inside array `items.properties`** — silently dropped before (no junction emitted, save/load discards values). Still unsupported structurally; warning makes the gap visible. Workaround: model the relation at the parent entity level. See `docs/core-concepts/templates.md`.

### Fixed

- **Confirm-password input now stays red while focused** — was using `class="border-red-500"`, which the Input's `focus-visible:border-ring` beat on focus. Switched signup + reset-password to `aria-invalid`, which the component already styles with `aria-invalid:border-destructive` + `aria-invalid:ring-destructive` and survives focus. Live "Passwords do not match" caption below the input removed in favour of the border-only signal; submit-time error toast unchanged.
- **Login tab order skips the "Forgot password?" link** — `tabindex={-1}` on the inline link so keyboard users tab email → password → submit instead of stopping on the link between the two inputs.
- **`canonical_url` no longer auto-filled on save** — `+page.svelte` was writing `${siteUrl}/${slug}` whenever the field was blank, baking a self-canonical the author never asked for. Now opt-in only; `extractSEO()` already only emits `<link rel=canonical>` when the field is truthy. Wipe legacy rows: `UPDATE collection_<x> SET canonical_url = NULL WHERE canonical_url IS NOT NULL` for any table that has the column.
- **`noindex` write path stores a real boolean** — was casting to `'true'`/`'false'` strings under a stale "column is TEXT" comment, but the schema is `integer({ mode: 'boolean' })`. Old rows can drift so the admin toggle reads ON while `extractSEO()` disagrees. Cleanup: `UPDATE collection_<x> SET noindex = 0 WHERE noindex IS NULL OR noindex != 0`.
- **Admin `<html lang>` now tracks the active paraglide locale** — was hard-stuck at `en` regardless of the admin user's language preference, hurting screen readers + browser translation. Sailor's hook rewrites the admin tree's `<html lang="…">` per request.

## [0.7.1] - 13 May 2026

### Added

- **Admin command palette** — `⌘K` / `Ctrl-K` anywhere under `/sailor/*` opens a global search over content (FTS, all statuses), files, users, and admin destinations. Locale-aware keyword aliases plus NFD/punctuation normalization mean `epost` finds Mail in EN and `mail` finds E-post in NB-NO. RBAC-gated so nothing surfaces that the user can't access.
- **`sailorcms/utils/mail` barrel** — re-exports the public surface (`sendMail`, `isMailConfigured`, `isMailHealthy`, all four templates, layout helpers). Consumers stop reaching into subpaths.
- **`submissionNotificationTemplate({ title, rows, message?, footerNote? })`** — generic contact-form-style notification template. HTML-escapes every input field so raw form values are safe to pass.

### Changed

- **`options.searchable: false` is the opt-out, not `true` the opt-in** — every collection/global is indexed by default. The public `utils/data/search()` keeps consumer behavior unchanged via a query-time allowlist. Run `npx sailor search:reindex` once on upgrade to backfill previously-excluded entities.
- **In-table "Search" → "Filter"** on `collections/[slug]`, `media`, `users`, `taggables` — icon swap (`Search` → `Filter`), placeholder + i18n key. `useTableFilters` API unchanged.

### Fixed

- **DB-init flag drifted from the db module on HMR** — `sailor-hooks.ts` cached `dbInitialized = true` while Vite reloaded `index.server.ts` and nulled `dbInstance`, causing "Database not initialized" on the next request when the CLI ran against a live dev server. Dropped the local flag; `initializeDatabase()` is already idempotent via its own promise memo, so awaiting it per-request is correct and HMR-safe. `getDb()` now also awaits init so it lives up to the proxy's error-message hint.

## [0.7.0] - 13 May 2026

### Added

- **Mail outbox at `/sailor/settings/mail`** — every `sendMail` writes a row; inspect rendered HTML preview or syntax-highlighted source (highlight.js xml), retry failed sends in place, copy provider message-id. Paginated. New `mail_events` table — re-run `npx sailor db:update`.
- **Generic admin-alerts sidebar slot** (`core/admin/alerts.{ts,server.ts}` + `admin-alerts.svelte`). First check: `isMailHealthy()` (driver env + sender account both present). Adding new alerts = one literal + one check + one icon mapping.
- **"Connect account" dropdown on `/sailor/account`** with confirmation dialog naming the purposes (Sign-in / Mail) being granted. Replaces per-provider buttons; surfaces a hint when env credentials are missing for known providers.
- **Disconnect linked OAuth accounts** from the account-detail dialog. Better Auth's last-account guard prevents lockout.
- **`doctor --fix` refuses to run inside the sailorcms package source** (`isCorePackage()` helper). Would otherwise have wiped the dev workspace's framework installs via `dedupeNestedSailorcmsDeps`. Read-only diagnostics still run.

### Changed

- **Submissions global**: `status` → `inquiry_status` (avoids colliding with the system status column), explicit `order` so the inbox table reads subject → name → email → phone → status.
- **Language + date-format pickers on `/sailor/account`** switched from native `<select>` to shadcn `Select` for consistency.
- **Mail retries update events in place** (attempts++, status flips, error refreshed) instead of inserting a new row, so the failed-count badge reflects current state.

### Fixed

- **Account-linking with mismatched emails now actually works** — added `trustedProviders: ['github', 'google']` to `accountLinking`. `allowDifferentEmails: true` alone didn't bypass the verified-email check at the link callback (`unable_to_link_account`).
- **`Dialog.Content` width needs the `sm:` prefix** — bundled `sm:max-w-md` was beating consumer-passed `max-w-4xl` at the `sm` breakpoint, so dialogs ignored their max-w override on real screens.
- **`/sailor/settings/mail` is admin-only** — page load + save/test/retry actions now check `hasPermission('read'/'update', 'settings')` (was any-authenticated-user). Mail event payloads carry PII (reset/verification URLs) and the retry action could replay stored emails to their original recipients.

## [0.6.9] - 12 May 2026

### Changed

- **`bun check` / `npm check` now compiles Paraglide first** so newly added i18n keys are visible to `svelte-check` without manually bouncing the dev server. The Vite plugin only runs on `dev` / `build`; check was running against a stale `messages/_index.js` barrel.
- **`sendMail()` returns `SendResult` instead of `boolean`** — `{ ok: true } | { ok: false, error }`. Drivers parse provider error responses (Google's `error.message` extracted from JSON) so admin UI can surface real causes. Existing callers that discard the return still work.
- **`MailDriver` interface gains optional `oauthRequirement: { providerId, scope }`** — drivers self-describe what they need. New helpers `getAccountPurposes(row)` and `getMailOAuthRequirements()` classify any linked OAuth account by purpose without hardcoded provider names; future Outlook / Zoho drivers just declare their requirement.

### Added

- **`core:init` scaffolds a `nixpacks.toml`** that includes `sqlite` in the build image — fixes `db:backup` falling back to a less-reliable file-copy method on Coolify / Railway / Render. Only written when absent; harmless on non-nixpacks hosts (Vercel / Netlify / plain Node ignore the file). Existing projects can add the file manually or set `NIXPACKS_PKGS=sqlite` as a build-time env var.
- **Gmail mail driver wired through Better Auth.** Admin connects via `/sailor/account` → **Connect Google**, picks the active sender at new `/sailor/settings/mail` (driver choice is UI-only — the dropdown lists whichever drivers have their env prerequisites met). Zero new deps — uses `nodemailer.MailComposer` + native `fetch` against Google's token + send endpoints. Requires `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` and the Gmail API enabled in Google Cloud Console.
- **Forgot-password + reset-password UI** at `/sailor/auth/forgot-password` and `/sailor/auth/reset-password`, with a "Forgot password?" link on login. The Better Auth backend hook was wired; the UI was missing.
- **HTML email templates** in `sailorcms/utils/mail/templates/` — generic layout (Inter font, indigo accent, dark mode) + helpers (`emailLayout`, `emailButton`, `infoBox`, `infoRow`, `sectionHeading`), and ready-made templates: `passwordResetTemplate`, `emailVerificationTemplate`, `testEmailTemplate`. Auth flows + admin test-email all go through them.
- **Connected accounts panel on `/sailor/account`** — clickable rows open a dialog with purpose badges (Sign-in / Mail sending) + per-purpose actions (Reconnect for mail). CTAs at the bottom for unmet mail-driver requirements auto-generate from the driver registry.
- **`/sailor/settings/mail` admin page** — driver picker + sender-account dropdown (lists every linked account satisfying the driver's `oauthRequirement` system-wide, labelled with the linked user and the actual provider-side email) + "Send test email" button that surfaces the real backend error on failure.

### Fixed

- **`db:repair` now sees tables with index callbacks** — schema parser's regex only matched 2-arg `sqliteTable()`, silently skipping `users` / `files` / `tags` / `taggables` / `searchIndex` / `revisions` (the 3-arg index form). Their drift was never reported, leaving columns like `files.deleted_at` and `users.preferences` missing after upgrades. Re-run `npx sailor db:repair` to pick up the previously-missed columns.
- **`db:repair` now CREATEs missing tables** (in addition to ALTERing columns) — previously it refused with "tables cannot be auto-created safely" and dumped recovery on the user. Parses the index callback for each missing table and emits CREATE TABLE + CREATE INDEX from `schema.ts`. Unblocks consumers whose `__drizzle_migrations` was bootstrap-ahead-of-actual-state.
- **Better Auth `sveltekitCookies` plugin moved to end of plugins array** — was first, so cookies set by later plugins' `hooks.after` weren't forwarded to SvelteKit's cookie store. Silences the startup warning and ensures `Set-Cookie` headers from `admin` / `captcha` make it out.
- **No more nested `<button>` in `PayloadPreview` / `SEOFields`** — `SheetTrigger` and `CollapsibleTrigger` each wrapped a `<Button>`, producing `<button><button>` (SSR placement warning + hydration mismatch risk). Both now use the bits-ui `child` snippet so the trigger forwards its props onto `Button` instead of rendering its own.
- **No more double-prompt on dirty record refresh + the soft-nav prompt is translated** — `useUnsavedChanges` was firing both the browser's native `beforeunload` prompt _and_ its own `window.confirm` on refresh / tab close (SvelteKit's `beforeNavigate` fires with `type: 'leave'` for those too). Soft nav (`type: 'leave'` filtered out) now uses `m.common_unsaved_changes_prompt()` (en + nb-NO); hard leave is left to the browser's localized native prompt. One prompt per action, both via browser-native modal primitives.
- **Password-change section on `/sailor/account` no longer hides when an OAuth account is linked.** Gate now checks `hasCredentialAccount` directly, so credential+OAuth users (e.g. signed in with a password, separately connected Gmail for mail sending) keep their password form.

## [0.6.8] - 11 May 2026

### Fixed

- **Status badges translated + distinct colors on the globals list too** — same `getStatusBadge` helper as collections.
- **New globals honor their template's declared `status.default` instead of hard-coded values** — three sites (`RepeatableNestedView`, `RepeatableInlineView`, `globals/[slug]/[id]/+page.server.ts`) now read `field.default` first, fall back to `'draft'`. Fixes `categories` (whose template declares `default: 'active'`) and nested-repeatables (which were saving `'active'` despite the CORE_FIELDS enum being `draft|published|private|archived`).
- **CORE_FIELDS status dropdown labels translate** — `SelectField` recognizes the sailor-system status values (`draft|published|private|archived|active`) and pulls their labels from the `status_*` i18n keys (same source as the status badges). User-defined select options are still rendered verbatim.
- **`patchViteConfig` keeps `optimizeDeps.include` in sync with required transitives** — idempotently splices missing entries on re-run, so consumers gain new ones via `core:update`. Currently: `highlight.js/lib/core`, `highlight.js/lib/languages/json`, `style-to-object` (svelte-sonner CJS interop).
- **Generated TS type names derive from `slug` (stable), singularized for collections/globals, kind-suffixed on globals/blocks** — breaking change, search-and-replace imports after `db:update`. Was deriving from translatable `name.singular` (so localizing display names silently renamed every consumer-side TS import). Stock shifts: `Menu` → `MenuGlobal`, `HeroSection` → `HeroBlock`, etc. Optional `typeName?: string` on the definition overrides for edges (`faq` → `Faq` loses casing; set `typeName: 'FAQGlobal'`). Adds `pluralize` dep (~10KB, CLI-only).

## [0.6.7] - 11 May 2026

### Added

- **Templates can now use any Lucide icon — with zero bundle bloat.** The sidebar's icon resolver was previously a hardcoded 14-entry map duplicated across `nav-collections.svelte` and `nav-globals.svelte` (`FileText, Layout, FolderTree, HelpCircle, Menu, Settings, Image, Users, Calendar, Tag, Database, Globe, ShoppingCart, BarChart`); anything else silently fell back to the default icon. Now `npx sailor db:update` walks all `globalDefinitions` / `collectionDefinitions` / `blockDefinitions`, collects every literal `icon: 'Name'` declaration, and emits `generated/icons.ts` with explicit named imports. `getLucideIcon(name)` (new in `sailorcms/core/ui/lucide-icon.ts`) reads from that map. Tree-shaking keeps only what's actually used — typical consumers will see 5-15 icons in the admin bundle instead of the full ~1700-icon Lucide barrel (~120KB gzipped savings vs a wildcard approach). Re-run `db:update` after adding new icons to templates. Caught a latent bug along the way: `templates/globals/submissions.ts` used `icon: 'Mail'` which wasn't in the old hardcoded list — it had been quietly falling back to the default icon and now resolves correctly.

- **Cloudflare Turnstile, auto-detected.** Admin sign-in / sign-up / password-reset gain captcha protection when both `PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` are present in the env — server-side via Better Auth 1.x's first-party `captcha` plugin (covers all three endpoints by default), client-side via a new `<Turnstile bind:token />` component dropped into the login + signup forms. Partial config is non-blocking by design: registration only happens when _both_ halves are set, so a half-configured deployment doesn't brick auth. The same component plus a `verifyTurnstileToken(token, remoteIp?)` server helper are exported from `sailorcms/utils/turnstile/...` for consumer-side forms (the helper short-circuits to `{ success: true }` when the secret key is unset, so guarded code paths still work in dev).

### Changed

- **`core:update` now overwrites `i18n/messages` on every run.** Previously the JSON files at `src/lib/sailor/i18n/messages/` were preserved across updates (seeded on first install, then skipped) on the theory that consumers might want to edit translations locally. In practice the folder holds only sailor-authored admin strings (toasts, sidebar, dashboard) that ship per-release, so the preserve behavior meant new keys never reached existing consumers — `m.foo is not a function` errors after a sailor upgrade that added i18n. `i18n/messages` is now in the same bucket as `core/` / `utils/`: package-owned, fully synced. (`i18n/paraglide/` compiled output is still regenerated on next dev/build start.)
- **Sidebar order of collections / globals is now stable + author-controlled.** Previously the layout loader sorted by `desc(updated_at)`, so the sidebar order chased whichever row the seeder touched last — essentially arbitrary, and reshuffled on every `db:update`. New `sort` column on `collection_types` / `global_types`, populated from each template's insertion order in `templates/<kind>/index.ts`. Optional `order?: number` field on `CollectionDefinition` / `GlobalDefinition` overrides for explicit control. Layout loader sorts `asc(sort), asc(slug)`. Drizzle generates the migration on next `npx sailor db:update`; seeder fills the new column on the same run, so existing installs pick up correct order with one command.

### Fixed

- **Status badges in collection tables now translate + have distinct colors per state.** Previously the cellRenderer rendered `item.status` raw (always English) with a two-variant scheme (`default` for `published`, `secondary` for everything else — so draft / private / archived were all the same grey). New `getStatusBadge()` helper (`sailorcms/core/ui/status-badge.ts`) returns `{ label, classes }` with new `status_*` i18n keys (en + nb-NO) and four distinct hues: published → emerald, draft → amber, archived → zinc, private → violet. Unknown status values (e.g. a template's custom select like submissions' `new`/`replied`) fall back to the raw string with a muted style so nothing renders worse than before.
- **Dashboard activity feed rows now translate + use real singulars.** Two bugs from the same root cause: the server was constructing English descriptions ("Created post", "Edited categorie") instead of sending signals, and was _faking_ the singular by stripping the last char of `name_plural` (`"Categories".slice(0, -1)` → `"Categorie"`, similarly broken for `Stories` → `Storie`, `People` → `Peopl`, etc.). The server now emits `{ descriptionKey: 'created' | 'edited' | 'updated', entity: name_singular }`; the client renders via new `dashboard_activity_desc_*` i18n keys. Verb localized, singular accurate.
- **Activity feed titles capped at 60 chars with ellipsis** and a `title=""` tooltip preserving the full text on hover — long FAQ-style entries no longer dominate the row.
- **`DeleteDialog`'s Cancel button now actually closes the dialog.** It was calling `onCancel` (default no-op) without touching `open`, so 4 of 5 callers (media, settings/taggables, globals/TableView, collections — none of which passed an `onCancel`) had a dead Cancel button. Cancel now sets `open = false`; `onOpenChange` is the single source of `onCancel` notifications regardless of close path (button / X / ESC / outside-click). Blocks.svelte (the one caller that did wire `onCancel`) behavior unchanged — its handler was already idempotent.
- **Storage scanner now excludes `backups/` (plural)** in addition to `backup/` (Sailor's own backup CLI convention) — covers user/legacy folders with the plural name. Template + both fallback lists updated; run `npx sailor db:update` to regenerate `generated/settings.ts` so the runtime filter picks up the new entry.
- **Long titles in admin tables no longer bleed into adjacent columns.** Shadcn's `TableCell` is `whitespace-nowrap`, and nothing was clipping — so a very long title visually rendered over the Status badge. `DataTable`'s first-column wrapper now `truncate`s, and the three title-button cellRenderers (collections, globals/TableView, users) gained `block w-full truncate` + `title={label}` tooltip. `MediaTable`'s filename cell dropped its hardcoded `max-w-xs` cap so it adapts to available width like the others.

### Changed

- **`useBulkDelete` lost its dead `cancelDelete` method** — no consumer ever called it (the dialog's `onCancel` was always the path used). Composable is now down to one more method narrower.

## [0.6.6] - 11 May 2026

### Fixed

- **Bulk-delete toasts: no more duplicate firing in mixed languages.** Two issues converged on the globals bulk-delete flow: (1) `useBulkDelete.executeBulkDelete` showed a hardcoded English `toast.success` _and_ the parent page showed its own i18n'd one — duplicate toast in two languages, with broken pluralization on non-English singulars (`"5 innsendings deleted successfully"`); (2) five remote endpoints (`bulkDeleteCollectionItems`, `bulkDeleteUsers`, `deleteFiles`, `deleteSetting`, `deleteTag`) returned hardcoded English `result.message` strings that `toastResult` / `result.message || …` consumers preferred over their i18n fallbacks. Composable no longer toasts (caller owns it); servers now return signal-only `{ success, deletedCount? }` and clients render the existing i18n keys.

### Changed

- **`useBulkDelete` trimmed to its actual surface** (87 → 56 lines): the unused `endpoint` mode, `itemType` / `onError` options, the "either-or" guard, and the English-only `toast.error` fallback are gone. `customDeleteHandler` is required; errors propagate to the caller.
- **Media single-file delete uses the same `DeleteDialog` as the bulk path** instead of the browser's native `confirm()`. `deleteFiles` is now pure side-effect (no UX gate, no `skipConfirmation` flag); a small `requestDelete(ids)` opens the dialog for both row-level and bulk-bar entries. Removes the last hardcoded English `confirm()` text in the admin.
- **User-ID clipboard toasts translated** — `core/utils/user.ts` now uses new `toast_user_id_copied` / `toast_user_id_copy_failed` keys instead of hardcoded English.

## [0.6.5] - 10 May 2026

### Added

- **Type-level access control on globals + collections** via new `access?: AccessRule` (`'public'` default | `'authenticated'` | `{ roles: string[] }`). `getGlobals` / `getCollections` throw `AccessDeniedError` on miss instead of silently returning `[]`. `submissions` global gated to admin/editor.

### Fixed

- **Relation loaders skip soft-deleted and unpublished targets.** `loadOneToXRelations` / `loadManyToManyRelations` now apply `liveOnly` + a column-aware status filter; status threads through `getCollections` / `getGlobals` / `getBlocks` (default `'published'`, admin block loader passes `'all'`).
- **One-to-X relations on array-row fields round-trip through the admin form.** `saveNestedArrayFields` lacked a `relation` branch, so the read-side-hydrated `{ id, ... }` object coerced to `'[object Object]'` in the FK column on save; now unwrapped back to the ID. Many-to-many on array rows still unsupported.

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
