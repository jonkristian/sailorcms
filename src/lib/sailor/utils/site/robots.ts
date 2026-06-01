// `robots.txt` builder — small enough to hand-roll, but symmetric with
// `generateLocalizedSitemap` so the SEO surface is one consistent shape.
//
// Plugs into `+server.ts`:
//
//   import { generateRobotsTxt } from 'sailorcms/utils/site';
//   import { getSiteSettings } from 'sailorcms/utils/index';
//   export async function GET() {
//     const site = await getSiteSettings();
//     return new Response(
//       generateRobotsTxt({
//         origin: site.siteUrl ?? '',
//         sitemap: '/sitemap.xml',
//         disallow: ['/sailor']
//       }),
//       { headers: { 'Content-Type': 'text/plain' } }
//     );
//   }
//
// Opinionated minimum: no auto-Disallow — `/sailor` is a likely target but
// shouldn't be baked in (multi-site projects may mount it elsewhere; the
// consumer might want a different admin path or none at all). The example
// above is the recipe.

export interface GenerateRobotsTxtOptions {
  /** Absolute origin used to make the `Sitemap:` URL absolute (robots.txt requires absolute URLs for sitemap lines). Trailing slashes are stripped. */
  origin: string;
  /** Sitemap path(s) relative to origin (e.g. `'/sitemap.xml'`) or absolute URL(s). Pass an array for multi-sitemap setups (one `Sitemap:` line per entry). */
  sitemap: string | string[];
  /** Disallow path patterns. Paths only — robots.txt doesn't accept origins here. */
  disallow?: string[];
  /** Allow path patterns. Use when a wider Disallow needs a more-specific carve-out. */
  allow?: string[];
  /** User-agent the rules apply to. Defaults to `'*'` (all crawlers). Pass a different agent string to scope rules, or call the helper twice and concatenate for multi-agent setups. */
  userAgent?: string;
  /** Extra raw lines appended after the rules and before the `Sitemap:` block — useful for `Crawl-delay`, `Host`, or custom directives the named options don't cover. */
  extra?: string[];
}

export function generateRobotsTxt(options: GenerateRobotsTxtOptions): string {
  const { origin, sitemap, disallow, allow, userAgent = '*', extra } = options;
  const lines: string[] = [];

  lines.push(`User-agent: ${userAgent}`);
  if (allow?.length) for (const p of allow) lines.push(`Allow: ${p}`);
  if (disallow?.length) for (const p of disallow) lines.push(`Disallow: ${p}`);
  if (!allow?.length && !disallow?.length) lines.push('Allow: /');
  if (extra?.length) for (const line of extra) lines.push(line);

  lines.push('');

  const base = origin.replace(/\/+$/, '');
  const sitemaps = Array.isArray(sitemap) ? sitemap : [sitemap];
  for (const s of sitemaps) {
    const absolute = /^https?:\/\//i.test(s) ? s : `${base}${s.startsWith('/') ? s : `/${s}`}`;
    lines.push(`Sitemap: ${absolute}`);
  }

  return lines.join('\n') + '\n';
}
