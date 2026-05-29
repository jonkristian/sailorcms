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
    i18n: {
      locales: ['en', 'nb-NO'], // BCP-47 codes for available content locales
      default: 'en', // used for prefill, fallback, migration backfill
      fallback: 'default' // 'default' | 'strict' — see §5
    }
  }
};
```

- If `content.i18n.locales` is unset, Paraglide's `locales` are used.
- If `content.i18n.default` is unset, Paraglide's `baseLocale` is used.
- Adding a locale to `content.i18n.locales` is a settings change only — no schema migration. Existing items gain support for the new locale; editors translate one at a time, prefilled from the default.
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

If `locale` is unset, `content.i18n.default` from settings is used.

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
   - Emits one `_locales` row per existing main row at `content.i18n.default`, copying every column that exists on both tables.
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

## 8. Path-prefix routing recipe (public site)

**Recommended shape: default locale at root, others prefixed.** Existing URLs (`/about`, `/blog/post-1`) keep serving the default locale unchanged; non-default locales live under their own prefix (`/no/about`, `/no/blog/post-1`). This is the SEO-safe shape for an established site flipping to localized — no mass URL change, no broken backlinks, no redirect storm. Greenfield projects benefit too: the default locale gets the cleanest URLs.

> Avoid symmetric `/en/...` + `/no/...` (every locale prefixed). On established sites it rewrites every URL → 301-redirect chains, broken backlinks, search rankings reset. The asymmetric shape below is the default this guide documents.

### Settings — URL aliases (optional)

Content codes follow BCP-47 (`'nb-NO'`); URL aliases let the public site use friendlier segments (`'no'`):

```ts
// templates/settings.ts
content: {
  i18n: {
    locales: ['en', 'nb-NO'],
    default: 'en',
    fallback: 'default',
    urlAliases: { 'nb-NO': 'no' } // optional; defaults to BCP-47 codes
  }
}
```

With this, `getUrlLangs()` returns `['en', 'no']`, `urlToContentLocale('no')` returns `'nb-NO'`, and `contentToUrlLang('nb-NO')` returns `'no'`. Locales without an alias use their BCP-47 code unchanged.

### Param matcher — accept non-default URL forms only

```ts
// src/params/lang.ts
import type { ParamMatcher } from '@sveltejs/kit';
// IMPORTANT: import from `sailorcms/utils/i18n`, not `sailorcms/utils/data`.
// Param matchers ship to the client too; the data/ entry pulls in `db` (→ dotenv → process)
// which crashes in the browser. `utils/i18n` is the pure, client-safe helper module.
import { urlToContentLocale, contentToUrlLang, getDefaultLocale } from 'sailorcms/utils/i18n';

const defaultUrlLang = contentToUrlLang(getDefaultLocale());

export const match: ParamMatcher = (param) => {
  if (param === defaultUrlLang) return false; // default serves at root, not /en/...
  return urlToContentLocale(param) !== null;
};
```

Refusing the default's URL form here keeps `/about` as the only valid URL for default-locale pages and prevents `/en/about` from quietly serving duplicate content (search engines penalize that).

### Route layout — optional `[[lang]]` segment

Use SvelteKit's optional matched-param `[[lang=lang]]` so each page is written once and matches both default-at-root and non-default-prefixed:

```
src/routes/(site)/
  [[lang=lang]]/
    +layout.server.ts        ← resolve content locale once
    +layout.svelte           ← language switcher lives here
    +page.server.ts          ← home (handles / and /no/)
    about/+page.server.ts    ← /about and /no/about
    blog/[slug]/+page.server.ts
```

`/about` → `params.lang === undefined` (default locale); `/no/about` → `params.lang === 'no'`.

### Hook — stamp `<html lang>` + `event.locals.contentLocale`

```ts
// src/hooks.server.ts
import { type Handle } from '@sveltejs/kit';
import { handleSailorHooks } from 'sailorcms/core/hooks/sailor-hooks';
import { urlToContentLocale, getContentSettings } from 'sailorcms/utils/data';

