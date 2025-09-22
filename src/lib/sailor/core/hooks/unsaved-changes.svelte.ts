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
import { beforeNavigate, goto } from '$app/navigation';

export function useUnsavedChanges() {
  let hasChanges = $state(false);
  let showDialog = $state(false);
  let pendingNavigation: (() => void) | null = null;
  let beforeUnloadHandler: ((e: BeforeUnloadEvent) => void) | null = null;
  let isHandlingNavigation = $state(false); // Track if we're already handling navigation

  // Handle browser navigation (back button, close tab, etc.)
  $effect(() => {
    if (!browser) return;

    beforeUnloadHandler = (e: BeforeUnloadEvent) => {
      // Only show native dialog if our custom dialog is not already shown or being handled
      if (hasChanges && !showDialog && !isHandlingNavigation) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        return 'You have unsaved changes. Are you sure you want to leave?';
      }
    };

    window.addEventListener('beforeunload', beforeUnloadHandler);

    return () => {
      if (beforeUnloadHandler) {
        window.removeEventListener('beforeunload', beforeUnloadHandler);
      }
    };
  });

  // Handle SvelteKit navigation
  beforeNavigate(({ cancel, to }) => {
    if (hasChanges && browser) {
      cancel();

      // Mark that we're handling navigation to prevent double dialogs
      isHandlingNavigation = true;

      // Store the navigation function to be called if user confirms
      pendingNavigation = () => {
        hasChanges = false;
        isHandlingNavigation = false;
        // Use SvelteKit's proper navigation
        if (to) {
          goto(to.url.href);
        } else {
          history.back();
        }
      };

      showDialog = true;
    }
  });

  function setHasChanges(value: boolean) {
    hasChanges = value;
  }

  function confirmExit() {
    showDialog = false;
    if (pendingNavigation) {
      pendingNavigation();
      pendingNavigation = null;
    }
  }

  function cancelExit() {
    showDialog = false;
    isHandlingNavigation = false;
    pendingNavigation = null;
  }

  return {
    get hasChanges() {
      return hasChanges;
    },
    get showDialog() {
      return showDialog;
    },
    set showDialog(value: boolean) {
      showDialog = value;
    },
    setHasChanges,
    confirmExit,
    cancelExit
  };
}
