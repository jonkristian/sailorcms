// Editor-side helpers for block grouping. Translate between the admin's
// `blocks` + `blockGroups` state and the single flat list the nestable DnD
// (`dnd/NestedList.svelte`) consumes, where a block's `parent_id` is its group id.
//
// Grouping is one level deep: groups are always roots; blocks are either roots
// (group_id null) or children of a group. Sibling order is the array order; the
// numeric `sort` is derived from position on the way back out.

import type { FlatItem } from 'sailorcms/components/sailor/dnd/types';
import { blockGroupColumns, blockGroupFields } from '$sailor/generated/block-groups';

export interface EditorBlock {
  id: string;
  blockType: string;
  content: Record<string, any>;
  sort: number;
  group_id?: string | null;
  blockSchema?: any;
}

export interface EditorGroup {
  id: string;
  sort: number;
  [config: string]: any;
}

// The group config column names come from the generated field definitions
// (settings.ts blocks.groups → block_groups columns), so adding/removing a
// group setting flows through automatically.
export const GROUP_CONFIG_COLUMNS = blockGroupColumns;

/**
 * Merge blocks + groups into one ordered flat list for the DnD. Root items
 * (groups and ungrouped blocks) are interleaved by `sort`; each group's child
 * blocks (ordered by `sort`) follow immediately after it so the tree the DnD
 * derives matches the intended display order.
 */
export function toDndItems(
  blocks: EditorBlock[],
  groups: EditorGroup[],
  availableBlocks: { slug: string; name: string }[] = []
): FlatItem[] {
  const blockName = (slug: string) => availableBlocks.find((b) => b.slug === slug)?.name || slug;

  const groupItems: FlatItem[] = (groups || []).map((g) => ({
    ...g,
    id: g.id,
    kind: 'group',
    parent_id: null,
    sort: g.sort ?? 0
  }));

  const blockItems: FlatItem[] = (blocks || []).map((b) => ({
    id: b.id,
    kind: 'block',
    parent_id: b.group_id ?? null,
    name: blockName(b.blockType),
    description: b.content?.title || '',
    sort: b.sort ?? 0,
    blockType: b.blockType,
    content: b.content,
    blockSchema: b.blockSchema
  }));

  // Roots in sort order, then graft each group's children right after it.
  const childrenByGroup = new Map<string, FlatItem[]>();
  const rootBlocks: FlatItem[] = [];
  for (const item of blockItems) {
    if (item.parent_id) {
      const arr = childrenByGroup.get(item.parent_id) || [];
      arr.push(item);
      childrenByGroup.set(item.parent_id, arr);
    } else {
      rootBlocks.push(item);
    }
  }

  const roots = [...groupItems, ...rootBlocks].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));

  const ordered: FlatItem[] = [];
  for (const root of roots) {
    ordered.push(root);
    if (root.kind === 'group') {
      const kids = (childrenByGroup.get(root.id) || []).sort(
        (a, b) => (a.sort ?? 0) - (b.sort ?? 0)
      );
      ordered.push(...kids);
    }
  }
  return ordered;
}

/**
 * Split a DnD flat list (array order = display order, `parent_id` = containing
 * group) back into blocks and groups. `sort` is re-derived from position: root
 * items (groups + ungrouped blocks) share one sequence; each group's children
 * get their own. Previous arrays are merged by id so fields the FlatItem omits
 * are preserved.
 */
export function fromDndItems(
  items: FlatItem[],
  prevBlocks: EditorBlock[],
  prevGroups: EditorGroup[]
): { blocks: EditorBlock[]; groups: EditorGroup[] } {
  const prevBlockById = new Map(prevBlocks.map((b) => [b.id, b]));
  const prevGroupById = new Map(prevGroups.map((g) => [g.id, g]));

  const blocks: EditorBlock[] = [];
  const groups: EditorGroup[] = [];

  let rootSort = 0;
  const childSort = new Map<string, number>();

  for (const item of items) {
    if (item.kind === 'group') {
      const prev = prevGroupById.get(item.id) || ({ id: item.id } as EditorGroup);
      groups.push({ ...prev, ...item, id: item.id, sort: rootSort++ });
    } else {
      const prev = prevBlockById.get(item.id);
      const parentId = item.parent_id || null;
      let sort: number;
      if (parentId) {
        sort = childSort.get(parentId) ?? 0;
        childSort.set(parentId, sort + 1);
      } else {
        sort = rootSort++;
      }
      blocks.push({
        id: item.id,
        blockType: item.blockType ?? prev?.blockType,
        content: item.content ?? prev?.content ?? {},
        blockSchema: item.blockSchema ?? prev?.blockSchema,
        group_id: parentId,
        sort
      });
    }
  }

  return { blocks, groups };
}

/** Reshape the loader's `blockGroups` rows into editor group state. */
export function buildGroupsFromPage(page: any): EditorGroup[] {
  return (page?.blockGroups || []).map((g: any) => ({ ...g }));
}

/** A fresh group placed after everything currently at root, seeded with each
 *  template field's `default` value (if any). */
export function makeGroup(sort: number): EditorGroup {
  const group: EditorGroup = { id: crypto.randomUUID(), sort };
  for (const [key, def] of Object.entries(blockGroupFields)) {
    if ((def as any)?.default !== undefined) group[key] = (def as any).default;
  }
  return group;
}

/** Build the save payload for groups: id, sort, and whitelisted config columns. */
export function groupsToPayload(groups: EditorGroup[]): Record<string, any>[] {
  return (groups || []).map((g) => {
    const out: Record<string, any> = { id: g.id, sort: g.sort ?? 0 };
    for (const col of GROUP_CONFIG_COLUMNS) {
      if (g[col] !== undefined) out[col] = g[col];
    }
    return out;
  });
}
