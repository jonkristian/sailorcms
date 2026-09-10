<script lang="ts">
  import { onMount, tick } from 'svelte';
  import * as Command from 'sailorcms/components/ui/command/index.js';
  import * as Dialog from 'sailorcms/components/ui/dialog/index.js';
  import { Button } from 'sailorcms/components/ui/button/index.js';
  import { Checkbox } from 'sailorcms/components/ui/checkbox/index.js';
  import {
    Maximize2,
    GripVertical,
    X,
    ChevronLeft,
    ChevronRight,
    ExternalLink
  } from '@lucide/svelte';
  import {
    searchRelationOptions,
    resolveRelationTitles
  } from 'sailorcms/remote/relations.remote.js';
  import { m } from '$sailor/i18n';
  import VerticalList from 'sailorcms/components/sailor/dnd/VerticalList.svelte';
  import {
    useRelationSelection,
    type RelationItem
  } from 'sailorcms/composables/useRelationSelection.svelte.js';

  interface Props {
    value: string | string[];
    field: {
      title?: string;
      label?: string;
      relation?: { type: string; targetGlobal?: string; targetCollection?: string };
    };
    onChange: (value: string[]) => void;
    currentItemId?: string | null;
    readonly?: boolean;
  }

  let { value, field, onChange, currentItemId, readonly = false }: Props = $props();

  const selection = useRelationSelection({
    value: () => value,
    onChange: (ids) => onChange(ids)
  });

  // Sized to the list's visible height rather than to network economy — a
  // fixed-height list with a pager reads better than a long scroll.
  const PAGE_SIZE = 10;

  let available: RelationItem[] = $state([]);
  let loading = $state(false);
  let loaded = $state(false);
  let open = $state(false);
  let search = $state('');
  let total = $state(0);
  let page = $state(0);
  const totalPages = $derived(Math.max(1, Math.ceil(total / PAGE_SIZE)));
  /** Guards against an out-of-order response overwriting a newer search. */
  let requestSeq = 0;
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  let rootEl: HTMLElement | null = $state(null);
  /** Briefly marks the row just attached, so you can see where it landed. */
  let justAdded: string | null = $state(null);
  /**
   * True when this field is already rendered inside a dialog. The detailed view
   * would then be a dialog opened from a dialog — nested focus traps, and an
   * escape key that means two different things. (A container wide enough to
   * split into two columns hides the button too, in CSS — see below.)
   */
  let insideDialog = $state(false);
  let justAddedTimer: ReturnType<typeof setTimeout> | undefined;

  function attachFromCandidates(item: RelationItem) {
    // Decide before toggling: `selection` derives from `value`, which the
    // parent hasn't handed back yet at this point.
    const willAttach = !selection.has(item.id);
    selection.toggle(item);
    if (!willAttach) return;
    justAdded = item.id;
    clearTimeout(justAddedTimer);
    justAddedTimer = setTimeout(() => (justAdded = null), 1400);
  }

  /**
   * cmdk scrolls the newly-selected item into view after any change to the item
   * set (`afterTick` -> `scrollIntoView`), which moves every scrollable element
   * between that item and the document.
   *
   * Only *ancestors* are pinned here, so the surrounding form stays put. Where
   * the candidates land inside the list is then decided deliberately by
   * `revealAvailable` rather than restored — after a page change you want the
   * top of the new page, not wherever you happened to be on the old one.
   */
  function isScrollable(el: HTMLElement): boolean {
    const overflowY = getComputedStyle(el).overflowY;
    return overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay';
  }

  function preserveOuterScroll(): () => void {
    if (typeof document === 'undefined' || !rootEl) return () => {};
    const marks: Array<[HTMLElement, number]> = [];

    // Ancestors: keep the surrounding form still.
    let node: HTMLElement | null = rootEl.parentElement;
    while (node) {
      if (isScrollable(node)) marks.push([node, node.scrollTop]);
      node = node.parentElement;
    }

    const doc = document.scrollingElement as HTMLElement | null;
    const docTop = doc?.scrollTop ?? 0;

    const apply = () => {
      for (const [el, top] of marks) if (el.scrollTop !== top) el.scrollTop = top;
      if (doc && doc.scrollTop !== docTop) doc.scrollTop = docTop;
    };

    // Correcting a single frame after the swap isn't enough: cmdk scrolls again
    // as the selection settles, and a pager button that becomes disabled hands
    // focus back to the body, which scrolls too. Hold the position across a
    // short window instead of guessing which frame to fix.
    return () => {
      const deadline = performance.now() + 300;
      const step = () => {
        apply();
        if (performance.now() < deadline) requestAnimationFrame(step);
      };
      step();
    };
  }

  /**
   * Return the candidate list to its top after a page change — you want the
   * first row of the new page, not wherever you left off on the old one. The
   * list is its own scroll box in both layouts, so this is the whole job.
   */
  function revealAvailable() {
    const list = rootEl?.querySelector('[data-relation-list]') as HTMLElement | null;
    if (!list || list.scrollHeight <= list.clientHeight) return;
    list.scrollTo({
      top: 0,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    });
  }

  // Two columns only when there is an attached group to put beside the
  // candidates — otherwise the single group would sit in a half-width column
  // with dead space next to it. Driven by container width, so a field in a
  // narrow sidebar stacks even on a wide screen.
  const twoCol = $derived(selection.items.length > 0);
  // Attached entries are deliberately *not* filtered out of the candidate list.
  // Removing a row the moment it is clicked reflows everything under the
  // pointer and loses your place; leaving it dimmed keeps the list stable. It
  // also means a page renders a full `PAGE_SIZE` rather than however many rows
  // survived a filter.

  // Fetched from a lifecycle hook and event handlers rather than an $effect —
  // these are one-shot loads, not subscriptions to reactive state.
  onMount(() => {
    insideDialog = Boolean(rootEl?.closest('[role="dialog"]'));
    // A saved value is bare ids, so the attached pane needs labels for exactly
    // those — independent of whichever page of options is on screen.
    void hydrateAttachedTitles();
    void ensureLoaded();
  });

  async function hydrateAttachedTitles() {
    const ids = selection.items.filter((item) => item.title === item.id).map((item) => item.id);
    if (ids.length === 0 || !field.relation) return;
    const result = await resolveRelationTitles({ target: field.relation, ids });
    if (result.success) selection.learnTitles(result.items as RelationItem[]);
  }

  async function fetchPage(term: string, pageIndex: number) {
    if (!field.relation) return;
    const seq = ++requestSeq;
    loading = true;
    try {
      const result = await searchRelationOptions({
        target: field.relation,
        search: term,
        limit: PAGE_SIZE,
        offset: pageIndex * PAGE_SIZE,
        excludeId: currentItemId ?? undefined
      });
      // A slower earlier request must not clobber a newer one.
      if (seq !== requestSeq) return;
      if (result.success) {
        const restoreScroll = preserveOuterScroll();
        const items = (result.items || []) as RelationItem[];
        available = items;
        total = result.total ?? items.length;
        page = pageIndex;
        selection.learnTitles(items);
        loaded = true;
        // Starts once the new items are in the DOM; it holds from there.
        void tick().then(() => {
          restoreScroll();
          // cmdk selects the first item and scrolls it into view in its own
          // `afterTick`, which lands just below this group's heading. Two frames
          // puts the reveal after that, or it simply gets overridden.
          requestAnimationFrame(() => requestAnimationFrame(revealAvailable));
        });
      }
    } catch {
      if (seq === requestSeq) available = [];
    } finally {
      if (seq === requestSeq) loading = false;
    }
  }

  async function ensureLoaded() {
    if (loaded || loading) return;
    await fetchPage(search, 0);
  }

  function goToPage(next: number) {
    if (loading || next < 0 || next > totalPages - 1) return;
    void fetchPage(search, next);
  }

  function onSearchInput(term: string) {
    search = term;
    clearTimeout(searchTimer);
    // A new query invalidates the current page position.
    searchTimer = setTimeout(() => void fetchPage(term, 0), 200);
  }

  /**
   * The attached item's own edit page, or null when it has none.
   *
   * A relation can target a collection or a global, and those live at different
   * routes; a block target has no standalone editor at all, so it gets no link
   * rather than a broken one.
   */
  function editHref(id: string): string | null {
    const relation = field.relation;
    if (relation?.targetCollection) return `/sailor/collections/${relation.targetCollection}/${id}`;
    if (relation?.targetGlobal) return `/sailor/globals/${relation.targetGlobal}/${id}`;
    return null;
  }

  function openDialog() {
    open = true;
    void ensureLoaded();
  }
