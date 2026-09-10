// Client-safe: URL building only, no Node.js imports and no secrets.

import type { FileTransformOptions } from './file';

/**
 * Who resizes images.
 *
 * `local` is the default and the only one that does the work in-process:
 * Sailor resizes with sharp and caches the result. The others hand the job to
 * a service that resizes at the edge, which removes the origin hop, the
 * cold-cache sharp cost, and gets format negotiation Sailor does not do (it
 * emits a fixed format, never AVIF).
 *
 * Every provider here is a pure URL builder with no credential, because
 * `getFileUrl()` runs in the browser: `image.svelte` and `FileField` call it
 * in markup, and consumer sites call `getImage()` from components. A provider
 * that signs URLs, imgproxy or Cloudinary, would leak its key, so supporting
 * one means moving URL building server-side first.
 */
export type ImageTransformProvider = 'local' | 'cloudflare' | 'custom';

export interface ImageTransformConfig {
  provider?: ImageTransformProvider;
  /**
   * `custom` only. Placeholders, all optional: `{url}` (percent-encoded
   * source), `{rawUrl}` (source as-is), `{width}`, `{height}`, `{quality}`,
   * `{format}`, `{fit}`.
   *
   * Unset options resolve to an empty string, so write a template the service
   * tolerates blanks in, or always pass a width at the call site.
   *
   * A template string rather than a function because settings are serialised
   * to JSON when generated, and a function does not survive that.
   */
  url?: string;
}

/**
 * Sharp's fit values do not all exist at the edge, so they are mapped rather
 * than passed through:
 *
 * - `fill` stretches to exact dimensions ignoring aspect ratio, which
 *   Cloudflare cannot do at all. `cover` is the closest: same output box,
 *   cropped instead of distorted.
 * - `inside`/`outside` are sharp's fit-within / fill-beyond pair, which map
 *   onto `contain` and `cover`.
 */
const CLOUDFLARE_FIT: Record<NonNullable<FileTransformOptions['resize']>, string> = {
  cover: 'cover',
  contain: 'contain',
  fill: 'cover',
  inside: 'contain',
  outside: 'cover'
};

/**
 * Only the anchors Cloudflare expresses as a keyword. Compound anchors
 * (`right top`) would need fractional coordinates, and the content-aware ones
 * become `auto`, which is Cloudflare's own saliency detection — the same
 * intent as sharp's `attention`/`entropy`.
 *
 * Anything absent is simply not sent, leaving the service default (centre),
 * which is what those options mean anyway.
 */
const CLOUDFLARE_GRAVITY: Partial<Record<NonNullable<FileTransformOptions['position']>, string>> = {
  top: 'top',
  bottom: 'bottom',
  left: 'left',
  right: 'right',
  attention: 'auto',
  entropy: 'auto'
};

/**
 * The service URL for a transformed image, or `null` to fall through to
 * Sailor's own pipeline.
 *
 * Returning `null` rather than throwing is deliberate: a half-configured
 * provider should degrade to working images served locally, not to broken
 * ones. `local` and any unrecognised value take that path too.
 */
export function buildTransformUrl(
  source: string,
  options: FileTransformOptions,
  config: ImageTransformConfig | undefined
): string | null {
  const provider = config?.provider ?? 'local';
  if (!source || provider === 'local') return null;

  if (provider === 'cloudflare') {
    // Cloudflare Image Resizing: options live in the path and it fetches the
    // origin itself. `format=auto` is the main reason to use it — it
    // negotiates AVIF per request, which the local pipeline cannot.
    const params = [
      options.width ? `width=${options.width}` : null,
      options.height ? `height=${options.height}` : null,
      options.quality ? `quality=${options.quality}` : null,
      options.resize ? `fit=${CLOUDFLARE_FIT[options.resize]}` : null,
      options.position && CLOUDFLARE_GRAVITY[options.position]
        ? `gravity=${CLOUDFLARE_GRAVITY[options.position]}`
        : null,
      `format=${options.format ?? 'auto'}`,
      // Serve the untransformed original if resizing fails, rather than an
      // error page in an <img>. Covers Image Resizing not being enabled on the
      // zone, a source too large to resize, and transient failures.
      //
      // It cannot cover the images not being served through Cloudflare at all:
      // then `/cdn-cgi/image/...` is an ordinary path that reaches the origin
      // and 404s. Nothing in a URL can detect that, so it is a deploy-time
      // check, not a runtime fallback.
      'onerror=redirect'
    ].filter(Boolean);

    // Absolute origin URLs (S3/R2 public buckets) are passed whole; a local
    // path is relative to the zone root, so it loses its leading slash.
    const target = source.startsWith('http') ? source : source.replace(/^\//, '');
    return `/cdn-cgi/image/${params.join(',')}/${target}`;
  }

  if (provider === 'custom') {
    if (!config?.url) return null;
    const values: Record<string, string> = {
      url: encodeURIComponent(source),
      rawUrl: source,
      width: options.width ? String(options.width) : '',
      height: options.height ? String(options.height) : '',
      quality: options.quality ? String(options.quality) : '',
      format: options.format ?? '',
      fit: options.resize ?? ''
    };
    // Replaced in one pass so a value that itself contains a placeholder,
    // a URL with `{width}` in a query string, is not expanded a second time.
    return config.url.replace(/\{(\w+)\}/g, (match, key: string) =>
      key in values ? values[key] : match
    );
  }

  return null;
}
