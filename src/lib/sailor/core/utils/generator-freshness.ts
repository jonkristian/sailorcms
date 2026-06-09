// Dev-mode generator-drift warning. Walks the consumer's templates/ tree on
// first request, compares the latest mtime against generated/schema.ts. If
// templates are newer, emits a one-shot console.warn pointing at the staleness
// and the remedy (`npx sailor db:update`). No-op in production.
//
// Why a runtime hook (vs vite plugin):
//  - No consumer config patch needed.
//  - Fires when the dev server actually serves a request, which is the same
//    moment a stale-generated bug would surface — same context as the bug.
//  - Idempotent + cached; sub-millisecond after the first call.

import { promises as fs } from 'node:fs';
import path from 'node:path';

let cached = false;

const TEMPLATES_REL = path.join('src', 'lib', 'sailor', 'templates');
const GENERATED_REL = path.join('src', 'lib', 'sailor', 'generated');
const GENERATED_SENTINEL = 'schema.ts';

async function walkLatestMtime(dir: string): Promise<number> {
  let latest = 0;
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const childLatest = await walkLatestMtime(full);
      if (childLatest > latest) latest = childLatest;
      continue;
    }
    if (!entry.isFile()) continue;
    try {
      const stat = await fs.stat(full);
      const t = stat.mtimeMs;
      if (t > latest) latest = t;
    } catch {
      // ignore — a transient race on file removal shouldn't warn
    }
  }
  return latest;
}

/**
 * Check whether `src/lib/sailor/templates/**` is newer than
 * `src/lib/sailor/generated/schema.ts`. Logs once per process; no-op after
 * the first call and no-op when `NODE_ENV === 'production'`. Safe to call
 * from the hot path — internal cache makes subsequent calls cost a flag read.
 */
export async function ensureGeneratedFreshness(): Promise<void> {
  if (cached) return;
  cached = true;
  if (process.env.NODE_ENV === 'production') return;

  const cwd = process.cwd();
  const templatesDir = path.join(cwd, TEMPLATES_REL);
  const sentinelPath = path.join(cwd, GENERATED_REL, GENERATED_SENTINEL);

  let templatesLatest = 0;
  let sentinelMtime = 0;
  try {
    templatesLatest = await walkLatestMtime(templatesDir);
    const stat = await fs.stat(sentinelPath);
    sentinelMtime = stat.mtimeMs;
  } catch {
    // Either templates/ doesn't exist yet (pre-init project) or generated/schema.ts
    // is missing (user needs to run db:update for the first time). Either way,
    // don't second-guess setup-time state.
    return;
  }

  if (templatesLatest === 0 || sentinelMtime === 0) return;
  if (templatesLatest <= sentinelMtime) return;

  // Templates are newer than generated. Surface once.
  const deltaSec = Math.round((templatesLatest - sentinelMtime) / 1000);
  const human =
    deltaSec > 86_400
      ? `${Math.round(deltaSec / 86_400)} day(s)`
      : deltaSec > 3600
        ? `${Math.round(deltaSec / 3600)} hour(s)`
        : deltaSec > 60
          ? `${Math.round(deltaSec / 60)} minute(s)`
          : `${deltaSec} second(s)`;

  console.warn(
    `\n⚠ sailor: templates/ has changed (newer by ~${human}) but generated/ hasn't been regenerated.` +
      `\n  Run \`npx sailor db:update\` to apply your template edits to the schema + types + settings.\n`
  );
}
