// Shared reactive state that lets a page component publish "I want a History
// button in the admin header" upward to the always-mounted layout. The page
// owns the dialog and restore logic (because they touch local form state); the
// layout owns the button placement (next to PayloadPreview). Set on mount,
// cleared on unmount.

let openHandler = $state<(() => void) | null>(null);
let count = $state(0);

export const headerRevisions = {
  get openHandler() {
    return openHandler;
  },
  get count() {
    return count;
  },
  set(handler: () => void, n: number) {
    openHandler = handler;
    count = n;
  },
  clear() {
    openHandler = null;
    count = 0;
  }
};
