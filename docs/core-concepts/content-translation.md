---
layout: default
title: Content Translation
parent: Core Concepts
nav_order: 3
---

# Content Translation

Sailor's content translation lets editors author the same item in multiple languages — separate translations of a Page, Post, FAQ, or any other entity, linked by identity. Translation is **opt-in per template** via a single `localized: true` flag, and a translation can diverge from its source as freely as a fresh item: different title, slug, blocks, featured image, categories, tags.

Distinct from Paraglide (admin UI strings). This page is about translating **content** — what your editors author.

---

## 1. Enable per project

In `src/lib/sailor/templates/settings.ts`:

```ts
export const settings: SailorSettings = {
  // ...
  content: {
    locales: ['en', 'nb-NO'], // BCP-47 codes for available content locales
    defaultLocale: 'en', // used for prefill, fallback, migration backfill
    fallback: 'default' // 'default' | 'strict' — see §5
  }
};
```

- If `content.locales` is unset, Paraglide's `locales` are used.
- If `content.defaultLocale` is unset, Paraglide's `baseLocale` is used.
- Adding a locale to `content.locales` is a settings change only — no schema migration. Existing items gain support for the new locale; editors translate one at a time, prefilled from the default.
- Removing a locale is also a settings change — existing `_locales` rows for the removed locale stay in the DB (data-preservation default). Cleanup is queued for a future `sailor content:purge-locale <code>` CLI.

---

## 2. Opt in per template

Add `localized: true` to any collection or repeatable global template:

```ts
// templates/collections/posts.ts
export const postsCollection: CollectionDefinition = {
  slug: 'posts',
  localized: true,
  fields: {
    title: { type: 'string', required: true, label: 'Title' },
    excerpt: { type: 'string', label: 'Excerpt' },
    content: { type: 'wysiwyg', label: 'Content' },
    featured_image: { type: 'file', items: { fileType: 'image' } },
    categories: {
      type: 'relation',
      relation: { type: 'many-to-many', targetGlobal: 'categories' }
    },
    tags: { type: 'tags' }
  }
};
```

What this changes:

- The generator emits a `collection_posts_locales` sibling table holding every editable field, plus `slug`, `status`, `updated_at`, `last_modified_by`. One row per `(item, locale)`.
- File / relation / tag junctions point at `_locales.id` rather than `main.id` — each translation owns its own selections.
- Block tables stay single-language. On first save of a translation, blocks are deep-cloned from the source translation so each language gets independent block instances.
- Run `npx sailor db:update` once after flipping the flag. For an existing populated entity, the auto-migrator copies main rows into `_locales` at the default locale and re-points child-table FKs.

Collections / globals without `localized: true` are unchanged — single-language, no `_locales` sibling.

> **Scope**: `localized: true` works for `Collection` and repeatable `Global` (`dataType: 'repeatable'`). Flat singletons (`dataType: 'flat'`) are not localized in v1 — open an issue if you need them.

---

## 3. What's per-locale vs per-item

Every template-declared field is **per-locale**. Status and slug are per-locale too — publish EN while NB stays draft, or have `/en/about` and `/no/om-oss` coexist trivially.

Stays per-item (lives on main, shared across translations):

- `id`, `created_at`, `deleted_at`, `deleted_by`
- `author` (original creator)
- Item-level soft delete cascades to all translations.

There are **no per-field flags**. Once a collection is localized, it's all-or-nothing — editors get full freedom per translation. If you need "this SKU should stay in sync across locales", handle it as editorial workflow (update each translation) — a "copy to all locales" UI helper may land later.

---

## 4. Admin UX

The collection edit page (`/sailor/collections/<slug>/<id>`) gains a locale switcher pill row above the form. Each pill is one of:

- **active** — the locale you're currently viewing
- **translated** — a `_locales` row exists for this locale
- **missing** (clickable, marked `+`) — no row yet; clicking opens the form prefilled from the default locale's row

URL gains `?locale=<code>` so deep links and back-button work.

