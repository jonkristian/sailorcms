<script lang="ts">
  import './RevisionsDialog.css';
  import * as Dialog from 'sailorcms/components/ui/dialog/index.js';
  import { Button } from 'sailorcms/components/ui/button/index.js';
  import { History, RotateCcw, ChevronLeft, ChevronRight } from '@lucide/svelte';
  import { diffLines } from 'diff';
  import { formatRelativeTime, formatTimestamp } from 'sailorcms/core/utils/date';
  import { getUserLocale } from 'sailorcms/core/ui/user-locale';
  import { m } from '$sailor/i18n';
  import { highlightJsonSync } from 'sailorcms/core/ui/syntax-highlighting';
  import { toast } from 'sailorcms/core/ui/toast';

  type Revision = {
    id: string;
    /** Row the snapshot writes back into. For localized collections this is
     *  a `_locales` row id (per-translation history); for non-localized,
     *  the main row id. Used to gate restore — only the currently-active
     *  locale's rows are restorable in one click; siblings show but are
     *  disabled with a hint, because writing a `nb-NO` snapshot into the
     *  active `en` row would clobber the wrong content. */
    entity_id: string;
    /** BCP-47 locale of this revision when the entity is localized; `null`
     *  for non-localized collections. When set, the dialog labels the row
     *  with its locale chip and scopes the diff against the latest
     *  same-locale peer (not the cross-locale latest, which would compare
     *  apples to oranges). */
    locale: string | null;
    created_at: Date | string;
    created_by_id: string | null;
    created_by_name: string | null;
    created_by_email: string | null;
    data: Record<string, unknown>;
  };

  // Conditionally mounted by the parent ({#if revisionsDialogOpen}) so each
  // open is a fresh component — index resets to "most recent" automatically
  // and there's no $effect / onOpenChange dance. All payloads are preloaded
  // by the parent's server load, so navigation and diff are zero-fetch.
  let {
    revisions,
    activeLocale = null,
    onClose,
    onRestore
  }: {
    revisions: Revision[];
    /** BCP-47 locale currently being edited in the parent page. When the
     *  selected revision's `locale` doesn't match, the restore button is
     *  disabled — admins switch translations via the editor's existing
     *  locale switcher to restore a sibling. `null` for non-localized
     *  collections (no gating). */
    activeLocale?: string | null;
    onClose: () => void;
    onRestore: (data: Record<string, unknown>) => Promise<boolean | void>;
  } = $props();

  let currentIndex = $state(0);
  let restoring = $state(false);

  const current = $derived<Revision | null>(revisions[currentIndex] ?? null);
  const total = $derived(revisions.length);
  const canGoNewer = $derived(currentIndex > 0);
  const canGoOlder = $derived(currentIndex < total - 1);
  // "Latest" is scoped per-locale on a merged stream so the diff stays
  // meaningful — comparing a `nb-NO` revision to the cross-locale newest
  // would diff a Norwegian payload against an English one. For non-localized
  // (locale === null), behavior is unchanged: peer is revisions[0].
  const latest = $derived<Revision | null>(
    current
      ? current.locale == null
        ? (revisions[0] ?? null)
        : (revisions.find((r) => r.locale === current.locale) ?? null)
      : null
  );
  const isLatest = $derived(!!current && !!latest && current.id === latest.id);
  // Restore writes the snapshot into the currently-active locale's row, so
  // cross-locale restore would clobber the wrong translation. Disable when
  // the selected revision belongs to a different locale; admins switch
  // translations via the editor's locale switcher to restore a sibling.
  const restoreLocaleMismatch = $derived(
    !!current && activeLocale != null && current.locale != null && current.locale !== activeLocale
  );

  // Unified diff lines: when viewing the latest there are no changes so this
  // collapses to a single "unchanged" chunk == plain highlighted source. Any
  // older index produces real add/remove chunks against revisions[0].
  const diffLinesHtml = $derived.by(() => buildDiff(current, latest));

  function goNewer() {
    if (canGoNewer) currentIndex -= 1;
  }
  function goOlder() {
    if (canGoOlder) currentIndex += 1;
  }

  async function handleRestore() {
    if (!current || restoring) return;
    restoring = true;
    try {
      const result = await onRestore(current.data);
      if (result !== false) {
        onClose();
      }
    } catch (err) {
      console.error('Restore failed', err);
      toast.error(m.revisions_restore_failed());
    } finally {
      restoring = false;
    }
  }

  function authorLabel(rev: Revision) {
    return rev.created_by_name || rev.created_by_email || 'Unknown';
  }

  function fullTimestamp(date: Date | string) {
    return formatTimestamp(date, getUserLocale());
  }

  // ---------- Diff rendering ----------

  type DiffLine = {
    kind: 'context' | 'added' | 'removed';
    html: string;
  };

  function pretty(value: unknown): string {
    return JSON.stringify(value, null, 2);
  }

  // Highlight the full text once per side, then split on '\n'. JSON
  // pretty-printed by JSON.stringify never produces tokens that span newlines,
  // so the highlighted spans stay self-contained per line — picking out lines
  // by index is safe.
  function buildDiff(viewing: Revision | null, target: Revision | null): DiffLine[] {
    if (!viewing) return [];
    if (!target || viewing.id === target.id) {
      // No comparison — just plain highlighted source as a single context block.
      const html = highlightJsonSync(viewing.data);
      return html.split('\n').map((line) => ({ kind: 'context', html: line }));
    }

    const oldText = pretty(viewing.data);
    const newText = pretty(target.data);
    const oldHtml = highlightJsonSync(oldText).split('\n');
    const newHtml = highlightJsonSync(newText).split('\n');

    const chunks = diffLines(oldText, newText);
    const out: DiffLine[] = [];
    let oldIdx = 0;
    let newIdx = 0;

    for (const chunk of chunks) {
      // diffLines includes trailing '\n' inside chunk.value — drop the empty
      // tail it produces after splitting so we don't render phantom lines.
      const lines = chunk.value.split('\n');
      if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
      const n = lines.length;

      if (chunk.added) {
        for (let i = 0; i < n; i++) out.push({ kind: 'added', html: newHtml[newIdx + i] ?? '' });
        newIdx += n;
      } else if (chunk.removed) {
        for (let i = 0; i < n; i++) out.push({ kind: 'removed', html: oldHtml[oldIdx + i] ?? '' });
        oldIdx += n;
      } else {
        // Unchanged chunks consume the same lines from both sides.
        for (let i = 0; i < n; i++) out.push({ kind: 'context', html: newHtml[newIdx + i] ?? '' });
        oldIdx += n;
        newIdx += n;
      }
    }

    return out;
  }
