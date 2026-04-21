/**
 * Hook for managing unsaved changes detection and exit warnings
 *
 * Usage:
 * ```typescript
 * import { useUnsavedChanges } from '$lib/hooks/unsaved-changes.svelte';
 *
 * const unsavedChanges = useUnsavedChanges();
 *
 * // Mark form as dirty when user makes changes
 * unsavedChanges.setHasChanges(true);
 *
 * // Clear dirty state when form is saved
 * unsavedChanges.setHasChanges(false);
 * ```
 */

import { browser } from '$app/environment';
import { beforeNavigate } from '$app/navigation';

export function useUnsavedChanges() {
  let hasChanges = $state(false);

  // Native browser prompt for reload / close / external nav
  $effect(() => {
    if (!browser) return;

    const handler = (e: BeforeUnloadEvent) => {
      if (hasChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  });

  // Native confirm() for SvelteKit client-side navigation
  beforeNavigate(({ cancel }) => {
    if (!hasChanges || !browser) return;
    const leave = window.confirm('You have unsaved changes. Leave this page?');
    if (leave) {
      hasChanges = false;
    } else {
      cancel();
    }
  });

  function setHasChanges(value: boolean) {
    hasChanges = value;
  }

  return {
    get hasChanges() {
      return hasChanges;
    },
    setHasChanges
  };
}
