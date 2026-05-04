// Sailor admin i18n surface. Compiled by Paraglide on every Vite build from
// `messages/<locale>.json` into `paraglide/`. Components import `m` for
// message lookups and the rest for runtime helpers (locale switching, etc).

export * as m from './paraglide/messages';
export { setLocale, getLocale, locales, baseLocale, type Locale } from './paraglide/runtime';