</script>

<Dialog.Root open={true} onOpenChange={(next) => !next && onClose()}>
  <Dialog.Content class="flex flex-col sm:max-w-3xl">
    <Dialog.Header>
      <div class="flex items-center gap-3">
        <div class="bg-muted flex h-10 w-10 items-center justify-center rounded-full">
          <History class="h-5 w-5" />
        </div>
        <div class="min-w-0 flex-1">
          <Dialog.Title class="text-left">{m.revisions_history_title()}</Dialog.Title>
          <Dialog.Description class="text-left">
            {#if total === 0}
              {m.revisions_empty()}
            {:else if current}
              {#if current.locale}
                <span
                  class="bg-muted text-foreground/80 mr-1 inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] uppercase"
                  data-locale={current.locale}
                  aria-label={`Locale: ${current.locale}`}>{current.locale}</span
                >
              {/if}
              {fullTimestamp(current.created_at)} · {formatRelativeTime(
                current.created_at,
                getUserLocale()
              )} · by
              {authorLabel(current)}{#if !isLatest}
                · {m.revisions_changes_vs_latest()}{/if}
            {/if}
          </Dialog.Description>
        </div>
      </div>
    </Dialog.Header>

    {#if total > 0 && current}
      <div class="flex items-center justify-between gap-2 border-b pb-2">
        <Button
          variant="ghost"
          size="sm"
          disabled={!canGoOlder || restoring}
          onclick={goOlder}
          aria-label={m.revisions_aria_older()}
        >
          <ChevronLeft class="mr-1 h-4 w-4" />
          {m.revisions_older()}
        </Button>
        <span class="text-muted-foreground text-xs">
          {m.revisions_position({ current: currentIndex + 1, total })}
          {currentIndex === 0 ? m.revisions_latest_marker() : ''}
        </span>
        <Button
          variant="ghost"
          size="sm"
          disabled={!canGoNewer || restoring}
          onclick={goNewer}
          aria-label={m.revisions_aria_newer()}
        >
          {m.revisions_newer()}
          <ChevronRight class="ml-1 h-4 w-4" />
        </Button>
      </div>

      <div class="diff-source bg-muted/40 h-[55vh] shrink-0 overflow-auto rounded-md border">
        <div class="hljs language-json m-0 p-3 font-mono text-xs leading-snug whitespace-pre">
          {#each diffLinesHtml as line, i (i)}<span
              class="diff-line"
              class:added={line.kind === 'added'}
              class:removed={line.kind === 'removed'}>{@html line.html}{'\n'}</span
            >{/each}
        </div>
      </div>
    {:else}
      <div class="text-muted-foreground py-8 text-center text-sm">
        {m.revisions_empty_save_first()}
      </div>
    {/if}

    <Dialog.Footer class="flex gap-2">
      <Button variant="outline" onclick={onClose} disabled={restoring}>{m.common_close()}</Button>
      {#if total > 0 && current && !isLatest}
        {#if restoreLocaleMismatch}
          <span class="text-muted-foreground self-center text-xs"
            >{m.revisions_restore_switch_locale({ locale: current.locale ?? '' })}</span
          >
        {/if}
        <Button onclick={handleRestore} disabled={restoring || restoreLocaleMismatch}>
          {#if restoring}
            <div
              class="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
            ></div>
          {:else}
            <RotateCcw class="mr-1 h-4 w-4" />
          {/if}
          {m.revisions_restore_button()}
        </Button>
      {/if}
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
