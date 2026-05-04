import { toast as sonnerToast } from 'svelte-sonner';

type AnyToastOptions = Parameters<typeof sonnerToast>[1];

function baseToast(message: string, options: AnyToastOptions = {}) {
  return sonnerToast(message, { duration: options.duration ?? 3000, ...options });
}

baseToast.success = (message: string, options: AnyToastOptions = {}) =>
  sonnerToast.success(message, { duration: options.duration ?? 3000, ...options });

baseToast.error = (message: string, options: AnyToastOptions = {}) =>
  sonnerToast.error(message, { duration: options.duration ?? 3000, ...options });

baseToast.dismiss = (id?: number | string) => sonnerToast.dismiss(id);

export const toast = baseToast as typeof sonnerToast & {
  (message: string, options?: AnyToastOptions): number | string;
  success: (message: string, options?: AnyToastOptions) => number | string;
  error: (message: string, options?: AnyToastOptions) => number | string;
  dismiss: (id?: number | string) => void;
};

type ToastableResult = { success: boolean; message?: string; error?: string };

/**
 * Standard remote-result handler. Toasts `result.message` on success
 * (falling back to `successFn()`) and `result.error` on failure
 * (falling back to `failFn()`). Returns true on success so the caller
 * can branch with `if (toastResult(...))`.
 */
export function toastResult(
  result: ToastableResult,
  successFn: () => string,
  failFn: () => string,
  options?: AnyToastOptions
): boolean {
  if (result.success) {
    toast.success(result.message || successFn(), options);
    return true;
  }
  toast.error(result.error || failFn(), options);
  return false;
}

/**
 * Permission-gate guard. Toasts the message and returns false when
 * `allowed` is false; otherwise returns true. Lets callers write
 * `if (!requirePermission(canX, m.toast_perm_X)) return;`.
 */
export function requirePermission(allowed: boolean, message: () => string): boolean {
  if (!allowed) {
    toast.error(message());
    return false;
  }
  return true;
}