export const handle: Handle = ({ event, resolve }) =>
  handleSailorHooks(event, resolve, {
    resolveContentLocale: (event) => {
      // Skip admin tree — paraglide handles its own locale there.
      if (event.url.pathname.startsWith('/sailor')) return null;
      const seg = event.url.pathname.split('/')[1];
      // No prefix → default locale. Recognized prefix → non-default.
      // Unrecognized first segment → still default (route is at root,
      // first segment is something else like 'about').
      return urlToContentLocale(seg) ?? getContentSettings().defaultLocale ?? null;
    }
  });
```

Result: `event.locals.contentLocale` is always set on public routes, and `<html lang="...">` is rewritten to the BCP-47 form for SEO / screen readers on the initial HTML response.

### TypeScript: ship sailor's `App.Locals` augmentation

So `event.locals.user` / `.security` / `.contentLocale` are typed in every load function without manual repetition, reference sailor's bundled augmentation from your project's `src/app.d.ts`:

```ts
// src/app.d.ts
/// <reference types="sailorcms/app" />
export {};
```

That's the whole file (or add to your existing one). Sailor's `app.d.ts` declares the `App.Locals` shape sailor's hooks stamp.

### Loader — read locale from `[[lang]]` or fall back to default

```ts
// src/routes/(site)/[[lang=lang]]/pages/[slug]/+page.server.ts
import {
  getCollections,
  urlToContentLocale,
  getDefaultLocale,
  dependsOnContentLocale
} from 'sailorcms/utils/data';

export const load = async (event) => {
  // Subscribe this load to "content locale changed" — SvelteKit re-runs it
  // when navigating between locale prefixes (e.g. `/about` → `/no/about`).
  // Replaces the historical `void event.params.lang;` workaround.
  dependsOnContentLocale(event);

  const locale = (event.params.lang && urlToContentLocale(event.params.lang)) ?? getDefaultLocale();
  const page = await getCollections('pages', {
    itemSlug: event.params.slug,
    locale,
    includeTranslations: true // for the language switcher below
  });
  return { page, locale };
};
```

> Note: until an "implicit locale via `event.locals.contentLocale`" pickup lands in `getCollections`, the `locale` arg has to be threaded explicitly. The hook above stamps `event.locals.contentLocale` so you can also read it from there if you prefer.

### SPA navigation: keep `<html lang>` in sync

`<html lang>` is on the static document — Sailor's `transformPageChunk` only fires on full page loads, so client-side navigation between locales doesn't update it. Add this to the localized layout so the attribute tracks `data.locale` on SPA nav too:

```svelte
<!-- src/routes/(site)/[[lang=lang]]/+layout.svelte -->
<svelte:html lang={data.locale} />
```

`<svelte:html>` (Svelte 5+) lets you set attributes on the document's `<html>` element from inside the app tree. Reactive — no `$effect` needed.

### Language switcher — omits prefix for the default locale

```svelte
<!-- src/routes/(site)/[[lang=lang]]/+layout.svelte -->
<script>
  import { page } from '$app/state';
  import LanguageSwitcher from 'sailorcms/components/sailor/site/LanguageSwitcher.svelte';
  // Use `utils/i18n` (client-safe) — `utils/data` would drag in db/dotenv.
  import {
    extractTranslations,
    getContentLocales,
    getContentSettings,
    getDefaultLocale,
    urlToContentLocale,
    watchContentLocale
  } from 'sailorcms/utils/i18n';

  let { data, children } = $props();
  const locales = getContentLocales();
  const { urlAliases } = getContentSettings();
  const defaultLocale = getDefaultLocale();

  // Bridges server-side initial-load `<html lang>` (set via transformPageChunk
  // in handleSailorHooks) with client-side SPA nav: updates document.documentElement.lang
  // AND invalidates `CONTENT_LOCALE_DEP` on locale-prefix change. Loaders that
  // call `dependsOnContentLocale(event)` will re-run.
  watchContentLocale((pathname) => {
    const seg = pathname.split('/')[1];
    return urlToContentLocale(seg) ?? defaultLocale;
  });

  // Walks `page.data` to find the first `translations` array (handles the
  // `data.page.translations` / `data.post.translations` / `data.home.translations`
  // variations from different route loaders). Returns `[]` when none — switcher
  // renders the locale chips in "all missing" state, which `hideIfNoTranslations`
  // can hide entirely if you prefer.
  const translations = $derived(extractTranslations(page.data));