</script>

{#snippet pager()}
  <div class="flex items-center gap-1">
    <Button
      type="button"
      variant="ghost"
      size="icon"
      class="h-7 w-7"
      disabled={loading || page === 0}
      onclick={() => goToPage(page - 1)}
      aria-label={m.relation_browser_previous_page()}
    >
      <ChevronLeft class="h-4 w-4" />
    </Button>
    <span class="text-muted-foreground min-w-10 text-center text-xs tabular-nums">
      {page + 1}/{totalPages}
    </span>
    <Button
      type="button"
      variant="ghost"
      size="icon"
      class="h-7 w-7"
      disabled={loading || page >= totalPages - 1}
      onclick={() => goToPage(page + 1)}
      aria-label={m.relation_browser_next_page()}
    >
      <ChevronRight class="h-4 w-4" />
    </Button>
  </div>
{/snippet}

<!-- The split lives on the root, not inside the list: the search box and the
     pager act on the candidates and nothing else, so they belong in that
     column. The attached side is a separate pane beside it. -->
{#snippet browser(listMax: string, showExpand: boolean)}
  <Command.Root
    shouldFilter={false}
    class="border-input bg-input-bg overflow-hidden rounded-lg border p-0 {twoCol
      ? '@md:grid @md:grid-cols-2'
      : ''}"
  >
    <div class="flex min-w-0 flex-col">
      <Command.Input
        value={search}
        oninput={(e) => onSearchInput((e.currentTarget as HTMLInputElement).value)}
        placeholder={m.relation_search_placeholder()}
      />
      <Command.List data-relation-list class={listMax}>
        {#if loading && available.length === 0}
          <Command.Empty>{m.relation_loading_items()}</Command.Empty>
        {:else if available.length === 0}
          <Command.Empty>{m.relation_no_items_found()}</Command.Empty>
        {:else}
          <!-- Visual-hidden once the panes split: the checkboxes already say
               which column this is, and unlike the attached side there is no
               count to carry. Kept for screen readers, where the distinction
               is otherwise only implied by layout. `px-3` lines it up with the
               items — the group adds `p-1` and each item `px-2`. -->
          <div class="text-muted-foreground px-3 py-1.5 text-xs font-medium @md:sr-only">
            {m.relation_browser_available()}
          </div>
          <Command.Group>
            {#each available as item (item.id)}
              <Command.Item
                value={item.id}
                disabled={readonly}
                onSelect={() => !readonly && attachFromCandidates(item)}
                class="cursor-pointer transition-opacity {selection.has(item.id)
                  ? 'opacity-45'
                  : ''}"
              >
                <!-- Decorative: the row owns the click, so the checkbox must not
                     take focus or handle its own. It reflects attachment and
                     keeps labels aligned with the handles in the other column. -->
                <Checkbox
                  checked={selection.has(item.id)}
                  tabindex={-1}
                  aria-hidden="true"
                  class="pointer-events-none mr-2 shrink-0"
                />
                <span class="truncate">{item.title}</span>
              </Command.Item>
            {/each}
          </Command.Group>
        {/if}
      </Command.List>

      <!-- Symmetric outer columns so the pager stays centred in this column
           whether or not the expand button is beside it. -->
      <div class="border-border grid grid-cols-[1fr_auto_1fr] items-center border-t p-1">
        <span></span>
        {@render pager()}
        {#if showExpand}
          <!-- Once the container is wide enough to split, the detailed view is
               these same two columns in a bigger box — nothing left to add. -->
          <div class="flex justify-end @md:hidden">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              class="text-muted-foreground h-7 w-7"
              onclick={openDialog}
              title={m.relation_browser_detailed_view()}
              aria-label={m.relation_browser_detailed_view()}
            >
              <Maximize2 class="h-3.5 w-3.5" />
            </Button>
          </div>
        {/if}
      </div>
    </div>

    {#if selection.items.length > 0}
      <!-- Deliberately not a `Command.Group`: cmdk re-selects the first item on
           every change to the item set (with `shouldFilter={false}` that is
           unconditional), which made adding something flash the top of this
           column. This is an editable ordered list, not a command list — it has
           its own handles and buttons for keyboard use. -->
      <!-- Stacked, this pane comes first: what is attached is the state being
           edited, and leaving it under a full page of candidates and a pager
           put it off-screen in a narrow sidebar. Side by side the DOM order is
           the column order, so the override is dropped at `@md` — which is also
           why the panes are authored candidates-first. Stacked, the divider
           belongs on the bottom edge instead of the top. -->
      <div
        class="border-border order-first min-w-0 border-b @md:relative @md:order-none @md:border-b-0 @md:border-l"
      >
        <div
          class="text-muted-foreground flex items-center px-3 py-1.5 text-xs font-medium @md:h-9 @md:py-0 @md:pt-1"
        >
          {m.relation_browser_selected({ count: selection.items.length })}
        </div>
        <!-- Side by side the candidate column sets the row height — it is
             always exactly one page — and this content is taken out of that
             calculation so a long attached list cannot stretch the box. The
             wrapper still stretches to the row (grid items stretch by default),
             giving the inner box a height to scroll within. -->
        <div
          class="max-h-64 overflow-y-auto p-1 @md:absolute @md:inset-x-0 @md:top-9 @md:bottom-0 @md:max-h-none"
        >
          <VerticalList
            items={selection.items}
            onItemsChange={(next) => selection.reorder(next as RelationItem[])}
          >
            {#snippet children({
              item,
              dragHandleAttributes
            }: {
              item: RelationItem;
              dragHandleAttributes: Record<string, any>;
            })}
              <div
                class="text-foreground flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors duration-500 {justAdded ===
                item.id
                  ? 'bg-primary/15'
                  : ''}"
              >
                <span
                  {...dragHandleAttributes}
                  title={m.relation_drag_to_reorder()}
                  class="shrink-0"
                >
                  <GripVertical class="text-muted-foreground h-4 w-4" aria-hidden="true" />
                </span>
                <span class="min-w-0 flex-1 truncate">{item.title}</span>
                {#if editHref(item.id)}
                  <!-- New tab deliberately: the surrounding form usually has
                       unsaved changes, and navigating away from it to look
                       something up would lose them. -->
                  <a
                    href={editHref(item.id)}
                    target="_blank"
                    rel="noopener"
                    onclick={(e) => e.stopPropagation()}
                    draggable="false"
                    class="text-muted-foreground hover:text-foreground focus-visible:ring-ring shrink-0 rounded transition-colors focus-visible:ring-2 focus-visible:outline-none"
                    title={m.relation_open_in_new_tab()}
                    aria-label={m.relation_open_in_new_tab()}
                  >
                    <ExternalLink class="h-3.5 w-3.5" />
                  </a>
                {/if}
                {#if !readonly}
                  <button
                    type="button"
                    draggable="false"
                    onclick={() => selection.remove(item.id)}
                    class="text-muted-foreground hover:text-destructive focus-visible:ring-ring shrink-0 rounded transition-colors focus-visible:ring-2 focus-visible:outline-none"
                    aria-label={m.relation_browser_remove()}
                  >
                    <X class="h-3.5 w-3.5" />
                  </button>
                {/if}
              </div>
            {/snippet}
          </VerticalList>
        </div>
      </div>
    {/if}
  </Command.Root>
{/snippet}

<!-- Inline: stacks in a narrow container, splits into two panes once there is
     room. The detailed view is the same list given a wider, taller box, so the
     container query turns it into two panes without a second layout. -->
<div class="@container" bind:this={rootEl}>
  <!-- Floor equal to the cap: a page of `PAGE_SIZE` rows always exceeds it, so
       the box is a fixed height and stops collapsing when a search narrows the
       list to one row and springing back when it is cleared. -->
  {@render browser('max-h-72 min-h-72', !insideDialog)}
</div>

<Dialog.Root bind:open>
  <!-- The built-in close is positioned `absolute top-2 right-2`, so it can never
       sit on the header's baseline. Opt out and put both controls in the row
       instead, where they align to each other. -->
  <Dialog.Content showCloseButton={false} class="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
    <Dialog.Header class="flex-row items-center gap-2 space-y-0">
      <Dialog.Title class="min-w-0 flex-1 truncate">{field.label || field.title}</Dialog.Title>
      <!-- Dismiss only. Edits are already in the parent form by this point —
           they persist when the surrounding editor is saved, not here. -->
      <Button type="button" size="sm" class="shrink-0" onclick={() => (open = false)}>
        {m.relation_browser_done()}
      </Button>
      <Dialog.Close>
        {#snippet child({ props }: { props: Record<string, any> })}
          <Button
            {...props}
            variant="ghost"
            size="icon-sm"
            class="shrink-0"
            aria-label={m.common_close()}
          >
            <X class="h-4 w-4" />
          </Button>
        {/snippet}
      </Dialog.Close>
    </Dialog.Header>
    <div class="@container">
      {@render browser('max-h-[55vh] min-h-72', false)}
    </div>
  </Dialog.Content>
</Dialog.Root>
