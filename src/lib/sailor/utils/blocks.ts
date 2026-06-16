import { blockGroupColumns } from '$sailor/generated/block-groups';

// Pure, client-safe block types + guard. These live here (not in
// `utils/data/blocks.ts`, which pulls in `db`) so `.svelte` components can
// discriminate group nodes without dragging server code into the client bundle.

export interface BlockWithRelations {
  id: string;
  // Deliberately generic `string`, not the generated discriminated `BlockTypes`:
  // keeps this client-safe type decoupled from generation and preserves the meta
  // fields below (`collection_id`/`group_id`/`sort`) that `BlockTypes` omits.
  // Consumers narrow at the render boundary via `node as unknown as BlockTypes`;
  // full auto-narrowing is blocked by file fields (typed `string`, loaded as objects).
  blockType: string;
  collection_id: string;
  group_id?: string | null;
  sort: number;
  created_at: Date;
  updated_at: Date;
  [key: string]: any; // Dynamic fields from the block
}

// A group node in the assembled block tree. `_type: 'group'` is the
// discriminator consumers branch on; the normalized config columns are spread
// on directly, and `blocks` holds the ordered child blocks.
export interface BlockGroupNode {
  _type: 'group';
  id: string;
  sort: number;
  blocks: BlockWithRelations[];
  [key: string]: any; // Config columns: layout, columns, gap, …
}

export type BlockOrGroup = BlockWithRelations | BlockGroupNode;

/** Type guard: is this tree node a group container? */
export function isBlockGroup(node: BlockOrGroup): node is BlockGroupNode {
  return (node as BlockGroupNode)?._type === 'group';
}

/**
 * Render aid for block groups — **mechanical, not opinionated**. Maps a group
 * node's configured values onto spreadable `data-*` attributes, derived from
 * your template's `blocks.groups.fields` (via the generated `blockGroupColumns`),
 * so it tracks exactly the fields you define and bakes in **zero** styling.
 *
 * Spread onto your group wrapper and target the attributes from your own CSS —
 * every visual decision (what `gap=4` or `layout=grid` means, responsive
 * stacking, full-bleed) lives in your stylesheet, written once.
 *
 * Underscored keys become hyphenated attrs (`background_color` → `data-background-color`).
 * Empty / null / false values are skipped.
 *
 * @example
 * ```svelte
 * <div class="group" {...blockGroupAttrs(node)}>
 *   {#each node.blocks as b}<MyBlock block={b} />{/each}
 * </div>
 * ```
 * ```css
 * .group[data-layout='grid']  { display: grid; grid-template-columns: repeat(var(--cols, 1), 1fr); }
 * .group[data-layout='flex']  { display: flex; }
 * .group[data-columns='2']    { --cols: 2; }
 * .group[data-gap='4']        { gap: 1rem; }
 * .group[data-padding='large']{ padding: 4rem; }
 * @media (max-width: 640px) { .group { grid-template-columns: 1fr; } }
 * ```
 */
export function blockGroupAttrs(
  group: Record<string, any> | null | undefined
): Record<string, string> {
  const attrs: Record<string, string> = {};
  if (!group) return attrs;
  for (const key of blockGroupColumns) {
    const v = group[key];
    if (v === null || v === undefined || v === '' || v === false) continue;
    attrs[`data-${key.replace(/_/g, '-')}`] = String(v);
  }
  return attrs;
}
