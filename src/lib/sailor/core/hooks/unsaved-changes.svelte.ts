/**
 * Hook for managing unsaved changes detection and exit warnings.
 *
 * Pass a getter that reflects the dirty state — the hook reads it reactively,
 * so callers don't need their own `$effect` to mirror state into a setter.
 *
 * ```ts
 * const unsaved = useUnsavedChanges(
 *   () => Object.keys(userChanges).length > 0 || blocksChanged
 * );
 * // After a successful save, just clear your own state — `userChanges = {}`
 * // — and `hasChanges` will go back to false on next read.
 * ```
 */

import { browser } from '$app/environment';
import { beforeNavigate } from '$app/navigation';
import { m } from '$sailor/i18n';

export function useUnsavedChanges(isDirty: () => boolean = () => false) {
  const hasChanges = $derived(isDirty());

  $effect(() => {
    if (!browser) return;
    const handler = (e: BeforeUnloadEvent) => {
      if (hasChanges) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  });

  // Skip `leave` here — those are tab close / refresh / external nav, where
  // the browser fires its own native localized prompt via `beforeunload`.
  // Confirming here too would double-prompt. We only handle SvelteKit-internal
  // nav (link clicks, goto, popstate, form), where `beforeunload` does not fire.
  beforeNavigate(({ type, cancel }) => {
    if (type === 'leave') return;
    if (!hasChanges || !browser) return;
    if (!window.confirm(m.common_unsaved_changes_prompt())) {
      cancel();
    }
  });

  return {
    get hasChanges() {
      return hasChanges;
    }
  };
}