</script>

<LanguageSwitcher
  {translations}
  currentLocale={data.locale}
  {locales}
  {urlAliases}
  {defaultLocale}
  routeShape="flat"
/>

{@render children?.()}
```

`routeShape="flat"` tells the switcher to auto-detect the current section from `page.url.pathname` and compute hrefs via `buildLocaleHref` internally — no `buildHref` callback needed for `/[section]/[slug]` URLs. For nested sections or custom URL shapes, leave `routeShape` unset and pass `buildHref` directly.

### Paginated-list `baseUrl`

For paginated reads (`getCollections('posts', { baseUrl, limit, currentPage })`), the same `buildLocaleHref` helper drops in — pass `translation: null` to get just the section-root URL with the correct locale prefix:

```ts
import { buildLocaleHref, getDefaultLocale } from 'sailorcms/utils/i18n';

const locale = ...; // resolved earlier in the loader
const baseUrl = buildLocaleHref({
  locale,
  translation: null,
  section: 'blog',
  defaultLocale: getDefaultLocale()
});
// Yields '/blog' for default locale, '/no/blog' for non-default. No hand-rolled
// `locale === defaultLocale ? '/blog' : '/${urlLang}/blog'` ternary.

const result = await getCollections('posts', { limit: 10, currentPage: 1, baseUrl, locale });
```

`buildHref`'s third arg (`urlLang`) is the URL form (alias applied). The first arg (`locale`) stays BCP-47. `translation` is the row from `includeTranslations: true` — present means a real translation exists; `null` means missing (consumer decides whether to omit, link to home, or render a disabled chip).

### What this gives you

- Existing URLs unchanged when flipping `localized: true` — SEO-safe migration path for established sites.
- One settings block defines locales + URL form.
- One matcher + one hook + one switcher.
- Per-page route file is written once via `[[lang=lang]]`; default-locale URLs stay at root.
- `<html lang>` correct on every public page automatically.
- Switcher deep-links to the per-locale slug when translations exist, falls back to the locale's home when they don't.

---

## 9. Limitations & queued follow-ups

- **Flat globals** (`dataType: 'flat'`) aren't localized — open an issue if you have a use case (the core mechanism would work; we deferred to keep v1 scope tight).
- **Core `files` and `tags` tables** stay single-language. Per-usage `alt_override` on file junctions is per-locale already (junction FKs to `_locales.id`); tag selections are per-locale too. What's not yet translatable: file metadata in the media library (`alt`, `title`, `description`) and tag labels themselves. `files_locales` / `tags_locales` are queued.
- **Removing a locale** doesn't auto-purge `_locales` rows for that locale — queued `sailor content:purge-locale <code>` CLI.
- **Staleness indicator** — comparing each translation's `updated_at` against the default-locale row's `updated_at` to flag "may need update" siblings in the locale switcher — queued.
- **Cross-locale revisions UI** — revisions are correctly scoped per translation; the History dialog shows one stream at a time. Per-item history is split across N translations; merging chronologically with locale labels is queued.
- **`<HreflangLinks item={...} />` helper** — wraps `includeTranslations` + `contentToUrlLang` into ready-to-paste `<link rel="alternate" hreflang>` markup for `<svelte:head>`. Queued.
- **Implicit locale pickup in `getCollections` / `getGlobals`** — today the `locale` arg has to be threaded through every loader. A `getCollectionsFor(event, slug, options)` variant that reads `event.locals.contentLocale` is queued; the existing signatures stay unchanged for backward compat.
