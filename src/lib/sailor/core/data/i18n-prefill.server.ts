// Helpers for the localized-prefill path — when a consumer opens a fresh
// translation, the loader returns the default-locale row as a starting
// draft (scalars + per-locale junctions + cloned blocks / nested arrays).
// These rows arrive with their original ids, but the save path uses
// `INSERT OR REPLACE` keyed on row id — so without fresh ids, the cloned
// rows would relocate off the source translation onto the new one (or
// produce surprise duplicates depending on FK shape).
//
// Shared between `collection-item.server.ts` (which has blocks +
// top-level array fields) and `global-item.server.ts` (top-level array
// fields only). Same recursion logic for both.

import { randomUUID } from 'crypto';

/**
 * Recursively assign fresh UUIDs to any nested array-of-row values on an
 * object. Walks plain objects + arrays; primitives / dates / null are
 * left alone. Caller is responsible for assigning the top-level object's
 * id (`obj.id = randomUUID()`).
 *
 * Use on each top-level row returned from the prefill — the function
 * walks INSIDE that row, reassigning ids on every nested array's
 * elements. For a block with a `highlights: [{ id, title }, ...]`
 * nested array, after this call each highlight has a fresh id.
 */
export function reidNestedRows(obj: any): void {
  if (!obj || typeof obj !== 'object') return;
  for (const value of Object.values(obj)) {
    if (!Array.isArray(value)) continue;
    for (const row of value) {
      if (row && typeof row === 'object' && !Array.isArray(row)) {
        (row as any).id = randomUUID();
        reidNestedRows(row);
      }
    }
  }
}