**Lazy creation.** Switching to a missing locale doesn't write anything. The server returns the default-locale row as a starting draft (scalars + per-locale junctions + deep-cloned blocks). The `_locales` row is INSERTed on first save. Open a tab, navigate away, no trace.

---

## 5. Read API

`getCollections()` and `getGlobals()` accept `locale` and `fallback`:

```ts
const post = await getCollections<Post>('posts', {
  itemSlug: 'hello',
  locale: 'nb-NO',
  fallback: 'default' // 'default' (use defaultLocale) | 'strict' (omit)
});
```

Resolution:

1. JOIN main + `_locales` WHERE `_locales.locale = ?` AND `_locales.status` matches.
2. If no `_locales` row for the requested locale and `fallback === 'default'`: return the default-locale row with a `_localeFallback: 'en'` marker so the consumer can render an indicator.
3. If `fallback === 'strict'`: omit / return null.

If `locale` is unset, `content.defaultLocale` from settings is used.

For non-localized collections, `locale` / `fallback` are ignored.

---

## 6. Slugs per locale

Slug lives on `_locales` with `UNIQUE (slug, locale)`. The admin route resolves either form:

- `/sailor/collections/posts/<uuid>` — canonical, always works
- `/sailor/collections/posts/<slug>` — pretty URL; for localized collections it matches against `_locales.slug`, so `/posts/om-oss` and `/posts/about` are valid sibling URLs for the same item

For your public site, build per-locale URLs from `_locales.slug` and emit `<link rel="alternate" hreflang>` tags pairing each locale's URL with its siblings (standard SEO practice).

---

## 7. Migration & cleanup

**Flipping an existing populated entity to `localized: true`:**

1. Set `localized: true` in the template.
2. Run `npx sailor db:update`.
3. The auto-migrator (`cli/tools/db-i18n-migrator.js`) runs after drizzle-kit's migrations:
   - Emits one `_locales` row per existing main row at `content.defaultLocale`, copying every column that exists on both tables.
   - Re-points child-table FK columns (arrays, files, m2m junctions) from `main.id` → `_locales.id` for every migrated row.
   - Rewrites any legacy `<base>_locales` `taggable_type` rows to the unified `<base>` convention.
   - Idempotent — re-running is a no-op.

**Cleanup after migration:**

Localized main tables keep their content columns (additive emit) so the migration is non-destructive. Once you're satisfied the data lives in `_locales`, run `sailor doctor` to see what's cleanable, and `sailor doctor --fix` to drop the vestigial columns via `ALTER TABLE DROP COLUMN`:

```
$ npx sailor doctor
✗ Localized main tables: vestigial content columns (fixable)
  2 localized main table(s) carry content columns shadowed by _locales
    collection_posts — 7 column(s): title, slug, status, content, ...
    global_faq      — 3 column(s): title, slug, status

$ npx sailor doctor --fix
🗑  collection_posts: dropped "title"
🗑  collection_posts: dropped "slug"
...
```

The fix is opt-in and intentionally separated from `db:update` — drops are destructive in reverse and worth an explicit step.

---

## 8. Limitations & queued follow-ups

- **Flat globals** (`dataType: 'flat'`) aren't localized — open an issue if you have a use case (the core mechanism would work; we deferred to keep v1 scope tight).
- **Core `files` and `tags` tables** stay single-language. Per-usage `alt_override` on file junctions is per-locale already (junction FKs to `_locales.id`); tag selections are per-locale too. What's not yet translatable: file metadata in the media library (`alt`, `title`, `description`) and tag labels themselves. `files_locales` / `tags_locales` are queued.
- **Removing a locale** doesn't auto-purge `_locales` rows for that locale — queued `sailor content:purge-locale <code>` CLI.
- **Staleness indicator** — comparing each translation's `updated_at` against the default-locale row's `updated_at` to flag "may need update" siblings in the locale switcher — queued.
- **Cross-locale revisions UI** — revisions are correctly scoped per translation; the History dialog shows one stream at a time. Per-item history is split across N translations; merging chronologically with locale labels is queued.
- **Public site `hreflang` helper** — consumer-side concern; a small `<HreflangLinks item={...} />` helper is queued.
